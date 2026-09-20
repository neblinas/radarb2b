-- Radar B2B — Sales Autopilot: ciclo de vida de clientes (FASE 5).
-- Run once in Supabase SQL Editor as project owner.
--
--   * customer_lifecycle      — estado de ciclo de vida por cliente (subscription)
--   * lifecycle_events        — histórico auditável
--   * value_reports           — relatórios de valor (enviados periodicamente)
--   * onboarding_tasks        — checklist de ativação
--
-- O estado é calculado por regras (determinístico). A IA (FASE 4) pode ajudar na
-- redação dos relatórios, mas nunca decide elegibilidade.

-- ---------------------------------------------------------------------------
-- 1. Estado de ciclo de vida (por utilizador-cliente)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_lifecycle (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stage text not null default 'onboarding' check (stage in (
    'onboarding', 'activated', 'engaged', 'at_risk', 'dormant',
    'renewal_due', 'renewed', 'churned', 'winback'
  )),
  health_score integer not null default 50 check (health_score between 0 and 100),
  searches_30d integer not null default 0,
  logins_30d integer not null default 0,
  last_seen_at timestamptz,
  last_value_report_at timestamptz,
  renewal_due_at timestamptz,
  churn_risk_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists customer_lifecycle_stage_idx on public.customer_lifecycle (organization_id, stage);
create index if not exists customer_lifecycle_renewal_idx on public.customer_lifecycle (renewal_due_at) where renewal_due_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Eventos de ciclo de vida
-- ---------------------------------------------------------------------------
create table if not exists public.lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  reason text,
  source text not null default 'automation' check (source in ('automation', 'webhook', 'human', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lifecycle_events_user_idx on public.lifecycle_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Relatórios de valor
-- ---------------------------------------------------------------------------
create table if not exists public.value_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  metrics jsonb not null default '{}'::jsonb,
  body text not null,
  status text not null default 'generated' check (status in ('generated', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists value_reports_user_idx on public.value_reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Onboarding (checklist de ativação)
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_key text not null,
  label text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, task_key)
);

-- ---------------------------------------------------------------------------
-- 5. Seleção de clientes para ações de ciclo de vida (service role)
-- ---------------------------------------------------------------------------
-- Devolve clientes que precisam de ação: onboarding incompleto, renovação a
-- aproximar-se, ou risco de churn (inatividade). NÃO envia nada; apenas lista.
create or replace function public.automation_select_lifecycle_targets(
  p_organization_id uuid,
  p_limit integer default 50
)
returns table (
  user_id uuid,
  stage text,
  health_score integer,
  action text,
  renewal_due_at timestamptz,
  searches_30d integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_renewal_days integer;
  v_dormant_days integer;
begin
  v_renewal_days := coalesce((
    select value::text::integer from public.app_settings
    where organization_id = p_organization_id and key = 'lifecycle_renewal_window_days'), 14);
  v_dormant_days := coalesce((
    select value::text::integer from public.app_settings
    where organization_id = p_organization_id and key = 'lifecycle_dormant_days'), 30);

  return query
  with base as (
    select cl.user_id, cl.stage, cl.health_score, cl.renewal_due_at, cl.searches_30d, cl.last_seen_at
    from public.customer_lifecycle cl
    where cl.organization_id = p_organization_id
  )
  select b.user_id, b.stage, b.health_score,
    case
      when b.stage = 'onboarding' and exists (
        select 1 from public.onboarding_tasks t
        where t.user_id = b.user_id and t.completed_at is null
      ) then 'nudge_onboarding'
      when b.renewal_due_at is not null
        and b.renewal_due_at <= now() + make_interval(days => v_renewal_days) then 'renewal_reminder'
      when b.last_seen_at is not null
        and b.last_seen_at < now() - make_interval(days => v_dormant_days) then 'reactivate'
      when b.health_score < 40 then 'check_in'
      else 'value_report'
    end as action,
    b.renewal_due_at, b.searches_30d
  from base b
  left join (
    select user_id, max(created_at) as last_action
    from public.lifecycle_events
    where organization_id = p_organization_id
    group by user_id
  ) e on e.user_id = b.user_id
  where e.last_action is null or e.last_action < now() - interval '7 days'
  order by b.health_score asc, b.renewal_due_at asc nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$$;

-- Aplica (ou cria) o estado de ciclo de vida de um cliente e registra evento.
create or replace function public.automation_set_lifecycle_service(
  p_organization_id uuid,
  p_user_id uuid,
  p_stage text,
  p_health_score integer default null,
  p_reason text default null,
  p_source text default 'automation',
  p_metadata jsonb default '{}'::jsonb
)
returns public.customer_lifecycle
language plpgsql security definer set search_path = public as $$
declare
  existing public.customer_lifecycle;
  previous_stage text;
  row_result public.customer_lifecycle;
begin
  if p_stage not in ('onboarding','activated','engaged','at_risk','dormant','renewal_due','renewed','churned','winback') then
    raise exception 'Estágio inválido: %', p_stage;
  end if;

  select * into existing from public.customer_lifecycle
    where organization_id = p_organization_id and user_id = p_user_id;

  previous_stage := existing.stage;

  insert into public.customer_lifecycle
    (organization_id, user_id, stage, health_score, updated_at)
  values
    (p_organization_id, p_user_id, p_stage, least(100, greatest(0, coalesce(p_health_score, 50))), now())
  on conflict (organization_id, user_id) do update set
    stage = excluded.stage,
    health_score = coalesce(p_health_score, public.customer_lifecycle.health_score),
    updated_at = now()
  returning * into row_result;

  if previous_stage is distinct from p_stage then
    insert into public.lifecycle_events
      (organization_id, user_id, from_stage, to_stage, reason, source, metadata)
    values
      (p_organization_id, p_user_id, previous_stage, p_stage, p_reason,
       case when p_source in ('automation','webhook','human','system') then p_source else 'automation' end,
       coalesce(p_metadata, '{}'::jsonb));
  end if;

  return row_result;
end;
$$;

-- Cria o estado inicial de ciclo de vida quando um cliente passa a pagante.
create or replace function public.automation_ensure_lifecycle_service(
  p_organization_id uuid,
  p_user_id uuid
)
returns public.customer_lifecycle
language plpgsql security definer set search_path = public as $$
declare sub public.subscriptions;
begin
  select * into sub from public.subscriptions where user_id = p_user_id limit 1;
  insert into public.customer_lifecycle
    (organization_id, user_id, plan_id, subscription_id, stage, renewal_due_at, updated_at)
  values
    (p_organization_id, p_user_id, sub.plan_id, sub.id, 'onboarding', sub.current_period_end, now())
  on conflict (organization_id, user_id) do update set
    plan_id = coalesce(excluded.plan_id, public.customer_lifecycle.plan_id),
    subscription_id = coalesce(excluded.subscription_id, public.customer_lifecycle.subscription_id),
    renewal_due_at = coalesce(excluded.renewal_due_at, public.customer_lifecycle.renewal_due_at),
    updated_at = now()
  returning * into sub;

  -- Cria checklist base de onboarding (idempotente).
  insert into public.onboarding_tasks (organization_id, user_id, task_key, label)
  values
    (p_organization_id, p_user_id, 'first_search', 'Fazer a primeira pesquisa'),
    (p_organization_id, p_user_id, 'first_alert', 'Criar o primeiro alerta'),
    (p_organization_id, p_user_id, 'review_profile', 'Rever dados da conta')
  on conflict (user_id, task_key) do nothing;

  return (select * from public.customer_lifecycle where organization_id = p_organization_id and user_id = p_user_id);
end;
$$;

-- Métricas de ciclo de vida (back-office).
create or replace function public.lifecycle_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.crm_has_role(array['admin', 'commercial_manager'])
    then jsonb_build_object('error', 'CRM access denied')
    else jsonb_build_object(
      'by_stage', coalesce((
        select jsonb_object_agg(stage, total)
        from (
          select stage, count(*)::integer as total
          from public.customer_lifecycle
          where organization_id = public.crm_organization_id()
          group by stage
        ) grouped
      ), '{}'::jsonb),
      'at_risk', (select count(*) from public.customer_lifecycle
        where organization_id = public.crm_organization_id() and stage in ('at_risk', 'dormant', 'churned')),
      'renewals_30d', (select count(*) from public.customer_lifecycle
        where organization_id = public.crm_organization_id()
          and renewal_due_at between now() and now() + interval '30 days'),
      'value_reports_30d', (select count(*) from public.value_reports
        where organization_id = public.crm_organization_id() and created_at >= now() - interval '30 days')
    )
  end;
$$;

grant execute on function public.lifecycle_metrics() to authenticated;

revoke all on function public.automation_select_lifecycle_targets(uuid, integer) from public;
revoke all on function public.automation_set_lifecycle_service(uuid, uuid, text, integer, text, text, jsonb) from public;
revoke all on function public.automation_ensure_lifecycle_service(uuid, uuid) from public;

grant execute on function public.automation_select_lifecycle_targets(uuid, integer) to service_role;
grant execute on function public.automation_set_lifecycle_service(uuid, uuid, text, integer, text, text, jsonb) to service_role;
grant execute on function public.automation_ensure_lifecycle_service(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Seeds (idempotente)
-- ---------------------------------------------------------------------------
insert into public.app_settings (organization_id, key, value)
select organization.id, key, value
from public.organizations organization
cross join (values
  ('lifecycle_renewal_window_days', '14'::jsonb),
  ('lifecycle_dormant_days', '30'::jsonb),
  ('lifecycle_value_report_days', '90'::jsonb)
) as defaults(key, value)
on conflict (organization_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
alter table public.customer_lifecycle enable row level security;
alter table public.lifecycle_events enable row level security;
alter table public.value_reports enable row level security;
alter table public.onboarding_tasks enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['customer_lifecycle','lifecycle_events','value_reports','onboarding_tasks']
  loop
    execute format('drop policy if exists %I_select on public.%I', tbl, tbl);
    execute format(
      'create policy %I_select on public.%I for select using (organization_id = public.crm_organization_id() and public.crm_has_role(array[''admin'', ''commercial_manager'']))',
      tbl, tbl);
  end loop;
end $$;

-- O cliente vê o seu próprio estado/onboarding.
drop policy if exists customer_lifecycle_self on public.customer_lifecycle;
create policy customer_lifecycle_self on public.customer_lifecycle
  for select using (user_id = auth.uid());

drop policy if exists onboarding_tasks_self on public.onboarding_tasks;
create policy onboarding_tasks_self on public.onboarding_tasks
  for select using (user_id = auth.uid());
