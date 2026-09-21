-- Radar B2B — Compliance: verificação de suppression segura por sessão.
-- Run once in Supabase SQL Editor as project owner.
--
-- PROBLEMA
--   `checkSuppressed` (web/src/lib/suppression.ts) chama `is_suppressed`
--   passando `p_organization_id = null`. Como essa função compara
--   `suppression.organization_id = p_organization_id`, o resultado era sempre
--   `false` ("não suprimido"), mesmo havendo opt-out/unsubscribe real para a
--   organização. Era uma FALHA DE COMPLIANCE SILENCIOSA antes de envios
--   comerciais humanos (o outbound automático usa o service role com o id
--   correto e não era afetado).
--
-- CORREÇÃO
--   Nova RPC `is_suppressed_session(email, domain, company)` que:
--     * resolve a organização pela SESSÃO (`crm_organization_id()`), nunca pelo
--       cliente — o frontend não pode forjar o id de organização;
--     * exige role CRM (admin/commercial_manager/commercial);
--     * delega na `is_suppressed(org, ...)` já existente (fonte de verdade).
--
-- Nota: a barreira relevante é a de envio comercial humano (send-commercial-email),
-- onde `checkSuppressed` é usado. O worker automático continua a chamar
-- `is_suppressed` diretamente com o id resolvido pelo service role.

create or replace function public.is_suppressed_session(
  p_email text default null,
  p_domain text default null,
  p_company_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  -- Sem sessão válida não há organização: falha em segurança (assumir suprimido).
  v_org := public.crm_organization_id();
  if v_org is null or not public.crm_has_role() then
    return true;
  end if;

  return public.is_suppressed(v_org, p_email, p_domain, p_company_id);
end;
$$;

revoke all on function public.is_suppressed_session(text, text, uuid) from public;
grant execute on function public.is_suppressed_session(text, text, uuid) to authenticated;
