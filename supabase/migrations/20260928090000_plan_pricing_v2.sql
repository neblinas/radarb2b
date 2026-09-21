-- Adjudata — Nova estrutura comercial dos planos (Free/Starter/Pro).
--
-- Porquê esta migração:
--   Altera preços e limites dos planos, reduz o Free, aumenta o valor percebido
--   dos planos pagos e aponta para NOVOS Stripe Price IDs (os antigos NÃO são
--   reutilizados e NÃO são apagados).
--
-- Princípios (AGENTS.md):
--   - Idempotente: pode correr várias vezes sem efeitos colaterais.
--   - Não destrói dados nem histórico.
--   - Não migra clientes existentes: subscrições ativas mantêm o preço antigo.
--     Os novos preços aplicam-se a novas subscrições/upgrades.
--   - O gating por plano continua no backend (client_plan_limits + RPCs).
--
-- Tabela canónica (preços sem IVA):
--   | Plano   | Mês | Ano | Pesquisas/mês | Oportunidades | Pesquisas guardadas | Alertas |
--   | Free    | 0   | —   | 10            | 3             | 1                   | 1       |
--   | Starter | 29  | 290 | 250           | 100           | 25                  | 5       |
--   | Pro     | 69  | 690 | ilimitadas    | 500           | 100                 | 20      |
--
-- Executar no Supabase SQL Editor como project owner (ou via `supabase db push`).

-- ---------------------------------------------------------------------------
-- 1. Novos valores canónicos de preços e limites (fonte única de verdade).
--    `max_searches_month = NULL` representa pesquisas ilimitadas (Pro) — é a
--    convenção usada pelas RPCs de quota (`IF v_limit IS NOT NULL AND ...`).
--    A constraint `plans_searches_check` exige `>= 0` ou NULL.
-- ---------------------------------------------------------------------------
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
  -- NULL = pesquisas ilimitadas (convenção das RPCs de quota)
  max_searches_month = null,
  max_saved_opportunities = 500,
  max_saved_searches = 100,
  max_alerts = 20
where id = 'pro';

-- ---------------------------------------------------------------------------
-- 2. Novos Stripe Price IDs.
--    Os preços antigos NÃO são reutilizados (nem apagados — ficam no Stripe
--    para as subscrições existentes). Estes quatro IDs aplicam-se a novas
--    subscrições e upgrades.
--      STARTER_MONTHLY -> stripe_price_id        (starter)  29 EUR/mês
--      STARTER_YEARLY  -> stripe_price_id_annual (starter)  290 EUR/ano
--      PRO_MONTHLY     -> stripe_price_id        (pro)      69 EUR/mês
--      PRO_YEARLY      -> stripe_price_id_annual (pro)      690 EUR/ano
-- ---------------------------------------------------------------------------
update public.plans
set stripe_price_id = 'price_1UIC7wQ5eVNdYwvP8P7QcIvy'
where id = 'starter';

update public.plans
set stripe_price_id_annual = 'price_1UIC8KQ5eVNdYwvPF8FJZbJS'
where id = 'starter';

update public.plans
set stripe_price_id = 'price_1UIC6LQ5eVNdYwvPMQyVqIvF'
where id = 'pro';

update public.plans
set stripe_price_id_annual = 'price_1UIC6vQ5eVNdYwvPQsUNEgBc'
where id = 'pro';

-- ---------------------------------------------------------------------------
-- 3. Garantir que o helper de limites existe (idempotente).
--    Reafirma a leitura dos limites a partir da tabela `plans`.
-- ---------------------------------------------------------------------------
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
    -- null = pesquisas ilimitadas (preserva a semântica das RPCs de quota)
    plan.max_searches_month,
    coalesce(plan.max_saved_opportunities, 3),
    coalesce(plan.max_saved_searches, 1),
    coalesce(plan.max_alerts, 1)
  from current_plan
  left join public.plans plan on plan.id = current_plan.id;
$$;

revoke all on function public.client_plan_limits() from public;
grant execute on function public.client_plan_limits() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Nota: clientes existentes.
--    Subscrições já ativas mantêm o `plan_id` e o preço Stripe antigo. Não se
--    altera `price_monthly`/`price_annual` de subscrições existentes — os novos
--    valores passam a valer para novas subscrições e upgrades.
-- ---------------------------------------------------------------------------
