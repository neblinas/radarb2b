-- Radar B2B — Sales Autopilot: inbound e IA (FASE 4).
-- Run once in Supabase SQL Editor as project owner.
--
--   * conversations         — thread por contacto (prospect/cliente)
--   * inbound_messages      — respostas recebidas (webhook Resend ou IMAP)
--   * reply_classifications — classificação determinística/IA de cada resposta
--   * ai_usage             — controlo de custo de IA (tokens por dia/modelo)
--
-- O parsing/classificação determinístico corre sempre (sem IA). A IA é opcional
-- e só é usada quando `autopilot_ai_enabled` e há chave configurada.

-- ---------------------------------------------------------------------------
-- 1. Conversas (thread)
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid references public.sales_prospects(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  client_user_id uuid references auth.users(id) on delete set null,
  contact_email text not null,
  subject text,
  status text not null default 'open' check (status in ('open', 'waiting', 'closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, contact_email)
);

create index if not exists conversations_prospect_idx on public.conversations (prospect_id);

-- ---------------------------------------------------------------------------
-- 2. Mensagens recebidas (inbound)
-- ---------------------------------------------------------------------------
create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id text,                          -- Message-ID do header (dedup)
  in_reply_to text,
  from_email text not null,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  -- Token opaco (se a resposta veio via reply+token@...) para correlacionar.
  reply_token text,
  raw jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists inbound_messages_message_id_idx
  on public.inbound_messages (organization_id, message_id)
  where message_id is not null;
create index if not exists inbound_messages_conversation_idx
  on public.inbound_messages (conversation_id, received_at desc);

-- ---------------------------------------------------------------------------
-- 3. Classificações
-- ---------------------------------------------------------------------------
create table if not exists public.reply_classifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null references public.inbound_messages(id) on delete cascade,
  classification text not null check (classification in (
    'interested','not_interested','unsubscribe','wants_demo','wants_trial',
    'pricing_question','product_question','objection','wrong_contact',
    'out_of_office','bounce','needs_human'
  )),
  confidence integer not null default 0 check (confidence between 0 and 100),
  method text not null default 'deterministic' check (method in ('deterministic', 'ai', 'manual')),
  rationale text,
  created_at timestamptz not null default now()
);

create index if not exists reply_classifications_message_idx on public.reply_classifications (message_id);

-- ---------------------------------------------------------------------------
-- 4. Uso/custo de IA
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day date not null default current_date,
  purpose text not null default 'classify',
  model text not null default 'unknown',
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (organization_id, day, purpose, model)
);

-- ---------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------
-- Regista uma resposta inbound e devolve a conversa/mensagem (idempotente por message_id).
create or replace function public.inbound_record_message_service(
  p_organization_id uuid,
  p_from_email text,
  p_to_email text default null,
  p_subject text default null,
  p_body_text text default null,
  p_body_html text default null,
  p_message_id text default null,
  p_in_reply_to text default null,
  p_reply_token text default null,
  p_raw jsonb default '{}'::jsonb
)
returns table (message_id uuid, conversation_id uuid, inserted boolean)
language plpgsql security definer set search_path = public as $$
declare
  conversation public.conversations;
  message public.inbound_messages;
  existing uuid;
  prospect uuid;
  company uuid;
begin
  if p_message_id is not null then
    select id into existing from public.inbound_messages
      where organization_id = p_organization_id and message_id = p_message_id;
    if existing is not null then
      return query select existing, (select conversation_id from public.inbound_messages where id = existing), false;
      return;
    end if;
  end if;

  -- Correlaciona via token (reply+token@) com a mensagem de outreach.
  if p_reply_token is not null then
    select e.prospect_id, e.company_id into prospect, company
      from public.outreach_messages m
      join public.outreach_enrollments e on e.id = m.enrollment_id
      where m.token = p_reply_token
      limit 1;
  end if;

  insert into public.conversations (organization_id, prospect_id, company_id, contact_email, subject, last_message_at)
  values (p_organization_id, prospect, company, lower(trim(p_from_email)), left(coalesce(p_subject, ''), 300), now())
  on conflict (organization_id, contact_email) do update set last_message_at = now(),
    prospect_id = coalesce(public.conversations.prospect_id, excluded.prospect_id),
    company_id = coalesce(public.conversations.company_id, excluded.company_id)
  returning * into conversation;

  insert into public.inbound_messages
    (organization_id, conversation_id, message_id, in_reply_to, from_email, to_email, subject,
     body_text, body_html, reply_token, raw)
  values
    (p_organization_id, conversation.id, nullif(trim(coalesce(p_message_id,'')), ''),
     nullif(trim(coalesce(p_in_reply_to,'')), ''), lower(trim(p_from_email)),
     nullif(trim(coalesce(p_to_email,'')), ''), left(coalesce(p_subject,''), 300),
     left(coalesce(p_body_text,''), 20000), left(coalesce(p_body_html,''), 50000),
     nullif(trim(coalesce(p_reply_token,'')), ''), coalesce(p_raw, '{}'::jsonb))
  returning * into message;

  return query select message.id, conversation.id, true;
end;
$$;

-- Registra a classificação e aplica a transição no prospect.
create or replace function public.inbound_record_classification_service(
  p_organization_id uuid,
  p_message_id uuid,
  p_classification text,
  p_confidence integer,
  p_method text default 'deterministic',
  p_rationale text default null,
  p_target_state text default null
)
returns public.reply_classifications
language plpgsql security definer set search_path = public as $$
declare
  classification_row public.reply_classifications;
  conversation public.conversations;
begin
  if p_classification not in (
    'interested','not_interested','unsubscribe','wants_demo','wants_trial',
    'pricing_question','product_question','objection','wrong_contact',
    'out_of_office','bounce','needs_human'
  ) then
    raise exception 'Classificação inválida: %', p_classification;
  end if;

  insert into public.reply_classifications
    (organization_id, message_id, classification, confidence, method, rationale)
  values
    (p_organization_id, p_message_id, p_classification,
     least(100, greatest(0, coalesce(p_confidence, 0))),
     case when p_method in ('deterministic','ai','manual') then p_method else 'deterministic' end,
     left(coalesce(p_rationale, ''), 1000))
  returning * into classification_row;

  select * into conversation from public.conversations
    join public.inbound_messages m on m.conversation_id = public.conversations.id
    where m.id = p_message_id;

  -- Pausa a sequência (qualquer resposta real para o outreach).
  if conversation.prospect_id is not null then
    perform public.automation_pause_enrollments_service(conversation.prospect_id,
      case when p_classification = 'unsubscribe' then 'unsubscribed'
           when p_classification = 'bounce' then 'bounced'
           else 'replied' end);

    if p_target_state is not null then
      perform public.automation_record_transition_service(conversation.prospect_id, p_target_state,
        'resposta classificada: ' || p_classification, 'webhook',
        jsonb_build_object('classification', p_classification, 'confidence', p_confidence, 'method', p_method));
    end if;
  end if;

  return classification_row;
end;
$$;

-- Registo de uso de IA (idempotente por dia/modelo/purpose).
create or replace function public.ai_usage_register(
  p_organization_id uuid,
  p_purpose text,
  p_model text,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.ai_usage (organization_id, day, purpose, model, calls, input_tokens, output_tokens)
  values (p_organization_id, current_date, coalesce(p_purpose, 'classify'), coalesce(p_model, 'unknown'), 1,
          greatest(0, coalesce(p_input_tokens, 0)), greatest(0, coalesce(p_output_tokens, 0)))
  on conflict (organization_id, day, purpose, model) do update
    set calls = public.ai_usage.calls + 1,
        input_tokens = public.ai_usage.input_tokens + excluded.input_tokens,
        output_tokens = public.ai_usage.output_tokens + excluded.output_tokens;
end;
$$;

-- Verifica se ainda há orçamento de IA para hoje.
create or replace function public.ai_usage_within_budget(
  p_organization_id uuid,
  p_max_calls integer default null
)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select sum(calls) from public.ai_usage
    where organization_id = p_organization_id and day = current_date
  ), 0) < coalesce(p_max_calls,
    (select value::text::integer from public.app_settings
       where organization_id = p_organization_id and key = 'autopilot_ai_max_calls_per_day'), 200);
$$;

-- Métricas de inbound (back-office).
create or replace function public.inbound_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.crm_has_role(array['admin', 'commercial_manager'])
    then jsonb_build_object('error', 'CRM access denied')
    else jsonb_build_object(
      'open_conversations', (select count(*) from public.conversations where organization_id = public.crm_organization_id() and status = 'open'),
      'messages_7d', (select count(*) from public.inbound_messages where organization_id = public.crm_organization_id() and received_at >= now() - interval '7 days'),
      'by_classification', coalesce((
        select jsonb_object_agg(classification, total)
        from (
          select classification, count(*)::integer as total
          from public.reply_classifications
          where organization_id = public.crm_organization_id() and created_at >= now() - interval '30 days'
          group by classification
        ) grouped
      ), '{}'::jsonb),
      'needs_human', (select count(*) from public.reply_classifications
        where organization_id = public.crm_organization_id()
          and classification in ('needs_human', 'wrong_contact')
          and created_at >= now() - interval '30 days')
    )
  end;
$$;

grant execute on function public.inbound_metrics() to authenticated;

revoke all on function public.inbound_record_message_service(uuid, text, text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public.inbound_record_classification_service(uuid, uuid, text, integer, text, text, text) from public;
revoke all on function public.ai_usage_register(uuid, text, text, bigint, bigint) from public;
revoke all on function public.ai_usage_within_budget(uuid, integer) from public;

grant execute on function public.inbound_record_message_service(uuid, text, text, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.inbound_record_classification_service(uuid, uuid, text, integer, text, text, text) to service_role;
grant execute on function public.ai_usage_register(uuid, text, text, bigint, bigint) to service_role;
grant execute on function public.ai_usage_within_budget(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Seeds de flags de IA (idempotente)
-- ---------------------------------------------------------------------------
insert into public.app_settings (organization_id, key, value)
select organization.id, key, value
from public.organizations organization
cross join (values
  ('autopilot_ai_enabled', 'false'::jsonb),
  ('autopilot_ai_max_calls_per_day', '200'::jsonb)
) as defaults(key, value)
on conflict (organization_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.inbound_messages enable row level security;
alter table public.reply_classifications enable row level security;
alter table public.ai_usage enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['conversations','inbound_messages','reply_classifications','ai_usage']
  loop
    execute format('drop policy if exists %I_select on public.%I', tbl, tbl);
    execute format(
      'create policy %I_select on public.%I for select using (organization_id = public.crm_organization_id() and public.crm_has_role(array[''admin'', ''commercial_manager'']))',
      tbl, tbl);
  end loop;
end $$;
