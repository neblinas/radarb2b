-- Autopilot — inspeção e controlo das flags.
-- Executar no SQL Editor do projeto de STAGING.

-- 1. Ver o estado atual de todas as flags do autopilot.
select key, value
from public.app_settings
where key in (
  'sales_autopilot_enabled','auto_outreach_enabled','auto_reply_enabled',
  'customer_lifecycle_enabled','value_report_enabled','autopilot_dry_run',
  'autopilot_kill_switch','autopilot_require_approval','autopilot_ai_enabled',
  'autopilot_min_score','autopilot_max_sends_per_day',
  'autopilot_max_sends_per_domain_per_day','autopilot_followup_gap_days'
)
order by key;

-- 2. Confirmar que a organização existe (pré-requisito das flags).
select id, legal_name, nif from public.organizations;

-- 3. KILL SWITCH — para tudo imediatamente (emergência).
update public.app_settings
set value = 'true'::jsonb
where key = 'autopilot_kill_switch';

-- 4. Desligar o kill switch (retomar, mantendo simulação).
update public.app_settings
set value = 'false'::jsonb
where key = 'autopilot_kill_switch';

-- 5. Modo SIMULAÇÃO (recomendado para começar): liga motor, sem enviar.
update public.app_settings set value = 'true'::jsonb  where key = 'sales_autopilot_enabled';
update public.app_settings set value = 'true'::jsonb  where key = 'autopilot_dry_run';
update public.app_settings set value = 'false'::jsonb where key = 'auto_outreach_enabled';

-- 6. Envio real COM aprovação humana (só após validar a simulação):
-- update public.app_settings set value = 'false'::jsonb where key = 'autopilot_dry_run';
-- update public.app_settings set value = 'true'::jsonb  where key = 'auto_outreach_enabled';
-- update public.app_settings set value = 'true'::jsonb  where key = 'autopilot_require_approval';

-- 7. Verificar mensagens à espera de aprovação.
select id, to_email, subject, status, created_at
from public.outreach_messages
where status = 'pending_approval'
order by created_at asc;
