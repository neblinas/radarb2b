-- ===========================================================================
-- Fix: ambiguidade em automation_next_outreach_step
--
-- Bug: a função declara colunas via RETURNS TABLE (... campaign_id ...) e depois
-- usava `where campaign_id = enrollment.campaign_id`, onde `campaign_id` é
-- ambíguo (variável PL/pgSQL vs coluna da tabela). Isto rebentava SEMPRE com
-- ERROR 42702, o worker não encontrava o passo, marcava o enrollment como
-- 'completed' e nenhum email era gerado.
--
-- Correção: qualificar todas as colunas das tabelas com o alias da tabela
-- (step.campaign_id, step.position, etc.), eliminando a ambiguidade.
-- ===========================================================================

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
  select * into enrollment from public.outreach_enrollments e where e.id = p_enrollment_id;
  if enrollment.id is null then return; end if;

  select count(*) into total_steps
    from public.outreach_steps s
    where s.campaign_id = enrollment.campaign_id;
  if enrollment.current_step >= total_steps then return; end if;

  select * into step
    from public.outreach_steps s
    where s.campaign_id = enrollment.campaign_id
      and s.position = enrollment.current_step + 1;
  if step.id is null then return; end if;

  return query
    select
      enrollment.id,
      enrollment.company_id,
      enrollment.prospect_id,
      enrollment.campaign_id,
      enrollment.current_step + 1,
      enrollment.contact_email,
      coalesce(step.subject, template.subject),
      coalesce(step.body, template.body),
      (enrollment.current_step + 1) >= total_steps
    from (select 1) _
    left join public.email_templates template on template.id = step.template_id;
end;
$$;

revoke all on function public.automation_next_outreach_step(uuid) from public;
grant execute on function public.automation_next_outreach_step(uuid) to service_role;
