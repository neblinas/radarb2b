-- ===========================================================================
-- Adjudata — Autopilot: fila de aprovação com contexto do passo anterior.
-- Run once in Supabase SQL Editor as project owner.
--
-- A aba "Aprovações" passa a mostrar, para cada mensagem pendente, quando foi
-- enviado o email do passo anterior deste prospect (last_sent_at do
-- enrollment) e há quantos dias isso aconteceu. Permite decidir com contexto
-- (ex.: já passaram 3 dias desde o 1.º contacto?).
--
-- Acrescenta os campos:
--   * last_sent_at     — data do último email efetivamente enviado (passo anterior);
--   * days_since_last  — dias decorridos desde esse envio (null se nunca enviado);
--   * previous_step    — nº do passo anterior esperado (step_position - 1).
-- Mantém a assinatura anterior acrescentando colunas no fim (compatível com
-- quem só lê as colunas antigas).
-- ===========================================================================

-- O tipo de retorno muda (novas colunas), logo é preciso remover a função antes.
drop function if exists public.outreach_pending_approvals(integer);

create or replace function public.outreach_pending_approvals(p_limit integer default 50)
returns table(
  id uuid,
  enrollment_id uuid,
  company_id uuid,
  company_name text,
  to_email text,
  subject text,
  body text,
  step_position integer,
  created_at timestamp with time zone,
  last_sent_at timestamp with time zone,
  days_since_last integer,
  previous_step integer
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select m.id, m.enrollment_id, e.company_id, c.name,
         m.to_email, m.subject, m.body, m.step_position, m.created_at,
         e.last_sent_at,
         case
           when e.last_sent_at is null then null
           else greatest(0, extract(day from (now() - e.last_sent_at))::integer)
         end as days_since_last,
         greatest(1, m.step_position - 1) as previous_step
  from public.outreach_messages m
  join public.outreach_enrollments e on e.id = m.enrollment_id
  left join public.companies c on c.id = e.company_id
  where m.organization_id = public.crm_organization_id()
    and m.status = 'pending_approval'
    and public.crm_has_role(array['admin', 'commercial_manager'])
  order by m.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$function$;

-- Repor permissões (o DROP remove-as).
grant execute on function public.outreach_pending_approvals(integer) to authenticated, service_role;
