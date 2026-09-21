-- Adjudata — Colunas de entitlements na tabela de planos (base estrutural).
--
-- NOTA HISTÓRICA (revisão 2026-09-28):
--   Esta migração fixava originalmente os valores canónicos de preços/limites
--   (Free 0; Starter 19; Pro 39) e definia `client_plan_limits()` com
--   `coalesce(max_searches_month, 50)`. Foi SUPERSEDIDA pela migração
--   `20260928090000_plan_pricing_v2.sql`, que passa a ser a FONTE ÚNICA de
--   verdade de preços, limites e Stripe price IDs.
--
--   Para evitar regressão (a migração antiga repunha preços antigos e usava
--   `-1` como "ilimitado", que viola `plans_searches_check`), esta migração
--   foi reduzida ao mínimo: garante apenas a ESTRUTURA (colunas e linhas base),
--   sem fixar valores. Os valores são definidos exclusivamente em
--   `20260928090000_plan_pricing_v2.sql`.
--
-- Princípios (AGENTS.md):
--   - Idempotente: pode correr várias vezes sem efeitos colaterais.
--   - Não destrói dados.
--   - Não reescreve preços nem limites.
-- ---------------------------------------------------------------------------
-- 1. Colunas explícitas de limites na tabela de planos (estrutura).
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
-- 2. Semente/garantia das linhas de plano (sem fixar preços/limites).
--    Os valores canónicos são aplicados em 20260928090000.
-- ---------------------------------------------------------------------------
insert into public.plans (id, name)
values
  ('free', 'Free'),
  ('starter', 'Starter'),
  ('pro', 'Pro')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Documentação (comentários na tabela) para quem consultar a BD.
-- ---------------------------------------------------------------------------
comment on column public.plans.max_searches_month is
  'Limite de pesquisas por mês. NULL significa ilimitado (Pro).';
comment on column public.plans.max_saved_opportunities is
  'Limite de oportunidades guardadas.';
comment on column public.plans.max_saved_searches is
  'Limite de pesquisas guardadas.';
comment on column public.plans.max_alerts is
  'Limite de alertas automáticos.';

