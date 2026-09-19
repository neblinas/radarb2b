-- Radar B2B — Correio comercial (envio).
-- Run once in Supabase SQL Editor as project owner.
--
-- Fase 1 (Opção A): um remetente único (comercial@adjudata.pt) partilhado por
-- todos os comerciais. A individualidade está na ASSINATURA (nome + contacto do
-- comercial). As respostas não são recebidas (nota "não responda").
--
-- Esta migração guarda o HISTÓRICO de envio (Caixa de Saída) e o "from" de cada
-- comercial. A receção (Caixa de Entrada) fica para a Fase 2.

-- ---------------------------------------------------------------------------
-- 1. Identidade de envio por comercial
-- ---------------------------------------------------------------------------
-- Guarda o nome a apresentar e o email de resposta opcional (contacto do
-- comercial, se quiser colocar o seu próprio). O "from" é sempre o sender único.
create table if not exists public.commercial_mail_senders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  reply_to text,
  signature_note text not null default 'Por favor não responda a este e-mail.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Histórico de mensagens enviadas (Caixa de Saída)
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  from_email text not null,
  to_email text not null,
  cc text,
  subject text not null,
  body text not null,
  -- Corpo exatamente como ficou (com assinatura) — para o que foi realmente enviado.
  rendered_body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider text not null default 'resend',
  provider_message_id text,
  error text,
  -- Contexto opcional (prospeção / cliente).
  company_id uuid references public.companies(id) on delete set null,
  client_user_id uuid references auth.users(id) on delete set null,
  prospect_id uuid references public.sales_prospects(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists commercial_email_messages_sender_idx
  on public.commercial_email_messages (organization_id, sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------
-- Nome a apresentar por omissão, a partir do user_metadata (full_name) ou email.
create or replace function public.commercial_default_display_name(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(u.email, 'Comercial Adjudata'), '@', 1)
  )
  from auth.users u where u.id = p_user_id;
$$;

-- Devolve (ou cria) a identidade de envio do comercial atual.
create or replace function public.commercial_ensure_sender()
returns public.commercial_mail_senders
language plpgsql security definer set search_path = public as $$
declare sender public.commercial_mail_senders;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;

  select * into sender from public.commercial_mail_senders where user_id = auth.uid();
  if sender.user_id is not null then return sender; end if;

  insert into public.commercial_mail_senders (user_id, organization_id, display_name)
  values (auth.uid(), public.crm_organization_id(), public.commercial_default_display_name(auth.uid()))
  on conflict (user_id) do nothing
  returning * into sender;

  if sender.user_id is null then
    select * into sender from public.commercial_mail_senders where user_id = auth.uid();
  end if;
  return sender;
end;
$$;

-- Atualiza a assinatura/contacto do comercial.
create or replace function public.commercial_update_sender(p_display_name text, p_reply_to text default null, p_signature_note text default null)
returns public.commercial_mail_senders
language plpgsql security definer set search_path = public as $$
declare sender public.commercial_mail_senders;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;
  if length(trim(coalesce(p_display_name, ''))) < 2 then raise exception 'Nome inválido'; end if;

  insert into public.commercial_mail_senders (user_id, organization_id, display_name, reply_to, signature_note)
  values (
    auth.uid(), public.crm_organization_id(), trim(p_display_name),
    nullif(trim(p_reply_to), ''),
    coalesce(nullif(trim(p_signature_note), ''), 'Por favor não responda a este e-mail.')
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    reply_to = excluded.reply_to,
    signature_note = excluded.signature_note,
    updated_at = now()
  returning * into sender;
  return sender;
end;
$$;

-- Registra a tentativa de envio (chamado pela Edge Function, com service role,
-- mas também utilizável para marcar falhas logo após o pedido).
create or replace function public.commercial_log_email(
  p_to_email text,
  p_subject text,
  p_body text,
  p_rendered_body text,
  p_status text default 'queued',
  p_provider_message_id text default null,
  p_error text default null,
  p_company_id uuid default null,
  p_client_user_id uuid default null,
  p_prospect_id uuid default null
)
returns public.commercial_email_messages
language plpgsql security definer set search_path = public as $$
declare message public.commercial_email_messages;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;

  insert into public.commercial_email_messages
    (organization_id, sender_id, from_email, to_email, subject, body, rendered_body,
     status, provider_message_id, error, company_id, client_user_id, prospect_id,
     sent_at)
  values (
    public.crm_organization_id(), auth.uid(),
    'comercial@adjudata.pt', lower(trim(p_to_email)), trim(p_subject), p_body, p_rendered_body,
    case when p_status in ('queued', 'sent', 'failed') then p_status else 'queued' end,
    nullif(trim(p_provider_message_id), ''), nullif(trim(p_error), ''),
    p_company_id, p_client_user_id, p_prospect_id,
    case when p_status = 'sent' then now() else null end
  )
  returning * into message;

  perform public.crm_audit('email_logged', 'commercial_email_message', message.id,
    jsonb_build_object('to', message.to_email, 'status', message.status));
  return message;
end;
$$;

-- Histórico de envio do comercial (a sua Caixa de Saída).
create or replace function public.commercial_my_sent_emails(p_limit integer default 100)
returns table (
  id uuid,
  to_email text,
  subject text,
  status text,
  error text,
  sent_at timestamptz,
  created_at timestamptz,
  created_by_email text
)
language sql security definer set search_path = public as $$
  select message.id, message.to_email, message.subject, message.status, message.error,
    message.sent_at, message.created_at, sender_user.email
  from public.commercial_email_messages message
  left join auth.users sender_user on sender_user.id = message.sender_id
  where message.organization_id = public.crm_organization_id()
    and (
      message.sender_id = auth.uid()
      or public.crm_has_role(array['admin', 'commercial_manager'])
    )
  order by message.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Detalhe de uma mensagem (para abrir na Caixa de Saída).
create or replace function public.commercial_email_detail(p_message_id uuid)
returns table (
  id uuid, to_email text, cc text, subject text, body text, rendered_body text,
  status text, error text, sent_at timestamptz, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select message.id, message.to_email, message.cc, message.subject, message.body, message.rendered_body,
    message.status, message.error, message.sent_at, message.created_at
  from public.commercial_email_messages message
  where message.id = p_message_id
    and message.organization_id = public.crm_organization_id()
    and (message.sender_id = auth.uid() or public.crm_has_role(array['admin', 'commercial_manager']));
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS e permissões
-- ---------------------------------------------------------------------------
alter table public.commercial_mail_senders enable row level security;
alter table public.commercial_email_messages enable row level security;

drop policy if exists mail_senders_select on public.commercial_mail_senders;
create policy mail_senders_select on public.commercial_mail_senders
  for select using (
    organization_id = public.crm_organization_id()
    and (user_id = auth.uid() or public.crm_has_role(array['admin', 'commercial_manager']))
  );

drop policy if exists mail_messages_select on public.commercial_email_messages;
create policy mail_messages_select on public.commercial_email_messages
  for select using (
    organization_id = public.crm_organization_id()
    and (sender_id = auth.uid() or public.crm_has_role(array['admin', 'commercial_manager']))
  );

grant execute on function public.commercial_ensure_sender() to authenticated;
grant execute on function public.commercial_update_sender(text, text, text) to authenticated;
grant execute on function public.commercial_log_email(text, text, text, text, text, text, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.commercial_my_sent_emails(integer) to authenticated;
grant execute on function public.commercial_email_detail(uuid) to authenticated;
