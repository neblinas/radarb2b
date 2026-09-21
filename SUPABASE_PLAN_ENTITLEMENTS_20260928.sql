-- Adjudata — Nova estrutura comercial (Free/Starter/Pro) — cópia para o SQL Editor.
-- Equivalent to supabase/migrations/20260928090000_plan_pricing_v2.sql.

-- 1. Novos preços e limites.
update public.plans
set
  name = 'Free',
  price_monthly = 0,
  price_annual = null,
  max_searches_month = 10,
  max_saved_opportunities = 3,
  max_saved_searches = 1,
  max_alerts = 1
where id = 'free';

update public.plans
set
  name = 'Starter',
  price_monthly = 29,
  price_annual = 290,
  max_searches_month = 250,
  max_saved_opportunities = 100,
  max_saved_searches = 25,
  max_alerts = 5
where id = 'starter';

update public.plans
set
  name = 'Pro',
  price_monthly = 69,
  price_annual = 690,
  max_searches_month = -1,
  max_saved_opportunities = 500,
  max_saved_searches = 100,
  max_alerts = 20
where id = 'pro';

-- 2. Novos Stripe Price IDs (aplicam-se a novas subscrições e upgrades; os
--    preços antigos NÃO são apagados nem reutilizados).
update public.plans set stripe_price_id = 'price_1UIC7wQ5eVNdYwvP8P7QcIvy' where id = 'starter';
update public.plans set stripe_price_id_annual = 'price_1UIC8KQ5eVNdYwvPF8FJZbJS' where id = 'starter';
update public.plans set stripe_price_id = 'price_1UIC6LQ5eVNdYwvPMQyVqIvF' where id = 'pro';
update public.plans set stripe_price_id_annual = 'price_1UIC6vQ5eVNdYwvPQsUNEgBc' where id = 'pro';

-- 3. Helper de limites (idempotente).
create or replace function public.client_plan_limits()
returns table (
  plan_id text,
  max_searches_month integer,
  max_saved_opportunities integer,
  max_saved_searches integer,
  max_alerts integer
)
language sql
stable
security definer
set search_path = public
as $$
  with current_plan as (
    select coalesce(
      (
        select subscription.plan_id
        from public.subscriptions subscription
        where subscription.user_id = auth.uid()
          and subscription.status in ('active', 'trialing', 'past_due')
        order by subscription.updated_at desc nulls last
        limit 1
      ),
      'free'
    ) as id
  )
  select
    plan.id,
    coalesce(plan.max_searches_month, 10),
    coalesce(plan.max_saved_opportunities, 3),
    coalesce(plan.max_saved_searches, 1),
    coalesce(plan.max_alerts, 1)
  from current_plan
  left join public.plans plan on plan.id = current_plan.id;
$$;

revoke all on function public.client_plan_limits() from public;
grant execute on function public.client_plan_limits() to authenticated;
