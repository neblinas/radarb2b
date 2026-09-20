-- Radar B2B — Sales Autopilot: painel de controlo e atividade (FASE 6).
-- Run once in Supabase SQL Editor as project owner.
--
--   * user_activity        — último "visto" por utilizador (para health score real)
--   * RPCs de leitura      — runs recentes e dashboard agregado do autopilot
--
-- Nada aqui envia emails; é a camada de observabilidade/controlo usada pela UI.

-- ---------------------------------------------------------------------------
-- 1. Atividade do utilizador (last_seen)
-- ---------------------------------------------------------------------------
create table if not exists public.user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  login_count_30d integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Regista "visto agora" para o utilizador autenticado (chamado pela app).
create or replace function public.activity_touch()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  insert into public.user_activity (user_id, last_seen_at, login_count_30d, updated_at)
  values (v_user, now(), 1, now())
  on conflict (user_id) do update set
    last_seen_at = now(),
    updated_at = now(),
    login_count_30d = case
      when public.user_activity.last_seen_at < now() - interval '1 day'
        then public.user_activity.login_count_30d + 1
      else public.user_activity.login_count_30d
    end;
end;
$$;

grant execute on function public.activity_touch() to authenticated;

-- Correção do health score (F5): passa a usar user_activity quando existir.
create or replace function public.lifecycle_signals_service(
  p_organization_id uuid,
  p_user_id uuid
)
returns table (
  searches_30d integer,
  logins_30d integer,
  days_since_last_seen integer,
  days_to_renewal integer,
  onboarding_incomplete boolean,
  subscription_status text
)
language sql stable security definer set search_path = public as $$
  with usage AS (
    select searches_used from public.usage_monthly
    where user_id = p_user_id order by period_start desc limit 1
  ),
  act AS (
    select last_seen_at, login_count_30d from public.user_activity where user_id = p_user_id
  ),
  sub AS (
    select status, current_period_end from public.subscriptions where user_id = p_user_id limit 1
  ),
  tasks AS (
    select count(*) as pending from public.onboarding_tasks
    where user_id = p_user_id and completed_at is null
  )
  select
    coalesce((select searches_used from usage), 0)::integer,
    coalesce((select login_count_30d from act), 0)::integer,
    case when (select last_seen_at from act) is not null
      then extract(day from now() - (select last_seen_at from act))::integer end,
    case when (select current_period_end from sub) is not null
      then extract(day from (select current_period_end from sub) - now())::integer end,
    coalesce((select pending from tasks) > 0, false),
    (select status from sub);
$$;

revoke all on function public.lifecycle_signals_service(uuid, uuid) from public;
grant execute on function public.lifecycle_signals_service(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Leitura: execuções recentes do autopilot
-- ---------------------------------------------------------------------------
create or replace function public.automation_recent_runs(p_limit integer default 50)
returns table (
  id uuid, level text, step text, message text, metadata jsonb, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.level, r.step, r.message, r.metadata, r.created_at
  from public.automation_runs r
  where r.organization_id = public.crm_organization_id()
    and public.crm_has_role(array['admin', 'commercial_manager'])
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
$$;
grant execute on function public.automation_recent_runs(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Dashboard agregado (uma chamada só para a UI)
-- ---------------------------------------------------------------------------
create or replace function public.autopilot_dashboard()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.crm_has_role(array['admin', 'commercial_manager'])
    then jsonb_build_object('error', 'CRM access denied')
    else jsonb_build_object(
      'outreach', public.outreach_metrics(),
      'inbound', public.inbound_metrics(),
      'lifecycle', public.lifecycle_metrics(),
      'queue', public.automation_status(),
      'flags', coalesce((select jsonb_object_agg(key, value) from public.app_settings
        where organization_id = public.crm_organization_id()
          and key in (
            'sales_autopilot_enabled','auto_outreach_enabled','auto_reply_enabled',
            'customer_lifecycle_enabled','autopilot_dry_run','autopilot_kill_switch',
            'autopilot_ai_enabled'
          )), '{}'::jsonb)
    )
  end;
$$;
grant execute on function public.autopilot_dashboard() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.user_activity enable row level security;

-- Cada utilizador lê apenas a sua própria atividade. O staff acede via service
-- role (worker) — nunca por SELECT direto no browser.
drop policy if exists user_activity_self on public.user_activity;
create policy user_activity_self on public.user_activity
  for select using (user_id = auth.uid());
