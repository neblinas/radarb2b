-- Radar B2B commercial prospecting. Run once in Supabase SQL Editor as project owner.
-- Uses public procurement data only. No external contacts are created here.

create table if not exists public.sales_prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'NEW' check (status in ('NEW', 'RESEARCHING', 'READY_TO_CONTACT', 'CONTACTED', 'FOLLOW_UP', 'REPLIED', 'DEMO', 'TRIAL', 'NEGOTIATION', 'WON', 'LOST', 'DO_NOT_CONTACT', 'INACTIVE')),
  assigned_to uuid references auth.users(id),
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz,
  last_activity_at timestamptz,
  next_action_at timestamptz,
  converted_at timestamptz,
  converted_by uuid references auth.users(id),
  subscription_id text,
  attribution_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, company_id)
);

create table if not exists public.sales_prospect_score_components (
  prospect_id uuid not null references public.sales_prospects(id) on delete cascade,
  component text not null,
  points integer not null check (points between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  primary key (prospect_id, component)
);

create table if not exists public.company_public_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  website text,
  website_verified boolean not null default false,
  website_source_url text,
  website_verified_by uuid references auth.users(id),
  website_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_public_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_type text not null check (contact_type in ('general_email', 'commercial_email', 'support_email', 'phone', 'address', 'linkedin', 'contact_page', 'other')),
  value text not null,
  normalized_value text not null,
  source_url text not null check (source_url ~* '^https?://'),
  confidence smallint not null default 50 check (confidence between 0 and 100),
  found_at timestamptz not null default now(),
  verified boolean not null default false,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  active boolean not null default true,
  unique (company_id, contact_type, normalized_value)
);

create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.sales_prospects(id) on delete cascade,
  sales_rep_id uuid not null references auth.users(id),
  activity_type text not null check (activity_type in ('CALL', 'EMAIL', 'LINKEDIN', 'WEB_FORM', 'MEETING', 'DEMO', 'NOTE', 'OTHER')),
  outcome text,
  notes text,
  occurred_at timestamptz not null default now(),
  next_action_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_assignment_history (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.sales_prospects(id) on delete cascade,
  from_sales_rep uuid references auth.users(id),
  to_sales_rep uuid references auth.users(id),
  changed_by uuid not null references auth.users(id),
  reason text,
  changed_at timestamptz not null default now()
);

create index if not exists sales_prospects_queue_idx on public.sales_prospects (organization_id, assigned_to, status, next_action_at);
create index if not exists sales_activities_prospect_idx on public.sales_activities (prospect_id, occurred_at desc);
create index if not exists public_contacts_company_idx on public.company_public_contacts (company_id, active, contact_type);

-- The score deliberately uses fixed caps and transparent thresholds. Refresh on a schedule or after imports.
drop materialized view if exists public.company_prospect_scores;
create materialized view public.company_prospect_scores as
with participation as (
  select participant.company_id,
    count(*)::integer as participation_count,
    count(*) filter (where procedure.publication_date >= current_date - interval '12 months')::integer as participation_12m,
    max(procedure.publication_date) as last_participation,
    count(distinct participant.procedure_id)::integer as procedures_count
  from public.procedure_participants participant
  join public.procedures procedure on procedure.id = participant.procedure_id
  group by participant.company_id
), award_stats as (
  select award.company_id,
    count(*)::integer as award_count,
    coalesce(sum(award.award_value), 0)::numeric as total_award_value,
    max(award.award_date) as last_award
  from public.awards award
  group by award.company_id
), contract_stats as (
  select award.company_id, avg(contract.contract_value)::numeric as average_contract_value
  from public.awards award
  join public.contract_awards link on link.award_id = award.id
  join public.contracts contract on contract.id = link.contract_id
  group by award.company_id
), cpv_stats as (
  select award.company_id, count(distinct cpv_link.cpv_id)::integer as cpv_count,
    array_agg(distinct cpv.cpv_code order by cpv.cpv_code) filter (where cpv.cpv_code is not null) as cpv_codes
  from public.awards award
  join public.contract_awards contract_award on contract_award.award_id = award.id
  join public.contract_cpvs cpv_link on cpv_link.contract_id = contract_award.contract_id
  join public.cpvs cpv on cpv.id = cpv_link.cpv_id
  group by award.company_id
), competition as (
  select participant.company_id, count(distinct peer.company_id)::integer as competitor_count
  from public.procedure_participants participant
  join public.procedure_participants peer on peer.procedure_id = participant.procedure_id and peer.company_id <> participant.company_id
  group by participant.company_id
)
select company.id as company_id, company.name, company.nif,
  coalesce(participation.participation_count, 0) as participation_count,
  coalesce(participation.participation_12m, 0) as participation_12m,
  coalesce(award_stats.award_count, 0) as award_count,
  coalesce(award_stats.total_award_value, 0) as total_award_value,
  contract_stats.average_contract_value,
  participation.last_participation, award_stats.last_award,
  coalesce(cpv_stats.cpv_count, 0) as cpv_count, cpv_stats.cpv_codes,
  coalesce(competition.competitor_count, 0) as competitor_count,
  least(25, coalesce(participation.participation_12m, 0) * 3) as recent_activity_points,
  least(20, coalesce(participation.participation_count, 0)) as frequency_points,
  least(14, floor(coalesce(award_stats.total_award_value, 0) / 50000)::integer * 2) as value_points,
  least(13, coalesce(competition.competitor_count, 0)) as competition_points,
  least(8, coalesce(cpv_stats.cpv_count, 0) * 2) as cpv_diversity_points,
  case when participation.last_participation >= current_date - interval '90 days' then 7 when participation.last_participation >= current_date - interval '180 days' then 4 when participation.last_participation is not null then 2 else 0 end as recency_points
from public.companies company
left join participation on participation.company_id = company.id
left join award_stats on award_stats.company_id = company.id
left join contract_stats on contract_stats.company_id = company.id
left join cpv_stats on cpv_stats.company_id = company.id
left join competition on competition.company_id = company.id;

create unique index company_prospect_scores_company_idx on public.company_prospect_scores (company_id);
create index company_prospect_scores_ranking_idx on public.company_prospect_scores ((recent_activity_points + frequency_points + value_points + competition_points + cpv_diversity_points + recency_points) desc, last_participation desc);

create or replace function public.refresh_company_prospect_scores()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then raise exception 'CRM access denied'; end if;
  refresh materialized view public.company_prospect_scores;
end;
$$;

create or replace function public.prospect_queue(
  p_query text default null,
  p_min_score integer default 0,
  p_status text default null,
  p_assignment text default 'all',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  company_id uuid, company_name text, company_nif text, prospect_score integer,
  participation_count integer, participation_12m integer, award_count integer,
  total_award_value numeric, last_participation date, cpv_codes text[],
  prospect_id uuid, prospect_status text, assigned_to uuid, assigned_at timestamptz,
  next_action_at timestamptz, total_count bigint
)
language sql stable security definer set search_path = public as $$
  with queue as (
    select score.company_id, score.name, score.nif,
      (score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points)::integer as total_score,
      score.participation_count, score.participation_12m, score.award_count, score.total_award_value, score.last_participation, score.cpv_codes,
      prospect.id as local_prospect_id, prospect.status, prospect.assigned_to, prospect.assigned_at, prospect.next_action_at
    from public.company_prospect_scores score
    left join public.sales_prospects prospect on prospect.company_id=score.company_id and prospect.organization_id=public.crm_organization_id()
    where public.crm_has_role()
      and (coalesce(p_query, '') = '' or score.name ilike '%' || p_query || '%' or score.nif ilike '%' || p_query || '%')
      and (score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points) >= greatest(coalesce(p_min_score, 0), 0)
      and (p_status is null or prospect.status = p_status)
      and (p_assignment = 'all' or (p_assignment = 'mine' and prospect.assigned_to=auth.uid()) or (p_assignment = 'available' and (prospect.id is null or prospect.assigned_to is null)))
  )
  select company_id, name, nif, total_score, participation_count, participation_12m, award_count, total_award_value, last_participation, cpv_codes,
    local_prospect_id, status, assigned_to, assigned_at, next_action_at, count(*) over()
  from queue
  order by case when local_prospect_id is null or assigned_to is null then 0 else 1 end, total_score desc, last_participation desc nulls last
  limit least(greatest(coalesce(p_page_size, 25), 1), 100)
  offset (least(greatest(coalesce(p_page, 1), 1), 10000) - 1) * least(greatest(coalesce(p_page_size, 25), 1), 100);
$$;

create or replace function public.prospect_score_components(p_company_id uuid)
returns table (component text, points integer, detail text)
language sql stable security definer set search_path = public as $$
  select 'Atividade recente', score.recent_activity_points, score.participation_12m::text || ' participações nos últimos 12 meses' from public.company_prospect_scores score where score.company_id=p_company_id and public.crm_has_role()
  union all select 'Frequência de concursos', score.frequency_points, score.participation_count::text || ' participações registadas' from public.company_prospect_scores score where score.company_id=p_company_id and public.crm_has_role()
  union all select 'Valor adjudicado', score.value_points, coalesce(score.total_award_value, 0)::text || ' EUR adjudicados' from public.company_prospect_scores score where score.company_id=p_company_id and public.crm_has_role()
  union all select 'Concorrência', score.competition_points, score.competitor_count::text || ' concorrentes identificados' from public.company_prospect_scores score where score.company_id=p_company_id and public.crm_has_role()
  union all select 'Diversidade CPV', score.cpv_diversity_points, score.cpv_count::text || ' CPVs associados' from public.company_prospect_scores score where score.company_id=p_company_id and public.crm_has_role()
  union all select 'Recência', score.recency_points, coalesce(score.last_participation::text, 'sem participação datada') from public.company_prospect_scores score where score.company_id=p_company_id and public.crm_has_role();
$$;

create or replace function public.prospect_snapshot(p_company_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'company_id', score.company_id, 'name', score.name, 'nif', score.nif,
    'score', score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points,
    'participation_count', score.participation_count, 'participation_12m', score.participation_12m,
    'award_count', score.award_count, 'total_award_value', score.total_award_value,
    'average_contract_value', score.average_contract_value, 'last_participation', score.last_participation,
    'last_award', score.last_award, 'cpv_codes', coalesce(to_jsonb(score.cpv_codes), '[]'::jsonb),
    'competitor_count', score.competitor_count, 'prospect_id', prospect.id, 'status', prospect.status,
    'assigned_to', prospect.assigned_to, 'assigned_at', prospect.assigned_at, 'next_action_at', prospect.next_action_at,
    'website', profile.website, 'website_verified', coalesce(profile.website_verified, false),
    'website_source_url', profile.website_source_url
  )
  from public.company_prospect_scores score
  left join public.sales_prospects prospect on prospect.company_id=score.company_id and prospect.organization_id=public.crm_organization_id()
  left join public.company_public_profiles profile on profile.company_id=score.company_id
  where score.company_id=p_company_id and public.crm_has_role();
$$;

create or replace function public.prospect_claim(p_company_id uuid)
returns public.sales_prospects language plpgsql security definer set search_path = public as $$
declare prospect public.sales_prospects;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;
  insert into public.sales_prospects (organization_id, company_id, assigned_to, assigned_by, assigned_at, last_activity_at)
  values (public.crm_organization_id(), p_company_id, auth.uid(), auth.uid(), now(), now())
  on conflict (organization_id, company_id) do nothing;
  select * into prospect from public.sales_prospects where organization_id = public.crm_organization_id() and company_id = p_company_id for update;
  if prospect.assigned_to is not null and prospect.assigned_to <> auth.uid() and not public.crm_has_role(array['admin', 'commercial_manager']) then raise exception 'Prospect already assigned'; end if;
  if prospect.assigned_to is distinct from auth.uid() then
    insert into public.sales_assignment_history (prospect_id, from_sales_rep, to_sales_rep, changed_by, reason) values (prospect.id, prospect.assigned_to, auth.uid(), auth.uid(), 'claimed');
    update public.sales_prospects set assigned_to=auth.uid(), assigned_by=auth.uid(), assigned_at=now(), last_activity_at=now(), updated_at=now() where id=prospect.id returning * into prospect;
  end if;
  insert into public.sales_prospect_score_components (prospect_id, component, points, metadata)
  select prospect.id, component, points, jsonb_build_object('detail', detail)
  from public.prospect_score_components(p_company_id)
  on conflict (prospect_id, component) do update set points=excluded.points, metadata=excluded.metadata, calculated_at=now();
  perform public.crm_audit('prospect_claimed', 'sales_prospect', prospect.id, jsonb_build_object('company_id', p_company_id));
  return prospect;
end;
$$;

create or replace function public.prospect_release(p_prospect_id uuid)
returns public.sales_prospects language plpgsql security definer set search_path = public as $$
declare prospect public.sales_prospects;
begin
  select * into prospect from public.sales_prospects where id=p_prospect_id and organization_id=public.crm_organization_id() for update;
  if prospect.id is null then raise exception 'Prospect not found'; end if;
  if prospect.assigned_to <> auth.uid() and not public.crm_has_role(array['admin', 'commercial_manager']) then raise exception 'CRM access denied'; end if;
  insert into public.sales_assignment_history (prospect_id, from_sales_rep, to_sales_rep, changed_by, reason) values (prospect.id, prospect.assigned_to, null, auth.uid(), 'released');
  update public.sales_prospects set assigned_to=null, assigned_by=null, assigned_at=null, updated_at=now() where id=prospect.id returning * into prospect;
  return prospect;
end;
$$;

create or replace function public.prospect_add_activity(p_prospect_id uuid, p_activity_type text, p_outcome text default null, p_notes text default null, p_next_action_at timestamptz default null)
returns public.sales_activities language plpgsql security definer set search_path = public as $$
declare activity public.sales_activities; declare prospect public.sales_prospects;
begin
  select * into prospect from public.sales_prospects where id=p_prospect_id and organization_id=public.crm_organization_id();
  if prospect.id is null or (prospect.assigned_to <> auth.uid() and not public.crm_has_role(array['admin', 'commercial_manager'])) then raise exception 'CRM access denied'; end if;
  insert into public.sales_activities (prospect_id, sales_rep_id, activity_type, outcome, notes, next_action_at) values (p_prospect_id, auth.uid(), p_activity_type, nullif(trim(p_outcome), ''), nullif(trim(p_notes), ''), p_next_action_at) returning * into activity;
  update public.sales_prospects set last_activity_at=now(), next_action_at=p_next_action_at, updated_at=now() where id=p_prospect_id;
  return activity;
end;
$$;

create or replace function public.prospect_confirm_website(p_company_id uuid, p_website text, p_source_url text)
returns public.company_public_profiles language plpgsql security definer set search_path = public as $$
declare profile public.company_public_profiles;
begin
  if not public.crm_has_role() or p_website !~* '^https?://' or p_source_url !~* '^https?://' then raise exception 'Invalid website'; end if;
  insert into public.company_public_profiles (company_id, website, website_verified, website_source_url, website_verified_by, website_verified_at)
  values (p_company_id, p_website, true, p_source_url, auth.uid(), now())
  on conflict (company_id) do update set website=excluded.website, website_verified=true, website_source_url=excluded.website_source_url, website_verified_by=auth.uid(), website_verified_at=now(), updated_at=now()
  returning * into profile;
  return profile;
end;
$$;

alter table public.sales_prospects enable row level security;
alter table public.sales_prospect_score_components enable row level security;
alter table public.company_public_profiles enable row level security;
alter table public.company_public_contacts enable row level security;
alter table public.sales_activities enable row level security;
alter table public.sales_assignment_history enable row level security;

create policy sales_prospect_select on public.sales_prospects for select using (organization_id=public.crm_organization_id() and (assigned_to=auth.uid() or assigned_to is null or public.crm_has_role(array['admin','commercial_manager'])));
create policy sales_components_select on public.sales_prospect_score_components for select using (exists (select 1 from public.sales_prospects p where p.id=prospect_id and p.organization_id=public.crm_organization_id() and (p.assigned_to=auth.uid() or p.assigned_to is null or public.crm_has_role(array['admin','commercial_manager']))));
create policy public_profiles_select on public.company_public_profiles for select using (public.crm_has_role());
create policy public_contacts_select on public.company_public_contacts for select using (public.crm_has_role());
create policy public_contacts_update on public.company_public_contacts for update using (public.crm_has_role()) with check (public.crm_has_role());
create policy public_contacts_insert on public.company_public_contacts for insert with check (public.crm_has_role());
create policy sales_activities_select on public.sales_activities for select using (exists (select 1 from public.sales_prospects p where p.id=prospect_id and p.organization_id=public.crm_organization_id() and (p.assigned_to=auth.uid() or public.crm_has_role(array['admin','commercial_manager']))));
create policy assignments_select on public.sales_assignment_history for select using (exists (select 1 from public.sales_prospects p where p.id=prospect_id and p.organization_id=public.crm_organization_id() and (p.assigned_to=auth.uid() or public.crm_has_role(array['admin','commercial_manager']))));

refresh materialized view public.company_prospect_scores;
