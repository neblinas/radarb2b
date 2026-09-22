-- Adjudata — Sales Autopilot: histórico de emails enviados (FASE 13).
--
-- Objetivo: dar visibilidade ao que o Autopilot já enviou. A fila de aprovação
-- (`outreach_pending_approvals`) mostra apenas as mensagens à espera de decisão;
-- assim que são aprovadas/enviadas desaparecem da UI. Esta RPC expõe os últimos
-- envios para uma aba "Enviados" no painel do Autopilot.
--
--   * leitura apenas (RPC), role admin/commercial_manager;
--   * scoped à organização do utilizador (crm_organization_id);
--   * devolve os campos essenciais + a empresa e o passo.
--
-- Idempotente. Sem dados inventados. Segurança inalterada.
--
-- Executar no Supabase Studio SQL Editor como project owner (ou `supabase db push`).

create or replace function public.outreach_recent_sent(p_limit integer default 50)
returns table (
  id uuid,
  enrollment_id uuid,
  company_id uuid,
  company_name text,
  to_email text,
  subject text,
  step_position integer,
  sent_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.enrollment_id, e.company_id, c.name,
         m.to_email, m.subject, m.step_position, m.sent_at, m.created_at
  from public.outreach_messages m
  join public.outreach_enrollments e on e.id = m.enrollment_id
  left join public.companies c on c.id = e.company_id
  where m.organization_id = public.crm_organization_id()
    and m.status = 'sent'
    and public.crm_has_role(array['admin', 'commercial_manager'])
  order by coalesce(m.sent_at, m.created_at) desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
grant execute on function public.outreach_recent_sent(integer) to authenticated;
