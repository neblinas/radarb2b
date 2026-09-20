-- Radar B2B — Sales Autopilot: fundação (FASE 1).
-- Run once in Supabase SQL Editor as project owner.
--
-- Infra NATIVA em Postgres/Supabase (sem Make.com, sem Redis):
--   * app_settings            — flags/configuração central (feature flags + regras)
--   * automation_jobs         — fila de trabalho persistente, idempotente, com retry
--   * automation_runs         — log estruturado por execução (observabilidade)
--   * automation_events       — state machine do prospect (transições auditáveis)
--   * email_suppressions      — suppression list central (compliance)
--
-- Tudo nasce DESLIGADO (feature flags = false). Nenhum email real é enviado
-- sem ativação explícita. Ver AUTOPILOT.md.

-- ===========================================================================
-- 1. Configuração central / feature flags
-- ===========================================================================
create table if not exists public.app_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value jsonb not null default 'null'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);

-- Valores por omissão para a organização CRM atual (tudo OFF por defeito).
create or replace function public.automation_seed_defaults(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_settings (organization_id, key, value) values
    (p_organization_id, 'sales_autopilot_enabled', 'false'::jsonb),
    (p_organization_id, 'auto_outreach_enabled', 'false'::jsonb),
    (p_organization_id, 'auto_reply_enabled', 'false'::jsonb),
    (p_organization_id, 'customer_lifecycle_enabled', 'false'::jsonb),
    (p_organization_id, 'value_report_enabled', 'false'::jsonb),
    (p_organization_id, 'autopilot_dry_run', 'true'::jsonb),
    (p_organization_id, 'autopilot_kill_switch', 'false'::jsonb),
    (p_organization_id, 'autopilot_min_score', '60'::jsonb),
    (p_organization_id, 'autopilot_max_sends_per_day', '50'::jsonb),
    (p_organization_id, 'autopilot_max_sends_per_domain_per_day', '2'::jsonb),
    (p_organization_id, 'autopilot_prospect_cooldown_days', '30'::jsonb),
    (p_organization_id, 'autopilot_followup_count', '2'::jsonb),
    (p_organization_id, 'autopilot_followup_gap_days', '4'::jsonb),
    (p_organization_id, 'autopilot_ai_auto_reply', 'false'::jsonb),
    (p_organization_id, 'autopilot_ai_reply_confidence', '80'::jsonb),
    (p_organization_id, 'autopilot_send_hour_start', '8'::jsonb),
    (p_organization_id, 'autopilot_send_hour_end', '18'::jsonb),
    (p_organization_id, 'autopilot_send_weekdays_only', 'true'::jsonb)
  on conflict (organization_id, key) do nothing;
end;
$$;

-- Lê uma configuração. Sem role check para uso interno/service role; a leitura
-- pela UI usa automation_settings() (com role check).
create or replace function public.automation_setting_value(p_organization_id uuid, p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.app_settings where organization_id = p_organization_id and key = p_key;
$$;

-- Leitura de todas as configurações (apenas admin/manager).
create or replace function public.automation_settings()
returns table (key text, value jsonb)
language sql stable security definer set search_path = public as $$
  select settings.key, settings.value
  from public.app_settings settings
  where settings.organization_id = public.crm_organization_id()
    and public.crm_has_role(array['admin', 'commercial_manager'])
  order by settings.key;
$$;

-- Escrita de uma configuração (apenas admin/manager). Auditoria automática.
create or replace function public.automation_set_setting(p_key text, p_value jsonb)
returns public.app_settings
language plpgsql security definer set search_path = public as $$
declare updated public.app_settings;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;
  insert into public.app_settings (organization_id, key, value, updated_by, updated_at)
  values (public.crm_organization_id(), p_key, p_value, auth.uid(), now())
  on conflict (organization_id, key) do update
    set value = excluded.value, updated_by = auth.uid(), updated_at = now()
  returning * into updated;
  perform public.crm_audit('automation_setting_updated', 'app_setting', null,
    jsonb_build_object('key', p_key, 'value', p_value));
  return updated;
end;
$$;

-- ===========================================================================
-- 2. Fila de jobs (Postgres, sem Redis)
-- ===========================================================================
create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  -- Idempotência: dois jobs com a mesma dedup_key não coexistem em aberto.
  dedup_key text,
  scheduled_at timestamptz not null default now(),
  -- Correlação para observabilidade.
  correlation_id uuid not null default gen_random_uuid(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_jobs_pick_idx
  on public.automation_jobs (status, scheduled_at, priority)
  where status = 'queued';
create unique index if not exists automation_jobs_dedup_idx
  on public.automation_jobs (organization_id, dedup_key)
  where dedup_key is not null and status in ('queued', 'processing');
create index if not exists automation_jobs_correlation_idx on public.automation_jobs (correlation_id);

-- Enfileira um job. Idempotente quando dedup_key é fornecida.
create or replace function public.automation_enqueue(
  p_job_type text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedup_key text default null,
  p_scheduled_at timestamptz default null,
  p_priority integer default 100
)
returns public.automation_jobs
language plpgsql security definer set search_path = public as $$
declare job public.automation_jobs;
begin
  if p_dedup_key is not null then
    select * into job from public.automation_jobs
      where organization_id = public.crm_organization_id() and dedup_key = p_dedup_key
        and status in ('queued', 'processing')
      limit 1;
    if job.id is not null then return job; end if;
  end if;

  insert into public.automation_jobs
    (organization_id, job_type, entity_type, entity_id, payload, dedup_key, scheduled_at, priority)
  values
    (public.crm_organization_id(), p_job_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb),
     nullif(trim(coalesce(p_dedup_key, '')), ''), coalesce(p_scheduled_at, now()), coalesce(p_priority, 100))
  returning * into job;
  return job;
end;
$$;

-- Reclama atomicamente os próximos jobs disponíveis (SKIP LOCKED → sem workers
-- a colidir no mesmo job). Apenas acessível ao service role (worker nativo).
create or replace function public.automation_claim_jobs(
  p_worker_id text,
  p_limit integer default 5
)
returns setof public.automation_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select id from public.automation_jobs
    where status = 'queued' and scheduled_at <= now()
    order by priority asc, scheduled_at asc
    limit least(greatest(coalesce(p_limit, 5), 1), 50)
    for update skip locked
  )
  update public.automation_jobs job
    set status = 'processing',
        attempts = job.attempts + 1,
        locked_at = now(),
        locked_by = p_worker_id,
        started_at = coalesce(job.started_at, now()),
        updated_at = now()
  from picked
  where job.id = picked.id
  returning job.*;
end;
$$;

-- Conclui um job.
create or replace function public.automation_complete_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.automation_jobs
    set status = 'completed', completed_at = now(), last_error = null,
        locked_at = null, locked_by = null, updated_at = now()
  where id = p_job_id;
end;
$$;

-- Falha um job: reagenda com backoff exponencial até max_attempts.
create or replace function public.automation_fail_job(p_job_id uuid, p_error text)
returns public.automation_jobs
language plpgsql security definer set search_path = public as $$
declare job public.automation_jobs;
begin
  update public.automation_jobs
    set attempts = attempts,
        last_error = left(coalesce(p_error, 'erro desconhecido'), 2000),
        updated_at = now()
  where id = p_job_id
  returning * into job;

  if job.attempts >= job.max_attempts then
    update public.automation_jobs
      set status = 'failed', completed_at = now(), locked_at = null, locked_by = null, updated_at = now()
    where id = p_job_id
    returning * into job;
  else
    -- Backoff: 2^attempts minutos (min 1, max 120).
    update public.automation_jobs
      set status = 'queued',
          scheduled_at = now() + (least(120, greatest(1, power(2, job.attempts)::int)) || ' minutes')::interval,
          locked_at = null, locked_by = null, updated_at = now()
    where id = p_job_id
    returning * into job;
  end if;
  return job;
end;
$$;

-- Desbloqueia jobs presos (worker morreu a meio). Chamado pelo scheduler.
create or replace function public.automation_reap_stuck_jobs(p_timeout_minutes integer default 15)
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  with stuck as (
    update public.automation_jobs
      set status = 'queued', locked_at = null, locked_by = null,
          last_error = coalesce(last_error || ' | ', '') || 'reap: lock expirado',
          updated_at = now()
    where status = 'processing' and locked_at < now() - (p_timeout_minutes || ' minutes')::interval
    returning 1
  )
  select count(*) into affected from stuck;
  return affected;
end;
$$;

-- ===========================================================================
-- 3. Logs estruturados (observabilidade)
-- ===========================================================================
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid references public.automation_jobs(id) on delete set null,
  correlation_id uuid,
  prospect_id uuid references public.sales_prospects(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  campaign_id uuid,
  conversation_id uuid,
  level text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  step text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automation_runs_org_idx on public.automation_runs (organization_id, created_at desc);
create index if not exists automation_runs_correlation_idx on public.automation_runs (correlation_id);

-- Registo de log (sem role check; usado por service role e RPCs internas).
create or replace function public.automation_log(
  p_level text,
  p_step text,
  p_message text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_job_id uuid default null,
  p_correlation_id uuid default null,
  p_prospect_id uuid default null,
  p_company_id uuid default null,
  p_campaign_id uuid default null,
  p_conversation_id uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.automation_runs
    (organization_id, job_id, correlation_id, prospect_id, company_id, campaign_id, conversation_id, level, step, message, metadata)
  values
    (public.crm_organization_id(), p_job_id, p_correlation_id, p_prospect_id, p_company_id, p_campaign_id, p_conversation_id,
     case when p_level in ('debug','info','warn','error') then p_level else 'info' end, p_step, p_message, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- ===========================================================================
-- 4. State machine do prospect (transições auditáveis)
-- ===========================================================================
create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid not null references public.sales_prospects(id) on delete cascade,
  from_state text,
  to_state text not null,
  reason text,
  source text not null default 'automation' check (source in ('automation', 'commercial', 'system', 'webhook', 'user')),
  actor_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automation_events_prospect_idx on public.automation_events (prospect_id, created_at desc);

-- ===========================================================================
-- 5. Suppression list central (compliance)
-- ===========================================================================
create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text,
  domain text,
  company_id uuid references public.companies(id) on delete cascade,
  reason text not null check (reason in ('unsubscribe', 'do_not_contact', 'bounce', 'complaint', 'manual', 'compliance')),
  source text not null default 'manual',
  permanent boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists email_suppressions_email_idx
  on public.email_suppressions (organization_id, email) where email is not null;
create unique index if not exists email_suppressions_domain_idx
  on public.email_suppressions (organization_id, domain) where domain is not null;
create unique index if not exists email_suppressions_company_idx
  on public.email_suppressions (organization_id, company_id) where company_id is not null;

-- Verifica se um email/domínio/company está suprimido (ativo e não expirado).
create or replace function public.is_suppressed(
  p_organization_id uuid,
  p_email text default null,
  p_domain text default null,
  p_company_id uuid default null
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.email_suppressions suppression
    where suppression.organization_id = p_organization_id
      and (suppression.expires_at is null or suppression.expires_at > now())
      and (
        (p_email is not null and suppression.email = lower(trim(p_email)))
        or (p_domain is not null and suppression.domain = lower(trim(p_domain)))
        or (p_company_id is not null and suppression.company_id = p_company_id)
      )
  );
$$;

-- Adiciona uma supressão (admin/manager, ou service role via automation_suppress).
create or replace function public.automation_suppress(
  p_email text default null,
  p_domain text default null,
  p_company_id uuid default null,
  p_reason text default 'manual',
  p_source text default 'manual',
  p_permanent boolean default true,
  p_expires_at timestamptz default null
)
returns public.email_suppressions
language plpgsql security definer set search_path = public as $$
declare created public.email_suppressions;
begin
  if p_reason not in ('unsubscribe','do_not_contact','bounce','complaint','manual','compliance') then
    raise exception 'Motivo de supressão inválido';
  end if;
  if p_email is null and p_domain is null and p_company_id is null then
    raise exception 'Supressão sem alvo';
  end if;

  insert into public.email_suppressions
    (organization_id, email, domain, company_id, reason, source, permanent, expires_at, created_by)
  values
    (public.crm_organization_id(), nullif(lower(trim(coalesce(p_email, ''))), ''),
     nullif(lower(trim(coalesce(p_domain, ''))), ''), p_company_id, p_reason, coalesce(p_source, 'manual'),
     coalesce(p_permanent, true), p_expires_at, auth.uid())
  on conflict do nothing
  returning * into created;

  if created.id is null then
    -- Já existia: devolve a existente.
    select * into created from public.email_suppressions
      where organization_id = public.crm_organization_id()
        and ((p_email is not null and email = lower(trim(p_email)))
          or (p_domain is not null and domain = lower(trim(p_domain)))
          or (p_company_id is not null and company_id = p_company_id))
      limit 1;
  end if;
  return created;
end;
$$;

grant execute on function public.automation_suppress(text, text, uuid, text, text, boolean, timestamptz) to authenticated;

-- ===========================================================================
-- 6. RLS
-- ===========================================================================
alter table public.app_settings enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_events enable row level security;
alter table public.email_suppressions enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

drop policy if exists automation_jobs_select on public.automation_jobs;
create policy automation_jobs_select on public.automation_jobs
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

drop policy if exists automation_events_select on public.automation_events;
create policy automation_events_select on public.automation_events
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

drop policy if exists email_suppressions_select on public.email_suppressions;
create policy email_suppressions_select on public.email_suppressions
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

-- ===========================================================================
-- 7. Permissões
-- ===========================================================================
grant execute on function public.automation_settings() to authenticated;
grant execute on function public.automation_set_setting(text, jsonb) to authenticated;
grant execute on function public.automation_enqueue(text, text, uuid, jsonb, text, timestamptz, integer) to authenticated;
grant execute on function public.automation_log(text, text, text, jsonb, uuid, uuid, uuid, uuid, uuid, uuid) to service_role;

-- Worker/service-role only (sem acesso a authenticated).
revoke all on function public.automation_setting_value(uuid, text) from public;
revoke all on function public.automation_claim_jobs(text, integer) from public;
revoke all on function public.automation_complete_job(uuid) from public;
revoke all on function public.automation_fail_job(uuid, text) from public;
revoke all on function public.automation_reap_stuck_jobs(integer) from public;
grant execute on function public.automation_setting_value(uuid, text) to service_role;
grant execute on function public.automation_claim_jobs(text, integer) to service_role;
grant execute on function public.automation_complete_job(uuid) to service_role;
grant execute on function public.automation_fail_job(uuid, text) to service_role;
grant execute on function public.automation_reap_stuck_jobs(integer) to service_role;

-- Semeia os defaults para a organização existente.
do $$
declare org_id uuid;
begin
  for org_id in select id from public.organizations loop
    perform public.automation_seed_defaults(org_id);
  end loop;
end $$;
