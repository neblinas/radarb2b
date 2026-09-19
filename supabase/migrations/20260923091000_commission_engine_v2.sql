-- Radar B2B — Correção do motor de comissões (v2).
-- Run once in Supabase SQL Editor as project owner.
--
-- Corrige a lógica de equipa anual (5% da SUBSCRIÇÃO, não da comissão) e
-- separa os movimentos de equipa mensal/anual no índice de idempotência
-- (via coluna 'kind'), evitando colisões.

-- Incluir 'kind' no índice único para separar tipos distintos no mesmo slot.
-- (ON CONFLICT exige colunas, por isso usamos uma coluna gerada.)
alter table public.commercial_commission_ledger
  add column if not exists kind_key text
  generated always as (coalesce(kind, '')) stored;

drop index if exists public.commercial_commission_unique_idx;
create unique index if not exists commercial_commission_unique_idx
  on public.commercial_commission_ledger
  (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key);

-- Reescreve a função de sincronização com as correções.
create or replace function public.commission_sync_subscription(
  p_subscription_id uuid,
  p_paid_months integer default null,
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
  v_base numeric;
  v_sub_id text;
  v_direct_beneficiary uuid;
  v_manager uuid;
  v_manager2 uuid;
  v_month integer;
  v_amount numeric;
  v_direct_total numeric;
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
  if attribution.id is null then return; end if;

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
    on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
    do update set amount = excluded.amount, gross_amount = excluded.gross_amount, rule_version = excluded.rule_version;
  else
    v_base := coalesce(v_monthly, 0);

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
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
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
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
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
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
        do update set amount = excluded.amount, gross_amount = excluded.gross_amount;
      end if;
    end loop;
  end if;

  -- =============== EQUIPA (nível 1) ===============
  -- Mensal: 50% da mensalidade no mês configurado (2.ª mensalidade), só quando esse mês está pago.
  -- Anual : 5% da SUBSCRIÇÃO anual (valor gross), uma única vez.
  if v_manager is not null and v_manager <> v_direct_beneficiary then
    if v_is_annual then
      v_amount := round(coalesce(v_annual, 0) * rule.team_annual_pct / 100.0, 2);
      insert into public.commercial_commission_ledger
        (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
         commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
      values
        (attribution.organization_id, v_manager, v_direct_beneficiary, sub.user_id, v_sub_id, sub.plan_id,
         'team_subscription', v_amount, coalesce(v_annual, 0), 'pending', rule.version, 1, null, 'team_annual',
         rule.team_annual_pct::text || '% da subscrição anual (equipa)')
      on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
      do update set amount = excluded.amount, gross_amount = excluded.gross_amount;

      if v_manager2 is not null and v_manager2 <> v_manager then
        insert into public.commercial_commission_ledger
          (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
           commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
        values
          (attribution.organization_id, v_manager2, v_manager, sub.user_id, v_sub_id, sub.plan_id,
           'team_level2', round(v_amount * rule.team_level2_pct_of_level1 / 100.0, 2), v_amount, 'pending', rule.version, 2,
           null, 'team_level2', 'nível 2 de equipa (anual)')
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
        do update set amount = excluded.amount, gross_amount = excluded.gross_amount;
      end if;
    else
      -- Só se o mês da 2.ª mensalidade já estiver pago.
      if coalesce(v_paid_months, 0) >= rule.team_monthly_month then
        v_amount := round(coalesce(v_monthly, 0) * rule.team_monthly_pct / 100.0, 2);
        insert into public.commercial_commission_ledger
          (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
           commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
        values
          (attribution.organization_id, v_manager, v_direct_beneficiary, sub.user_id, v_sub_id, sub.plan_id,
           'team_subscription', v_amount, coalesce(v_monthly, 0), 'pending', rule.version, 1, rule.team_monthly_month,
           'team_second_month', rule.team_monthly_pct::text || '% da 2.ª mensalidade (equipa)')
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
        do update set amount = excluded.amount, gross_amount = excluded.gross_amount;

        if v_manager2 is not null and v_manager2 <> v_manager then
          insert into public.commercial_commission_ledger
            (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
             commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
          values
            (attribution.organization_id, v_manager2, v_manager, sub.user_id, v_sub_id, sub.plan_id,
             'team_level2', round(v_amount * rule.team_level2_pct_of_level1 / 100.0, 2), v_amount, 'pending', rule.version, 2,
             rule.team_monthly_month, 'team_level2', 'nível 2 de equipa (mensal)')
          on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
          do update set amount = excluded.amount, gross_amount = excluded.gross_amount;
        end if;
      end if;
    end if;
  end if;

  -- =============== RECRUTADOR (5% da comissão direta do recrutado, 6 meses) ===============
  if v_manager is not null and v_manager <> v_direct_beneficiary then
    if sub.created_at >= now() - (rule.recruiter_months || ' months')::interval then
      select coalesce(sum(ledger.amount), 0) into v_direct_total
      from public.commercial_commission_ledger ledger
      where ledger.subscription_id = v_sub_id and ledger.beneficiary_id = v_direct_beneficiary
        and ledger.commission_type = 'direct_subscription';

      if v_direct_total > 0 then
        insert into public.commercial_commission_ledger
          (organization_id, beneficiary_id, source_user_id, client_user_id, subscription_id, plan_id,
           commission_type, amount, gross_amount, status, rule_version, level, commission_month, kind, note)
        values
          (attribution.organization_id, v_manager, v_direct_beneficiary, sub.user_id, v_sub_id, sub.plan_id,
           'recruiter_bonus', round(v_direct_total * rule.recruiter_pct_of_direct / 100.0, 2),
           v_direct_total, 'pending', rule.version, 1, null, 'recruiter', '5% da comissão direta do recrutado')
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
        do update set amount = excluded.amount, gross_amount = excluded.gross_amount;
      end if;
    end if;
  end if;

  return query
    select * from public.commercial_commission_ledger where subscription_id = v_sub_id;
end;
$$;

grant execute on function public.commission_sync_subscription(uuid, integer, boolean) to authenticated;
