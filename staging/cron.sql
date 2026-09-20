-- Autopilot — agendamento dos workers (Supabase Cron = pg_cron + pg_net).
-- Executar no SQL Editor do projeto de STAGING.
--
-- Pré-requisito: guardar os segredos no Vault (uma vez), para não os deixar
-- em texto no SQL. Substitui os valores < >.
--
--   select vault.create_secret('https://<ref>.functions.supabase.co', 'autopilot_functions_url');
--   select vault.create_secret('<AUTOPILOT_CRON_SECRET>', 'autopilot_cron_secret');
--
-- (Se já existirem, ignora o erro "duplicate key" — é idempotente por nome.)

-- 1. Extensões
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Agendamentos (idempotentes: remove antes de recriar)
select cron.unschedule('autopilot-run')       where exists (select 1 from cron.job where jobname = 'autopilot-run');
select cron.unschedule('autopilot-outreach')  where exists (select 1 from cron.job where jobname = 'autopilot-outreach');
select cron.unschedule('autopilot-lifecycle') where exists (select 1 from cron.job where jobname = 'autopilot-lifecycle');

-- Prospeção: a cada 5 minutos.
select cron.schedule(
  'autopilot-run',
  '*/5 * * * *',
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

-- Outbound: a cada 5 minutos.
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

-- Ciclo de vida: 1x/dia às 06:00.
select cron.schedule(
  'autopilot-lifecycle',
  '0 6 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_functions_url') || '/autopilot-lifecycle',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-autopilot-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'autopilot_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $job$
);

-- 3. Verificação
-- Lista os agendamentos ativos:
select jobid, jobname, schedule, active from cron.job order by jobname;

-- Últimas execuções (confirma que não falham):
select jobid, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 20;
