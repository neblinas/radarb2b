-- Adjudata — Price IDs Stripe Live para os planos pagos.
-- Aplicar apenas no projeto de produção Stripe Live.

update public.plans
set stripe_price_id = 'price_1UKKlOQ1Chtp93GSfYgRU9bY',
    stripe_price_id_annual = 'price_1UKKlNQ1Chtp93GSbV0weNqS'
where id = 'starter';

update public.plans
set stripe_price_id = 'price_1UKKlNQ1Chtp93GS7aLzZZXF',
    stripe_price_id_annual = 'price_1UKKlMQ1Chtp93GSRgzb3Z1M'
where id = 'pro';
