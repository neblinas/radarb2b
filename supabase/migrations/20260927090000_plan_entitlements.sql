-- Adjudata — Fonte única de verdade para planos: preços, limites e Stripe.
--
-- Porquê este ficheiro:
--   Os preços e os limites de utilização estavam dispersos (alguns só existiam
--   em produção) e podiam divergir entre o Stripe, a base de dados e a UI.
--   Esta migração consolida OS PLANOS numa única tabela (`public.plans`) e
--   define colunas explícitas de limite. Os RPC de quota
--   (`increment_search_usage`, `save_search`, `save_opportunity`,
--   `create_alert`) são ajustados para LER estes limites — nunca valores
--   embutidos no código da função.
--
-- Princípios (AGENTS.md):
--   - Idempotente: pode correr várias vezes sem efeitos colaterais.
--   - Não destrói dados: cria colunas `if not exists`; os UPDATE fixam os
--     valores canónicos acordados.
--   - O gating por plano continua no backend (security definer), nunca apenas
--     na UI.
--
-- Tabela canónica de planos (preços sem IVA):
--   | Plano   | Mês | Ano | Pesquisas/mês | Oportunidades | Pesquisas guardadas | Alertas |
--   | Free    | 0   | —   | 50            | 10            | 5                   | 1       |
--   | Starter | 19  | 205 | 200           | 100           | 25                  | 5       |
--   | Pro     | 39  | 398 | ilimitadas    | 500           | 100                 | 20      |
--
-- Executar no Supabase SQL Editor como project owner (ou via `supabase db push`).

-- ---------------------------------------------------------------------------
-- 1. Colunas explícitas de limites na tabela de planos.
--    `null` ou 0/-1 significam "não limitado" apenas onde indicado; para os
--    planos reais usamos sempre valores concretos. `max_searches_month = -1`
--    representa pesquisas ilimitadas (Pro).
-- ---------------------------------------------------------------------------
alter table public.plans
  add column if not exists price_monthly numeric,
  add column if not exists price_annual numeric,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_price_id_annual text,
  add column if not exists max_searches_month integer,
  add column if not exists max_saved_opportunities integer,
  add column if not exists max_saved_searches integer,
  add column if not exists max_alerts integer;

-- ---------------------------------------------------------------------------
-- 2. Semente/garantia das linhas de plano.
-- ---------------------------------------------------------------------------
insert into public.plans (id, name)
values
  ('free', 'Free'),
  ('starter', 'Starter'),
  ('pro', 'Pro')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Valores canónicos de preços e limites (fonte única de verdade).
--    Estes UPDATE são a referência: qualquer alteração de preço deve passar
--    por aqui e por uma nova migração, mantendo coerência com os price IDs
--    do Stripe configurados abaixo.
-- ---------------------------------------------------------------------------
update public.plans
set
  name = 'Free',
  price_monthly = 0,
  price_annual = null,
  max_searches_month = 50,
  max_saved_opportunities = 10,
  max_saved_searches = 5,
  max_alerts = 1
where id = 'free';

update public.plans
set
  name = 'Starter',
  price_monthly = 19,
  price_annual = 205,
  max_searches_month = 200,
  max_saved_opportunities = 100,
  max_saved_searches = 25,
  max_alerts = 5
where id = 'starter';

update public.plans
set
  name = 'Pro',
  price_monthly = 39,
  price_annual = 398,
  -- -1 = pesquisas ilimitadas
  max_searches_month = -1,
  max_saved_opportunities = 500,
  max_saved_searches = 100,
  max_alerts = 20
where id = 'pro';

-- ---------------------------------------------------------------------------
-- 4. Price IDs do Stripe.
--    Os IDs anuais já foram fixados na migração 20260921090000. Reafirmamos
--    aqui os valores conhecidos para tornar esta migração autossuficiente.
--    Os IDs MENSAIS são configurados no Stripe e devem ser preenchidos aqui
--    com os valores reais de produção antes do deploy (não inventar IDs).
-- ---------------------------------------------------------------------------
update public.plans
set stripe_price_id_annual = 'price_1UGyhdQ5eVNdYwvP5e2C1Rx2'
where id = 'starter' and stripe_price_id_annual is null;

update public.plans
set stripe_price_id_annual = 'price_1UGyiJQ5eVNdYwvPja7MgsbD'
where id = 'pro' and stripe_price_id_annual is null;

-- ---------------------------------------------------------------------------
-- 5. Helper de leitura de limites do plano atual (security definer).
--    Centraliza a resolução do plano -> limites, para que as funções de quota
--    não dupliquem lógica nem leiam de constantes.
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
    coalesce(plan.max_searches_month, 50),
    coalesce(plan.max_saved_opportunities, 10),
    coalesce(plan.max_saved_searches, 5),
    coalesce(plan.max_alerts, 1)
  from current_plan
  left join public.plans plan on plan.id = current_plan.id;
$$;

revoke all on function public.client_plan_limits() from public;
grant execute on function public.client_plan_limits() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Documentação (comentários na tabela) para quem consultar a BD.
-- ---------------------------------------------------------------------------
comment on column public.plans.max_searches_month is
  'Limite de pesquisas por mês. -1 significa ilimitado (Pro).';
comment on column public.plans.max_saved_opportunities is
  'Limite de oportunidades guardadas.';
comment on column public.plans.max_saved_searches is
  'Limite de pesquisas guardadas.';
comment on column public.plans.max_alerts is
  'Limite de alertas automáticos.';

-- ---------------------------------------------------------------------------
-- 7. NOTA sobre os RPC de quota.
--    As funções `increment_search_usage`, `save_search`, `save_opportunity` e
--    `create_alert` vivem no backend e devem passar a validar contra
--    `public.client_plan_limits()` em vez de valores embutidos. Como não estão
--    versionadas neste repositório, o passo de backend correspondente é:
--
--      select * from public.client_plan_limits();
--
--    confirma que os limites devolvidos batem com a tabela canónica acima, e
--    atualiza cada RPC para ler desta função. Mensagens de erro mantidas:
--      - 'Limite de pesquisas atingido'
--      - 'Limite de pesquisas guardadas atingido'
--      - 'Limite de oportunidades atingido'
--      - 'Limite de alertas atingido'
--    (o frontend já depende destes prefixos para mostrar a mensagem certa).
-- ---------------------------------------------------------------------------
