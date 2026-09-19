-- Radar B2B commercial growth: lead discovery and commission tracking.
-- Run in Supabase SQL Editor as project owner.

alter table public.organization_members
  add column if not exists manager_id uuid references auth.users(id);

create table if not exists public.commercial_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  beneficiary_id uuid not null references auth.users(id),
  source_user_id uuid references auth.users(id),
  subscription_id text,
  plan_id text,
  commission_type text not null check (commission_type in ('direct_subscription', 'team_subscription', 'adjustment')),
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  period_start date,
  period_end date,
  note text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists commercial_commission_beneficiary_idx
  on public.commercial_commission_ledger (organization_id, beneficiary_id, created_at desc);

create or replace view public.company_lead_stats as
select
  company.id,
  company.name,
  company.nif,
  count(distinct award.id)::integer as award_count,
  coalesce(sum(award.award_value), 0)::numeric as total_award_value,
  case
    when count(distinct award.id) >= 100 then 'grande'
    when count(distinct award.id) >= 20 then 'medio'
    when count(distinct award.id) >= 5 then 'pequeno'
    else 'micro'
  end as inferred_size
from public.companies company
left join public.awards award on award.company_id = company.id
group by company.id, company.name, company.nif;

alter table public.commercial_commission_ledger enable row level security;

drop policy if exists commercial_commission_select on public.commercial_commission_ledger;
create policy commercial_commission_select
on public.commercial_commission_ledger
for select
using (
  organization_id = public.crm_organization_id()
  and (beneficiary_id = auth.uid() or public.crm_has_role(array['admin', 'commercial_manager']))
);

drop policy if exists commercial_commission_insert on public.commercial_commission_ledger;
create policy commercial_commission_insert
on public.commercial_commission_ledger
for insert
with check (
  organization_id = public.crm_organization_id()
  and public.crm_has_role(array['admin', 'commercial_manager'])
);

drop policy if exists organization_member_manager_update on public.organization_members;
create policy organization_member_manager_update
on public.organization_members
for update
using (
  organization_id = public.crm_organization_id()
  and public.crm_has_role(array['admin', 'commercial_manager'])
)
with check (organization_id = public.crm_organization_id());

create or replace function public.commercial_commission_summary()
returns table (
  beneficiary_id uuid,
  direct_total numeric,
  team_total numeric,
  pending_total numeric,
  paid_total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ledger.beneficiary_id,
    coalesce(sum(ledger.amount) filter (where ledger.commission_type = 'direct_subscription'), 0),
    coalesce(sum(ledger.amount) filter (where ledger.commission_type = 'team_subscription'), 0),
    coalesce(sum(ledger.amount) filter (where ledger.status in ('pending', 'approved')), 0),
    coalesce(sum(ledger.amount) filter (where ledger.status = 'paid'), 0)
  from public.commercial_commission_ledger ledger
  where ledger.organization_id = public.crm_organization_id()
    and (ledger.beneficiary_id = auth.uid() or public.crm_has_role(array['admin', 'commercial_manager']))
  group by ledger.beneficiary_id;
$$;
