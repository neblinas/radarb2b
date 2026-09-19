-- Radar B2B — Correção da deteção mensal/anual.
-- Run once in Supabase SQL Editor as project owner.
--
-- BUG: a heurística "price_annual > price_monthly * 6" classificava o plano
-- starter (205 > 19*6=114) como ANUAL mesmo quando a subscrição era mensal.
--
-- CORREÇÃO: a natureza (mensal/anual) determina-se pelo price ID do Stripe da
-- subscrição — comparando com plans.stripe_price_id_annual. Se não houver
-- price ID (ex.: simulação/teste manual), usa-se p_is_annual.

-- Motor interno corrigido.
create or replace function public.commission_engine_internal(
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
  v_plan_annual_price_id text;
  v_month integer;
  v_amount numeric;
  v_direct_total numeric;
begin
  select * into sub from public.subscriptions where id = p_subscription_id;
  if sub.id is null then return; end if;

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

  select price_monthly, price_annual, stripe_price_id_annual
    into v_monthly, v_annual, v_plan_annual_price_id
    from public.plans where id = sub.plan_id;

  -- Mensal vs anual: o price ID do Stripe é a fonte de verdade. Só se não
  -- existir (simulação/atribuição manual) é que caímos no p_is_annual.
  if sub.stripe_price_id is not null and v_plan_annual_price_id is not null then
    v_is_annual := (sub.stripe_price_id = v_plan_annual_price_id);
  else
    v_is_annual := coalesce(p_is_annual, false);
  end if;

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
       'direct_subscription', v_amount, v_base, 'pending', rule.version, 1, null, 'direct_annual',
       rule.direct_annual_pct::text || '% da subscrição anual')
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
           'direct_subscription', v_amount, v_base, 'pending', rule.version, 1, 1, 'direct_first',
           rule.direct_monthly_first_pct::text || '% da 1.ª mensalidade')
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

  -- =============== RECRUTADOR ===============
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
           v_direct_total, 'pending', rule.version, 1, null, 'recruiter',
           rule.recruiter_pct_of_direct::text || '% da comissão direta do recrutado')
        on conflict (organization_id, subscription_id, beneficiary_id, commission_type, commission_month_key, kind_key)
        do update set amount = excluded.amount, gross_amount = excluded.gross_amount;
      end if;
    end if;
  end if;

  return query
    select * from public.commercial_commission_ledger where subscription_id = v_sub_id;
end;
$$;

-- commercial_my_clients corrigido (is_annual pelo price ID do Stripe).
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
    (sub.stripe_price_id is not null and plans.stripe_price_id_annual is not null
       and sub.stripe_price_id = plans.stripe_price_id_annual) as is_annual,
    attr.commercial_user_id,
    commercial_user.email,
    coalesce((
      select sum(ledger.amount) from public.commercial_commission_ledger ledger
      where ledger.client_user_id = attr.client_user_id
        and ledger.beneficiary_id = attr.commercial_user_id
        and ledger.status <> 'cancelled'
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
      or exists (select 1 from public.organization_members m where m.user_id = attr.commercial_user_id and m.manager_id = auth.uid())
      or public.crm_has_role(array['admin', 'commercial_manager'])
    );
$$;

revoke all on function public.commission_engine_internal(uuid, integer, boolean) from public;
grant execute on function public.commercial_my_clients() to authenticated;
