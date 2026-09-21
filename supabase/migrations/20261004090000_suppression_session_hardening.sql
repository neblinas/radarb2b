-- Radar B2B — Hardening: restringir a RPC de suppression por sessão a utilizadores autenticados.
--
-- A migração anterior (`20261003090000_suppression_session.sql`) concedeu EXECUTE
-- a `authenticated`, mas `anon` herdava EXECUTE por default de função. A função
-- já é inofensiva para `anon` (sem sessão, `crm_organization_id()` é nulo →
-- devolve `true`/fail-safe), mas restringimos explicitamente para minimizar
-- superfície e exposição de comportamento.

revoke all on function public.is_suppressed_session(text, text, uuid) from public;
revoke all on function public.is_suppressed_session(text, text, uuid) from anon;
grant execute on function public.is_suppressed_session(text, text, uuid) to authenticated;
