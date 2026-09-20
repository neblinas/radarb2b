-- Radar B2B — Sales Autopilot: fila de aprovação humana (FASE 7).
-- Run once in Supabase SQL Editor as project owner.
--
-- Objetivo: com o outbound ligado, exigir que um gestor REVISE/APROVE cada
-- email antes de o Resend enviar. É o "human-in-the-loop" do outbound.
--
--   * outreach_messages.status ganha 'pending_approval' | 'approved' | 'rejected'
--   * colunas de decisão: approved_by, approved_at, reviewed_at, review_note
--   * flag autopilot_require_approval (default TRUE — mais seguro)
--   * RPCs: outreach_pending_approvals(), outreach_decide_approval(),
--     automation_enqueue_approved_send_service()

-- ---------------------------------------------------------------------------
-- 1. Alargar o estado das mensagens + colunas de decisão
-- ---------------------------------------------------------------------------
alter table public.outreach_messages
  drop constraint if exists outreach_messages_status_check;

alter table public.outreach_messages
  add constraint outreach_messages_status_check
  check (status in ('queued','pending_approval','approved','rejected','sent','failed','skipped'));

alter table public.outreach_messages
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

create index if not exists outreach_messages_pending_idx
  on public.outreach_messages (organization_id, created_at desc)
  where status = 'pending_approval';

-- ---------------------------------------------------------------------------
-- 2. Flag (default TRUE — segurança por omissão)
-- ---------------------------------------------------------------------------
insert into public.app_settings (organization_id, key, value)
select organization.id, 'autopilot_require_approval', 'true'::jsonb
from public.organizations organization
on conflict (organization_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Leitura: fila de aprovação (back-office)
-- ---------------------------------------------------------------------------
create or replace function public.outreach_pending_approvals(p_limit integer default 50)
returns table (
  id uuid, enrollment_id uuid, company_id uuid, company_name text,
  to_email text, subject text, body text, step_position integer, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.enrollment_id, e.company_id, c.name,
         m.to_email, m.subject, m.body, m.step_position, m.created_at
  from public.outreach_messages m
  join public.outreach_enrollments e on e.id = m.enrollment_id
  left join public.companies c on c.id = e.company_id
  where m.organization_id = public.crm_organization_id()
    and m.status = 'pending_approval'
    and public.crm_has_role(array['admin', 'commercial_manager'])
  order by m.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
grant execute on function public.outreach_pending_approvals(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Decisão: aprovar ou rejeitar (back-office)
-- ---------------------------------------------------------------------------
-- Aprovar re-enfileira um job `send_outreach` para envio efetivo.
-- Rejeitar fecha o enrollment (sem enviar) e registra o motivo.
create or replace function public.outreach_decide_approval(
  p_message_id uuid,
  p_decision text,
  p_note text default null
)
returns public.outreach_messages
language plpgsql security definer set search_path = public as $$
declare
  message public.outreach_messages;
  enrollment public.outreach_enrollments;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decisão inválida: %', p_decision;
  end if;

  select * into message from public.outreach_messages
    where id = p_message_id and organization_id = public.crm_organization_id();
  if message.id is null then raise exception 'Mensagem não encontrada'; end if;
  if message.status <> 'pending_approval' then
    raise exception 'Mensagem não está pendente de aprovação (estado: %)', message.status;
  end if;

  select * into enrollment from public.outreach_enrollments where id = message.enrollment_id;

  if p_decision = 'approve' then
    update public.outreach_messages
      set status = 'approved', approved_by = auth.uid(), approved_at = now(),
          reviewed_at = now(), review_note = left(coalesce(p_note, ''), 500)
      where id = message.id
      returning * into message;

    -- Re-enfileira o envio (aprovado).
    perform public.automation_enqueue_service(
      message.organization_id, 'send_outreach', 'message', message.id,
      jsonb_build_object('organization_id', message.organization_id, 'approved', true),
      'outreach_approved:' || message.id, now(), 20);

    insert into public.automation_runs (organization_id, level, step, message, metadata)
    values (message.organization_id, 'info', 'outreach_approved',
      'Mensagem aprovada para envio', jsonb_build_object('message_id', message.id));
  else
    update public.outreach_messages
      set status = 'rejected', reviewed_at = now(), review_note = left(coalesce(p_note, ''), 500)
      where id = message.id
      returning * into message;

    update public.outreach_enrollments
      set status = 'paused', updated_at = now()
      where id = message.enrollment_id;

    insert into public.automation_runs (organization_id, level, step, message, metadata)
    values (message.organization_id, 'warn', 'outreach_rejected',
      'Mensagem rejeitada na fila de aprovação', jsonb_build_object('message_id', message.id));
  end if;

  return message;
end;
$$;
grant execute on function public.outreach_decide_approval(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Serviço: recarregar a mensagem aprovada para envio
-- ---------------------------------------------------------------------------
create or replace function public.automation_approved_message_service(p_message_id uuid)
returns table (
  message_id uuid, enrollment_id uuid, company_id uuid, prospect_id uuid,
  to_email text, subject text, body text, token text, step_position integer
)
language sql stable security definer set search_path = public as $$
  select m.id, m.enrollment_id, e.company_id, e.prospect_id,
         m.to_email, m.subject, m.body, m.token, m.step_position
  from public.outreach_messages m
  join public.outreach_enrollments e on e.id = m.enrollment_id
  where m.id = p_message_id and m.status = 'approved';
$$;
revoke all on function public.automation_approved_message_service(uuid) from public;
grant execute on function public.automation_approved_message_service(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Métrica: pendentes de aprovação
-- ---------------------------------------------------------------------------
create or replace function public.outreach_approval_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.crm_has_role(array['admin', 'commercial_manager'])
    then jsonb_build_object('error', 'CRM access denied')
    else jsonb_build_object(
      'pending', (select count(*) from public.outreach_messages where organization_id = public.crm_organization_id() and status = 'pending_approval'),
      'approved_7d', (select count(*) from public.outreach_messages where organization_id = public.crm_organization_id() and status = 'sent' and approved_at >= now() - interval '7 days'),
      'rejected_7d', (select count(*) from public.outreach_messages where organization_id = public.crm_organization_id() and status = 'rejected' and reviewed_at >= now() - interval '7 days')
    )
  end;
$$;
grant execute on function public.outreach_approval_metrics() to authenticated;
