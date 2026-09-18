-- Wire up Stripe annual price ids for each plan.
-- Prices exclude VAT, matching the monthly prices configured earlier.
--   Starter annual: 205 EUR/year -> price_1UGyhdQ5eVNdYwvP5e2C1Rx2
--   Pro annual:     398 EUR/year -> price_1UGyiJQ5eVNdYwvPja7MgsbD

update public.plans
set stripe_price_id_annual = 'price_1UGyhdQ5eVNdYwvP5e2C1Rx2'
where id = 'starter';

update public.plans
set stripe_price_id_annual = 'price_1UGyiJQ5eVNdYwvPja7MgsbD'
where id = 'pro';
