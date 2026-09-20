-- ===========================================================================
-- Fix: registar atividade em sales_activities quando o autopilot envia email.
--
-- Antes: automation_mark_contacted_service só atualizava sales_prospects
-- (estado/last_contacted_at). Nenhuma nota ficava registada na ficha, por isso
-- não havia histórico visível do que foi enviado.
--
-- Agora: passa a escrever também uma atividade (EMAIL_OUT) com o assunto e o
-- destinatário, para acompanhamento. sales_rep_id passa a nullable (atividades
-- automáticas não têm comercial humano) e activity_type ganha 'EMAIL_OUT'.
-- ===========================================================================

-- 1. sales_rep_id nullable (atividades automáticas).
alter table public.sales_activities
  alter column sales_rep_id drop not null;

-- 2. Permitir o tipo EMAIL_OUT (envio automático pelo autopilot).
alter table public.sales_activities
  drop constraint if exists sales_activities_activity_type_check;
alter table public.sales_activities
  add constraint sales_activities_activity_type_check
  check (activity_type in ('CALL', 'EMAIL', 'EMAIL_OUT', 'LINKEDIN', 'WEB_FORM', 'MEETING', 'DEMO', 'NOTE', 'OTHER'));

-- 3. Remover a versão antiga (2 args) para não haver ambiguidade com os defaults.
drop function if exists public.automation_mark_contacted_service(uuid, text);

create or replace function public.automation_mark_contacted_service(
  p_prospect_id uuid,
  p_state text default 'contacted',
  p_to_email text default null,
  p_subject text default null,
  p_step_position integer default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_prospect_id is null then return; end if;

  update public.sales_prospects
    set last_contacted_at = now(),
        autopilot_state = coalesce(p_state, 'contacted'),
        updated_at = now()
  where id = p_prospect_id;

  -- Regista a atividade de envio (visível na ficha do prospect).
  insert into public.sales_activities (prospect_id, sales_rep_id, activity_type, outcome, notes)
  values (
    p_prospect_id,
    null,
    'EMAIL_OUT',
    'sent',
    'Email automático (autopilot)'
      || coalesce(' passo ' || p_step_position::text, '')
      || coalesce(' para ' || p_to_email, '')
      || coalesce(' — "' || left(p_subject, 200) || '"', '')
  );
end;
$$;

revoke all on function public.automation_mark_contacted_service(uuid, text, text, text, integer) from public;
grant execute on function public.automation_mark_contacted_service(uuid, text, text, text, integer) to service_role;
