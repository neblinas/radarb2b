-- Radar B2B — Sales Autopilot: outbound e campanhas (FASE 3).
-- Run once in Supabase SQL Editor as project owner.
--
--   * email_templates      — templates versionados de email
--   * outreach_campaigns   — agrupamento + regras de uma campanha
--   * outreach_steps       — passos (sequência) de uma campanha
--   * outreach_enrollments — prospect inscrito numa campanha
--   * outreach_messages    — mensagens de automação (com token para tracking)
--   * email_events         — open/click/bounce/unsubscribe/unsub
--   * outreach_counters    — limites por dia/domínio (rate limiting)
--
-- O envio real continua a acontecer por Edge Function. Esta migração fornece a
-- máquina de estados, os limites e os RPCs de serviço usados pelo worker.

-- ---------------------------------------------------------------------------
-- 1. Templates
-- ---------------------------------------------------------------------------
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  -- Variáveis permitidas: {company}, {nif}, {awards}, {value}, {cpv}, {comercial}
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name, version)
);

-- ---------------------------------------------------------------------------
-- 2. Campanhas
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  daily_limit integer not null default 50,
  domain_daily_limit integer not null default 2,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Passos da sequência (1.º contacto + follow-ups).
create table if not exists public.outreach_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  position integer not null,
  template_id uuid references public.email_templates(id) on delete set null,
  subject text,
  body text,
  delay_days integer not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, position)
);

-- Inscrição de um prospect numa campanha.
create table if not exists public.outreach_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  prospect_id uuid not null references public.sales_prospects(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_email text not null,
  contact_type text,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'replied', 'unsubscribed', 'bounced', 'failed')),
  current_step integer not null default 0,
  next_send_at timestamptz not null default now(),
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, prospect_id)
);

create index if not exists outreach_enrollments_due_idx
  on public.outreach_enrollments (status, next_send_at)
  where status = 'active';

-- Mensagens de automação (com token de tracking/unsubscribe).
create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enrollment_id uuid not null references public.outreach_enrollments(id) on delete cascade,
  step_position integer not null,
  to_email text not null,
  subject text not null,
  body text not null,
  token text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists outreach_messages_token_idx on public.outreach_messages (token);

-- ---------------------------------------------------------------------------
-- 3. Eventos de email (open/click/bounce/unsubscribe/complaint)
-- ---------------------------------------------------------------------------
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid references public.outreach_messages(id) on delete cascade,
  token text,
  event_type text not null check (event_type in ('queued','sent','delivered','open','click','bounce','complaint','unsubscribe','failed')),
  url text,
  user_agent text,
  ip text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_events_message_idx on public.email_events (message_id, created_at desc);
create index if not exists email_events_type_idx on public.email_events (organization_id, event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Contadores de rate limiting (por dia + domínio)
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day date not null,
  scope text not null, -- 'total' ou 'domain:<dominio>'
  count integer not null default 0,
  primary key (organization_id, day, scope)
);

-- Verifica se ainda há capacidade (respeitando limites da campanha e settings).
create or replace function public.outreach_can_send(
  p_organization_id uuid,
  p_domain text,
  p_campaign_daily_limit integer default null,
  p_campaign_domain_limit integer default null
)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_day date := current_date;
  v_total integer;
  v_domain integer;
  v_max_total integer;
  v_max_domain integer;
begin
  v_max_total := coalesce(p_campaign_daily_limit,
    (select value::text::integer from public.app_settings where organization_id = p_organization_id and key = 'autopilot_max_sends_per_day'), 50);
  v_max_domain := coalesce(p_campaign_domain_limit,
    (select value::text::integer from public.app_settings where organization_id = p_organization_id and key = 'autopilot_max_sends_per_domain_per_day'), 2);

  select count into v_total from public.outreach_counters
    where organization_id = p_organization_id and day = v_day and scope = 'total';
  if coalesce(v_total, 0) >= v_max_total then return false; end if;

  if p_domain is not null then
    select count into v_domain from public.outreach_counters
      where organization_id = p_organization_id and day = v_day and scope = 'domain:' || lower(p_domain);
    if coalesce(v_domain, 0) >= v_max_domain then return false; end if;
  end if;
  return true;
end;
$$;

-- Incrementa os contadores após um envio.
create or replace function public.outreach_register_send(p_organization_id uuid, p_domain text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.outreach_counters (organization_id, day, scope, count)
  values (p_organization_id, current_date, 'total', 1)
  on conflict (organization_id, day, scope) do update set count = public.outreach_counters.count + 1;

  if p_domain is not null then
    insert into public.outreach_counters (organization_id, day, scope, count)
    values (p_organization_id, current_date, 'domain:' || lower(p_domain), 1)
    on conflict (organization_id, day, scope) do update set count = public.outreach_counters.count + 1;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPCs de serviço usados pelo worker
-- ---------------------------------------------------------------------------
-- Devolve a próxima mensagem a enviar para um enrollment (ou null se terminou).
create or replace function public.automation_next_outreach_step(
  p_enrollment_id uuid
)
returns table (
  enrollment_id uuid,
  company_id uuid,
  prospect_id uuid,
  campaign_id uuid,
  next_step integer,
  to_email text,
  subject text,
  body text,
  is_last boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  enrollment public.outreach_enrollments;
  step public.outreach_steps;
  total_steps integer;
begin
  select * into enrollment from public.outreach_enrollments where id = p_enrollment_id;
  if enrollment.id is null then return; end if;

  select count(*) into total_steps from public.outreach_steps where campaign_id = enrollment.campaign_id;
  if enrollment.current_step >= total_steps then return; end if;

  select * into step from public.outreach_steps
    where campaign_id = enrollment.campaign_id and position = enrollment.current_step + 1;
  if step.id is null then return; end if;

  return query select
    enrollment.id, enrollment.company_id, enrollment.prospect_id, enrollment.campaign_id,
    enrollment.current_step + 1, enrollment.contact_email,
    coalesce(step.subject, template.subject), coalesce(step.body, template.body),
    (enrollment.current_step + 1) >= total_steps
  from (select 1) _
  left join public.email_templates template on template.id = step.template_id;
end;
$$;

-- Enfileira os enrollments devidos (chamado pelo worker). Idempotente via dedup_key.
create or replace function public.automation_enqueue_due_outreach(
  p_organization_id uuid,
  p_limit integer default 20
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  enrollment record;
  enqueued integer := 0;
begin
  for enrollment in
    select e.id, e.prospect_id
    from public.outreach_enrollments e
    join public.outreach_campaigns c on c.id = e.campaign_id
    where e.organization_id = p_organization_id
      and e.status = 'active'
      and c.status = 'active'
      and e.next_send_at <= now()
    order by e.next_send_at asc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  loop
    perform public.automation_enqueue_service(
      p_organization_id,
      'send_outreach',
      'enrollment',
      enrollment.id,
      jsonb_build_object('organization_id', p_organization_id, 'prospect_id', enrollment.prospect_id),
      'outreach:' || enrollment.id || ':' || now()::text,
      now(),
      50
    );
    enqueued := enqueued + 1;
  end loop;
  return enqueued;
end;
$$;

-- Enfileiramento a partir do service role (sem auth.uid()).
create or replace function public.automation_enqueue_service(
  p_organization_id uuid,
  p_job_type text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedup_key text default null,
  p_scheduled_at timestamptz default null,
  p_priority integer default 100
)
returns public.automation_jobs
language plpgsql security definer set search_path = public as $$
declare job public.automation_jobs;
begin
  if p_dedup_key is not null then
    select * into job from public.automation_jobs
      where organization_id = p_organization_id and dedup_key = p_dedup_key
        and status in ('queued', 'processing')
      limit 1;
    if job.id is not null then return job; end if;
  end if;

  insert into public.automation_jobs
    (organization_id, job_type, entity_type, entity_id, payload, dedup_key, scheduled_at, priority)
  values
    (p_organization_id, p_job_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb),
     nullif(trim(coalesce(p_dedup_key, '')), ''), coalesce(p_scheduled_at, now()), coalesce(p_priority, 100))
  returning * into job;
  return job;
end;
$$;

revoke all on function public.automation_enqueue_service(uuid, text, text, uuid, jsonb, text, timestamptz, integer) from public;
grant execute on function public.automation_enqueue_service(uuid, text, text, uuid, jsonb, text, timestamptz, integer) to service_role;

-- Registra um evento de email e aplica efeitos laterais (unsubscribe/bounce).
create or replace function public.automation_record_email_event(
  p_token text,
  p_event_type text,
  p_url text default null,
  p_user_agent text default null,
  p_ip text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.email_events
language plpgsql security definer set search_path = public as $$
declare
  message public.outreach_messages;
  enrollment public.outreach_enrollments;
  event public.email_events;
  prospect public.sales_prospects;
begin
  select * into message from public.outreach_messages where token = p_token;
  if message.id is null then raise exception 'Token inválido'; end if;

  insert into public.email_events (organization_id, message_id, token, event_type, url, user_agent, ip, metadata)
  values (message.organization_id, message.id, p_token,
    case when p_event_type in ('queued','sent','delivered','open','click','bounce','complaint','unsubscribe','failed') then p_event_type else 'open' end,
    nullif(trim(coalesce(p_url, '')), ''), nullif(trim(coalesce(p_user_agent,'')), ''),
    nullif(trim(coalesce(p_ip,'')), ''), coalesce(p_metadata, '{}'::jsonb))
  returning * into event;

  select * into enrollment from public.outreach_enrollments where id = message.enrollment_id;

  if p_event_type = 'unsubscribe' then
    update public.outreach_enrollments set status = 'unsubscribed', updated_at = now() where id = enrollment.id;
    perform public.automation_suppress_service(message.organization_id, message.to_email, null, enrollment.company_id,
      'unsubscribe', 'email_event');
    if enrollment.prospect_id is not null then
      perform public.automation_record_transition_service(enrollment.prospect_id, 'unsubscribed',
        'cancelou subscrição via email', 'webhook');
    end if;
  elsif p_event_type = 'bounce' then
    update public.outreach_enrollments set status = 'bounced', updated_at = now() where id = enrollment.id;
    perform public.automation_suppress_service(message.organization_id, message.to_email, null, null, 'bounce', 'email_event');
    if enrollment.prospect_id is not null then
      perform public.automation_record_transition_service(enrollment.prospect_id, 'bounced',
        'email devolvido (bounce)', 'webhook');
    end if;
  elsif p_event_type = 'complaint' then
    perform public.automation_suppress_service(message.organization_id, message.to_email, null, null, 'complaint', 'email_event');
  end if;

  return event;
end;
$$;

-- Supressão a partir do service role (webhook/tracking), sem depender de auth.
create or replace function public.automation_suppress_service(
  p_organization_id uuid,
  p_email text default null,
  p_domain text default null,
  p_company_id uuid default null,
  p_reason text default 'manual',
  p_source text default 'service'
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_reason not in ('unsubscribe','do_not_contact','bounce','complaint','manual','compliance') then
    p_reason := 'manual';
  end if;
  if p_email is null and p_domain is null and p_company_id is null then return; end if;

  insert into public.email_suppressions
    (organization_id, email, domain, company_id, reason, source, permanent, created_by)
  values
    (p_organization_id, nullif(lower(trim(coalesce(p_email, ''))), ''),
     nullif(lower(trim(coalesce(p_domain, ''))), ''), p_company_id, p_reason, coalesce(p_source, 'service'), true, null)
  on conflict do nothing;
end;
$$;

revoke all on function public.automation_suppress_service(uuid, text, text, uuid, text, text) from public;
grant execute on function public.automation_suppress_service(uuid, text, text, uuid, text, text) to service_role;

-- Pausa todos os enrollments de um prospect (ex.: quando responde).
create or replace function public.automation_pause_enrollments_service(
  p_prospect_id uuid,
  p_status text default 'replied'
)
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.outreach_enrollments
    set status = case when p_status in ('replied','unsubscribed','bounced','failed') then p_status else 'paused' end,
        updated_at = now()
    where prospect_id = p_prospect_id and status in ('active', 'paused');
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Métricas de outreach da organização (back-office).
create or replace function public.outreach_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.crm_has_role(array['admin', 'commercial_manager'])
    then jsonb_build_object('error', 'CRM access denied')
    else jsonb_build_object(
      'active_enrollments', (select count(*) from public.outreach_enrollments where organization_id = public.crm_organization_id() and status = 'active'),
      'sent_7d', (select count(*) from public.outreach_messages where organization_id = public.crm_organization_id() and status = 'sent' and sent_at >= now() - interval '7 days'),
      'sent_30d', (select count(*) from public.outreach_messages where organization_id = public.crm_organization_id() and status = 'sent' and sent_at >= now() - interval '30 days'),
      'opens_30d', (select count(distinct message_id) from public.email_events where organization_id = public.crm_organization_id() and event_type = 'open' and created_at >= now() - interval '30 days'),
      'clicks_30d', (select count(distinct message_id) from public.email_events where organization_id = public.crm_organization_id() and event_type = 'click' and created_at >= now() - interval '30 days'),
      'replies', (select count(*) from public.outreach_enrollments where organization_id = public.crm_organization_id() and status = 'replied'),
      'unsubscribes_30d', (select count(*) from public.email_events where organization_id = public.crm_organization_id() and event_type = 'unsubscribe' and created_at >= now() - interval '30 days'),
      'bounces_30d', (select count(*) from public.email_events where organization_id = public.crm_organization_id() and event_type = 'bounce' and created_at >= now() - interval '30 days')
    )
  end;
$$;

grant execute on function public.outreach_metrics() to authenticated;

-- RPCs service-role only.
revoke all on function public.outreach_can_send(uuid, text, integer, integer) from public;
revoke all on function public.outreach_register_send(uuid, text) from public;
revoke all on function public.automation_next_outreach_step(uuid) from public;
revoke all on function public.automation_enqueue_due_outreach(uuid, integer) from public;
revoke all on function public.automation_record_email_event(text, text, text, text, text, jsonb) from public;
revoke all on function public.automation_pause_enrollments_service(uuid, text) from public;

grant execute on function public.outreach_can_send(uuid, text, integer, integer) to service_role;
grant execute on function public.outreach_register_send(uuid, text) to service_role;
grant execute on function public.automation_next_outreach_step(uuid) to service_role;
grant execute on function public.automation_enqueue_due_outreach(uuid, integer) to service_role;
grant execute on function public.automation_record_email_event(text, text, text, text, text, jsonb) to service_role;
grant execute on function public.automation_pause_enrollments_service(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
alter table public.email_templates enable row level security;
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_steps enable row level security;
alter table public.outreach_enrollments enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.email_events enable row level security;
alter table public.outreach_counters enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['email_templates','outreach_campaigns','outreach_steps','outreach_enrollments','outreach_messages','email_events','outreach_counters']
  loop
    execute format('drop policy if exists %I_select on public.%I', tbl, tbl);
    execute format(
      'create policy %I_select on public.%I for select using (organization_id = public.crm_organization_id() and public.crm_has_role(array[''admin'', ''commercial_manager'']))',
      tbl, tbl);
  end loop;
end $$;

-- Escrita de campanhas/templates/steps por admin/gestor.
drop policy if exists outreach_campaigns_write on public.outreach_campaigns;
create policy outreach_campaigns_write on public.outreach_campaigns
  for all using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']))
  with check (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

drop policy if exists email_templates_write on public.email_templates;
create policy email_templates_write on public.email_templates
  for all using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']))
  with check (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

drop policy if exists outreach_steps_write on public.outreach_steps;
create policy outreach_steps_write on public.outreach_steps
  for all using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']))
  with check (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));
