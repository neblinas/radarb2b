-- ===========================================================================
-- Autopilot — agendamento dos workers (Supabase Cron = pg_cron + pg_net).
-- Executar no SQL Editor do projeto (dono).
--
-- SEGURANÇA: não deixa segredos em texto no SQL. Passa-os pelo Vault.
--
-- PASSO A (uma vez): guardar os segredos no Vault.
--   Substitui <FUNCTIONS_URL> e <AUTOPILOT_CRON_SECRET> pelos valores reais.
--   Se já existirem, ignora o erro "duplicate key" (idempotente por nome).
--
--   select vault.create_secret('https://<FUNCTIONS_URL>.supabase.co/functions/v1', 'autopilot_functions_url');
--   select vault.create_secret('<AUTOPILOT_CRON_SECRET>', 'autopilot_cron_secret');
--
--   NOTA: o AUTOPILOT_CRON_SECRET tem de ser IGUAL ao que está configurado nas
--   Edge Functions (supabase secrets set AUTOPILOT_CRON_SECRET="...").
-- ===========================================================================

-- 1. Extensões
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Agendamentos (idempotentes: remove antes de recriar)
select cron.unschedule('autopilot-run')      where exists (select 1 from cron.job where jobname = 'autopilot-run');
select cron.unschedule('autopilot-outreach') where exists (select 1 from cron.job where jobname = 'autopilot-outreach');

-- Prospeção: a cada 10 minutos (conservador — criação de prospects).
select cron.schedule(
  'autopilot-run',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_functions_url') || '/autopilot-run',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-autopilot-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $job$
);

-- Outbound: a cada 5 minutos (processa a fila; com aprovação humana, só prepara).
select cron.schedule(
  'autopilot-outreach',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_functions_url') || '/autopilot-outreach',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-autopilot-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $job$
);

-- 3. Limites de proteção (conservador, com aprovação humana).
--    Salta a chave de aprovação: mantém autopilot_require_approval = true.
insert into public.app_settings (organization_id, key, value)
select o.id, v.key, v.value
from public.organizations o
cross join (values
  ('autopilot_max_sends_per_day', '20'::jsonb),
  ('autopilot_max_sends_per_domain_per_day', '2'::jsonb),
  ('autopilot_require_approval', 'true'::jsonb),
  ('autopilot_send_hour_start', '8'::jsonb),
  ('autopilot_send_hour_end', '18'::jsonb),
  ('autopilot_send_weekdays_only', 'true'::jsonb)
) as v(key, value)
on conflict (organization_id, key) do update set value = excluded.value;

-- 4. Verificação
-- Lista os agendamentos ativos:
select jobid, jobname, schedule, active from cron.job order by jobname;

-- Últimas execuções (confirma que não falham; return_message mostra 200/401):
select jobid, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 20;
