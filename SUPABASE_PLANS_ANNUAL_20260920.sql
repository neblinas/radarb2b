-- Radar B2B plans: add annual billing option.
-- Apply after the core CRM/billing migration that creates public.plans.
-- Adds an annual price per plan. The annual figures are rounded as agreed:
--   Starter: 19 EUR/month -> 228 EUR/year, -10% -> 205 EUR/year
--   Pro:     39 EUR/month -> 468 EUR/year, -15% -> 398 EUR/year
-- The Stripe price ids for annual billing are configured later, when Stripe is wired up.

alter table public.plans add column if not exists price_annual numeric;
alter table public.plans add column if not exists stripe_price_id_annual text;

update public.plans set price_annual = 205 where id = 'starter' and price_annual is null;
update public.plans set price_annual = 398 where id = 'pro' and price_annual is null;
