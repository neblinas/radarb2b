-- Radar B2B — Motor de comissões comerciais (v1).
-- Run once in Supabase SQL Editor as project owner.
--
-- Objetivo: ligar subscrições de clientes ao comercial que as trouxe e gerar
-- movimentos de comissão segundo regras versionadas, de forma IDEMPOTENTE.
--
-- Regras (v1):
--   Direto mensal : 100% da 1.ª mensalidade + 10% nos meses 2 a 6 + 3% (retenção) do mês 7+
--   Direto anual  : 20% da subscrição (pagamento único)
--   Equipa nível1 : 50% da 2.ª mensalidade (mensal) / 5% (anual)
--   Equipa nível2 : 20% das comissões de equipa nível 1 / 2% (anual) — ver rules
--   Recrutador    : 5% da comissão direta do recrutado, primeiros 6 meses
--
-- Todos os valores são LÍQUIDOS (sem IVA) e em EUR.

-- ---------------------------------------------------------------------------
-- 1. Código de referência por comercial (link ?ref=CODIGO)
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_referral_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (code)
);

-- Gera um código a partir do email (parte local), garantindo unicidade.
create or replace function public.commercial_generate_referral_code(p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  suffix integer := 0;
  email_local text;
begin
  select split_part(coalesce(u.email, 'comercial'), '@', 1)
    into email_local
    from auth.users u where u.id = p_user_id;

  base := regexp_replace(lower(coalesce(email_local, 'comercial')), '[^a-z0-9]', '', 'g');
  base := left(nullif(base, ''), 12);
  if base is null then base := 'comercial'; end if;

  candidate := base;
  while exists (select 1 from public.commercial_referral_codes where code = candidate) loop
    suffix := suffix + 1;
    candidate := base || suffix::text;
  end loop;

  return candidate;
end;
$$;

-- Garante (idempotente) um código para um comercial.
create or replace function public.commercial_ensure_referral_code(p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  existing text;
  org uuid;
begin
  select code into existing from public.commercial_referral_codes where user_id = p_user_id;
  if existing is not null then return existing; end if;

  select organization_id into org from public.organization_members where user_id = p_user_id limit 1;
  if org is null then org := public.crm_organization_id(); end if;

  insert into public.commercial_referral_codes (organization_id, user_id, code)
  values (org, p_user_id, public.commercial_generate_referral_code(p_user_id))
  on conflict (organization_id, user_id) do nothing
  returning code into existing;

  if existing is null then
    select code into existing from public.commercial_referral_codes where user_id = p_user_id;
  end if;
  return existing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Atribuição cliente -> comercial (quem trouxe)
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_attributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  commercial_user_id uuid not null references auth.users(id) on delete cascade,
  method text not null default 'referral_link' check (method in ('referral_link', 'manual', 'prospection')),
  referral_code text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_user_id)
);

create index if not exists commercial_attributions_commercial_idx
  on public.commercial_attributions (organization_id, commercial_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Regras versionadas
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null,
  -- direto mensal
  direct_monthly_first_pct numeric not null default 100,
  direct_monthly_follow_pct numeric not null default 10,
  direct_monthly_follow_months integer not null default 5,
  direct_monthly_retention_pct numeric not null default 3,
  direct_monthly_retention_from_month integer not null default 7,
  -- direto anual
  direct_annual_pct numeric not null default 20,
  -- equipa mensal
  team_monthly_pct numeric not null default 50,
  team_monthly_month integer not null default 2,
  -- equipa anual
  team_annual_pct numeric not null default 5,
  -- segundo nível (sobre a comissão do nível 1)
  team_level2_pct_of_level1 numeric not null default 20,
  -- recrutador
  recruiter_pct_of_direct numeric not null default 5,
  recruiter_months integer not null default 6,
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  unique (organization_id, version)
);

-- Insere a versão 1 para a organização caso não exista.
insert into public.commercial_commission_rules (organization_id, version)
select organization.id, 1 from public.organizations organization
where not exists (
  select 1 from public.commercial_commission_rules rule where rule.organization_id = organization.id
);

-- ---------------------------------------------------------------------------
-- 4. Estender o ledger de comissões
-- ---------------------------------------------------------------------------
alter table public.commercial_commission_ledger
  add column if not exists rule_version integer,
  add column if not exists level integer not null default 1,
  add column if not exists commission_month integer,
  add column if not exists client_user_id uuid references auth.users(id),
  add column if not exists gross_amount numeric(12,2),
  add column if not exists kind text;

-- Commission_type passa a suportar os novos tipos.
alter table public.commercial_commission_ledger
  drop constraint if exists commercial_commission_ledger_commission_type_check;
alter table public.commercial_commission_ledger
  add constraint commercial_commission_ledger_commission_type_check
  check (commission_type in (
    'direct_subscription', 'team_subscription', 'adjustment',
    'retention_bonus', 'recruiter_bonus', 'team_level2'
  ));

-- Coluna gerada para idempotência (ON CONFLICT exige colunas, não expressões).
alter table public.commercial_commission_ledger
  add column if not exists commission_month_key integer
  generated always as (coalesce(commission_month, 0)) stored;

-- Idempotência: um movimento por (subscrição, beneficiário, tipo, mês).
create unique index if not exists commercial_commission_unique_idx
  on public.commercial_commission_ledger
  (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key);

-- ---------------------------------------------------------------------------
-- 5. Motor de cálculo (idempotente)
-- ---------------------------------------------------------------------------
-- Gera/atualiza os movimentos de comissão de uma subscrição, com base na
-- atribuição do cliente e no número de meses efetivamente pagos (p_paid_months).
-- Reexecutável sem duplicar: usa o índice único.
create or replace function public.commission_sync_subscription(
  p_subscription_id uuid,
  p_paid_months integer default null,   -- n.º de mensalidades pagas (mensal); null = inferir pelo período
  p_is_annual boolean default null
)
returns setof public.commercial_commission_ledger
language plpgsql security definer set search_path = public as $$
declare
  sub record;
  attribution record;
  rule record;
  v_is_annual boolean;
  v_paid_months integer;
  v_monthly numeric;
  v_annual numeric;
  v_base numeric;          -- valor de referência da comissão (1 mensalidade ou anual)
  v_sub_id text;           -- id da subscrição como texto (coluna ledger.subscription_id é text)
  v_direct_beneficiary uuid;
  v_manager uuid;
  v_manager2 uuid;
  v_month integer;
  v_amount numeric;
  rec record;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager', 'commercial']) then
    raise exception 'CRM access denied';
  end if;

  select * into sub from public.subscriptions where id = p_subscription_id;
  if sub.id is null then raise exception 'Subscription not found'; end if;

  v_sub_id := sub.id::text;

  select * into attribution
    from public.commercial_attributions
    where client_user_id = sub.user_id and status = 'active'
    limit 1;
  if attribution.id is null then return; end if;  -- sem comercial atribuído

  select * into rule
    from public.commercial_commission_rules
    where organization_id = attribution.organization_id
    order by version desc limit 1;

  select price_monthly, price_annual into v_monthly, v_annual
    from public.plans where id = sub.plan_id;

  v_is_annual := coalesce(p_is_annual,
    case when v_annual is not null and v_monthly is not null and v_monthly > 0
      then v_annual > v_monthly * 6 else false end);

  v_direct_beneficiary := attribution.commercial_user_id;
  select manager_id into v_manager from public.organization_members where user_id = v_direct_beneficiary limit 1;
  if v_manager is not null then
    select manager_id into v_manager2 from public.organization_members where user_id = v_manager limit 1;
  end if;

  -- =============== VENDA DIRETA ===============
  if v_is_annual then
    v_base := coalesce(v_annual, 0);
    v_amount := round(v_base * rule.direct_annual_pct / 100.0, 2);

    insert into public.commercial_commission_ledger
      (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
       commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
    values
      (attribution.organization_id, v_direct_beneficiary, v_direct_beneficiary, sub.user_id, v_sub_id, sub.plan_id,
       'direct_subscription', v_amount, v_base, 'pending', rule.version, 1, null, 'direct_annual', '20% subscrição anual')
    on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key)
    do update set amount = excluded.amount, gross_amount = excluded.gross_amount, rule_version = excluded.rule_version;
  else
    v_base := coalesce(v_monthly, 0);

    -- Sem p_paid_months, infere pelos meses decorridos desde o início do período (mín. 1).
    v_paid_months := coalesce(p_paid_months,
      greatest(1, (date_part('month', age(coalesce(sub.current_period_start, sub.created_at), sub.created_at)))::int + 1));

    for v_month in 1..v_paid_months loop
      if v_month = 1 then
        v_amount := round(v_base * rule.direct_monthly_first_pct / 100.0, 2);
        insert into public.commercial_commission_ledger
          (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
           commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
        values
          (attribution.organization_id, v_direct_beneficiary, v_direct_beneficiary, sub.user_id, v_sub_id, sub.plan_id,
           'direct_subscription', v_amount, v_base, 'pending', rule.version, 1, 1, 'direct_first', '100% da 1.ª mensalidade')
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key)
        do update set amount = excluded.amount, gross_amount = excluded.gross_amount;

      elsif v_month between 2 and (1 + rule.direct_monthly_follow_months) then
        v_amount := round(v_base * rule.direct_monthly_follow_pct / 100.0, 2);
        insert into public.commercial_commission_ledger
          (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
           commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
        values
          (attribution.organization_id, v_direct_beneficiary, v_direct_beneficiary, sub.user_id, v_sub_id, sub.plan_id,
           'direct_subscription', v_amount, v_base, 'pending', rule.version, 1, v_month, 'direct_follow',
           rule.direct_monthly_follow_pct::text || '% mês ' || v_month)
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key)
        do update set amount = excluded.amount, gross_amount = excluded.gross_amount;

      elsif v_month >= rule.direct_monthly_retention_from_month then
        v_amount := round(v_base * rule.direct_monthly_retention_pct / 100.0, 2);
        insert into public.commercial_commission_ledger
          (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
           commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
        values
          (attribution.organization_id, v_direct_beneficiary, v_direct_beneficiary, sub.user_id, v_sub_id, sub.plan_id,
           'retention_bonus', v_amount, v_base, 'pending', rule.version, 1, v_month, 'retention',
           rule.direct_monthly_retention_pct::text || '% retenção mês ' || v_month)
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key)
        do update set amount = excluded.amount, gross_amount = excluded.gross_amount;
      end if;
    end loop;
  end if;

  -- =============== EQUIPA (níveis 1 e 2) ===============
  if v_manager is not null and v_manager <> v_direct_beneficiary then
    for rec in
      select ledger.id, ledger.amount, ledger.commission_month, ledger.kind, ledger.commission_type
      from public.commercial_commission_ledger ledger
      where ledger.subscription_id = sub.id::text
        and ledger.beneficiary_id = v_direct_beneficiary
        and ledger.commission_type in ('direct_subscription')
    loop
      -- Nível 1: 50% da 2.ª mensalidade (mensal) / 5% (anual) — só quando o mês aplicável estiver pago.
      if v_is_annual then
        v_amount := round(coalesce(rec.amount, 0) * rule.team_annual_pct / 100.0, 2);
      elsif rec.commission_month = rule.team_monthly_month then
        -- 50% da mensalidade (não 50% da comissão direta) para manter a regra de negócio.
        v_amount := round(coalesce(v_monthly, 0) * rule.team_monthly_pct / 100.0, 2);
      else
        continue;
      end if;

      insert into public.commercial_commission_ledger
        (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
         commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
      values
        (attribution.organization_id, v_manager, v_direct_beneficiary, sub.user_id, v_sub_id, sub.plan_id,
         'team_subscription', v_amount, v_base, 'pending', rule.version, 1,
         case when v_is_annual then null else rule.team_monthly_month end,
         case when v_is_annual then 'team_annual' else 'team_second_month' end,
         case when v_is_annual then '5% subscrição anual (equipa)' else '50% da 2.ª mensalidade (equipa)' end)
      on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key)
      do update set amount = excluded.amount, gross_amount = excluded.gross_amount;

      -- Nível 2: percentagem da comissão de nível 1.
      if v_manager2 is not null and v_manager2 <> v_manager then
        insert into public.commercial_commission_ledger
          (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
           commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
        values
          (attribution.organization_id, v_manager2, v_manager, sub.user_id, v_sub_id, sub.plan_id,
           'team_level2', round(v_amount * rule.team_level2_pct_of_level1 / 100.0, 2), v_amount, 'pending', rule.version, 2,
           case when v_is_annual then null else rule.team_monthly_month end, 'team_level2', 'nível 2 de equipa')
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key)
        do update set amount = excluded.amount, gross_amount = excluded.gross_amount;
      end if;
    end loop;
  end if;

  -- =============== RECRUTADOR (5% da comissão direta do recrutado, 6 meses) ===============
  if v_manager is not null and v_manager <> v_direct_beneficiary then
    -- Só se o recrutado começou há menos de recruiter_months.
    if sub.created_at >= now() - (rule.recruiter_months || ' months')::interval then
      for rec in
        select sum(ledger.amount) as direct_total
        from public.commercial_commission_ledger ledger
        where ledger.subscription_id = v_sub_id and ledger.beneficiary_id = v_direct_beneficiary
          and ledger.commission_type = 'direct_subscription'
      loop
        if coalesce(rec.direct_total, 0) > 0 then
          insert into public.commercial_commission_ledger
            (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
             commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
          values
            (attribution.organization_id, v_manager, v_direct_beneficiary, sub.user_id, v_sub_id, sub.plan_id,
             'recruiter_bonus', round(rec.direct_total * rule.recruiter_pct_of_direct / 100.0, 2),
             rec.direct_total, 'pending', rule.version, 1, null, 'recruiter', '5% da comissão direta do recrutado')
          on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key)
          do update set amount = excluded.amount, gross_amount = excluded.gross_amount;
        end if;
      end loop;
    end if;
  end if;

  return query
    select * from public.commercial_commission_ledger where subscription_id = v_sub_id;
  end;
  $$;

-- ---------------------------------------------------------------------------
-- 6. RPCs para o portal
-- ---------------------------------------------------------------------------
-- Clientes subscritores do comercial (ou da sua equipa, se gestor).
create or replace function public.commercial_my_clients()
returns table (
  client_user_id uuid,
  client_email text,
  plan_id text,
  status text,
  started_at timestamptz,
  current_period_end timestamptz,
  is_annual boolean,
  commercial_user_id uuid,
  commercial_email text,
  commission_total numeric
)
language sql stable security definer set search_path = public as $$
  select
    attr.client_user_id,
    client_user.email,
    sub.plan_id,
    sub.status,
    sub.created_at,
    sub.current_period_end,
    (plans.price_annual is not null and plans.price_monthly is not null and plans.price_monthly > 0
       and plans.price_annual > plans.price_monthly * 6) as is_annual,
    attr.commercial_user_id,
    commercial_user.email,
    coalesce((
      select sum(ledger.amount) from public.commercial_commission_ledger ledger
      where ledger.client_user_id = attr.client_user_id and ledger.organization_id = attr.organization_id
    ), 0)
  from public.commercial_attributions attr
  join public.subscriptions sub on sub.user_id = attr.client_user_id
  left join public.plans plans on plans.id = sub.plan_id
  left join auth.users client_user on client_user.id = attr.client_user_id
  left join auth.users commercial_user on commercial_user.id = attr.commercial_user_id
  where attr.organization_id = public.crm_organization_id()
    and attr.status = 'active'
    and (
      attr.commercial_user_id = auth.uid()
      or exists (
        select 1 from public.organization_members member
        where member.user_id = attr.commercial_user_id and member.manager_id = auth.uid()
      )
      or public.crm_has_role(array['admin', 'commercial_manager'])
    )
  order by sub.created_at desc;
$$;

-- Extrato detalhado de comissões do comercial (diretas, equipa, bónus).
create or replace function public.commercial_my_earnings()
returns table (
  id uuid,
  created_at timestamptz,
  commission_type text,
  kind text,
  level integer,
  amount numeric,
  status text,
  status_at timestamptz,
  client_email text,
  source_email text,
  rule_version integer,
  note text
)
language sql stable security definer set search_path = public as $$
  select
    ledger.id,
    ledger.created_at,
    ledger.commission_type,
    ledger.kind,
    ledger.level,
    ledger.amount,
    ledger.status,
    coalesce(ledger.paid_at, ledger.created_at),
    client_user.email,
    source_user.email,
    ledger.rule_version,
    ledger.note
  from public.commercial_commission_ledger ledger
  left join auth.users client_user on client_user.id = ledger.client_user_id
  left join auth.users source_user on source_user.id = ledger.source_user_id
  where ledger.organization_id = public.crm_organization_id()
    and (
      ledger.beneficiary_id = auth.uid()
      or exists (
        select 1 from public.organization_members member
        where member.user_id = ledger.beneficiary_id and member.manager_id = auth.uid()
      )
      or public.crm_has_role(array['admin', 'commercial_manager'])
    )
  order by ledger.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS e permissões
-- ---------------------------------------------------------------------------
alter table public.commercial_referral_codes enable row level security;
alter table public.commercial_attributions enable row level security;
alter table public.commercial_commission_rules enable row level security;

drop policy if exists referral_codes_select on public.commercial_referral_codes;
create policy referral_codes_select on public.commercial_referral_codes
  for select using (
    organization_id = public.crm_organization_id()
    and (user_id = auth.uid() or public.crm_has_role(array['admin', 'commercial_manager']))
  );

drop policy if exists attributions_select on public.commercial_attributions;
create policy attributions_select on public.commercial_attributions
  for select using (
    organization_id = public.crm_organization_id()
    and (commercial_user_id = auth.uid() or public.crm_has_role(array['admin', 'commercial_manager']))
  );

drop policy if exists attributions_write on public.commercial_attributions;
create policy attributions_write on public.commercial_attributions
  for insert with check (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

drop policy if exists rules_select on public.commercial_commission_rules;
create policy rules_select on public.commercial_commission_rules
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

grant execute on function public.commercial_ensure_referral_code(uuid) to authenticated;
grant execute on function public.commission_sync_subscription(uuid, integer, boolean) to authenticated;
grant execute on function public.commercial_my_clients() to authenticated;
grant execute on function public.commercial_my_earnings() to authenticated;
