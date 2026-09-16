-- Radar B2B CRM foundation
-- Run once in Supabase SQL Editor as project owner.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  nif text,
  country text not null default 'Portugal',
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'commercial_manager', 'commercial')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.company_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text not null,
  nif text,
  method text not null default 'manual',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  evidence_url text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.verified_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null,
  method text not null default 'dns_txt',
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired')),
  token_hash text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, domain)
);

create table if not exists public.commercial_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_name text not null,
  contact_name text not null,
  contact_email text,
  stage text not null default 'Novo' check (stage in ('Novo', 'Contactado', 'Qualificado', 'Proposta', 'Ganho', 'Perdido')),
  owner_id uuid references auth.users(id),
  note text,
  source text default 'manual',
  next_action_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commercial_opportunities add column if not exists company_nif text;
alter table public.commercial_opportunities add column if not exists phone text;
alter table public.commercial_opportunities add column if not exists website text;
alter table public.commercial_opportunities add column if not exists contact_channel text;
alter table public.commercial_opportunities add column if not exists last_contact_at timestamptz;

create table if not exists public.commercial_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid references public.commercial_opportunities(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists commercial_opportunities_org_idx on public.commercial_opportunities (organization_id, updated_at desc);
create index if not exists commercial_opportunities_search_idx on public.commercial_opportunities using gin (to_tsvector('simple', company_name || ' ' || contact_name || ' ' || coalesce(contact_email, '')));
create index if not exists audit_log_org_idx on public.admin_audit_log (organization_id, created_at desc);

create or replace function public.crm_has_role(required_roles text[] default array['admin', 'commercial_manager', 'commercial'])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.user_id = auth.uid()
      and member.status = 'active'
      and member.role = any(required_roles)
  )
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = any(required_roles);
$$;

create or replace function public.crm_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid() and status = 'active'
  order by created_at
  limit 1;
$$;

create or replace function public.crm_audit(p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (public.crm_organization_id(), auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.update_crm_member_access(p_user_id uuid, p_role text, p_status text)
returns public.organization_members
language plpgsql security invoker set search_path=public as $$
declare updated public.organization_members;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then raise exception 'CRM access denied'; end if;
  if p_role not in ('admin', 'commercial_manager', 'commercial') then raise exception 'Invalid CRM role'; end if;
  if p_status not in ('active', 'invited', 'suspended') then raise exception 'Invalid CRM status'; end if;
  if p_role = 'admin' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then raise exception 'Only admin can grant admin role'; end if;
  update public.organization_members
  set role = p_role, status = p_status
  where organization_id = public.crm_organization_id() and user_id = p_user_id
  returning * into updated;
  if updated.user_id is null then raise exception 'Member not found'; end if;
  perform public.crm_audit('member_access_updated', 'organization_member', p_user_id, jsonb_build_object('role', p_role, 'status', p_status));
  return updated;
end;
$$;

create or replace function public.create_commercial_opportunity(
  p_company_name text,
  p_contact_name text,
  p_contact_email text default null,
  p_note text default null,
  p_owner_id uuid default null
)
returns public.commercial_opportunities
language plpgsql
security invoker
set search_path = public
as $$
declare created public.commercial_opportunities;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;
  insert into public.commercial_opportunities (organization_id, company_name, contact_name, contact_email, note, owner_id, created_by)
  values (public.crm_organization_id(), trim(p_company_name), trim(p_contact_name), nullif(trim(p_contact_email), ''), nullif(trim(p_note), ''), coalesce(p_owner_id, auth.uid()), auth.uid())
  returning * into created;
  perform public.crm_audit('created', 'commercial_opportunity', created.id, jsonb_build_object('company_name', created.company_name));
  return created;
end;
$$;

-- Radar B2B CRM foundation
-- Run once in Supabase SQL Editor as project owner.

create or replace function public.update_commercial_opportunity_stage(p_id uuid, p_stage text)
returns public.commercial_opportunities
language plpgsql
security invoker
set search_path = public
as $$
declare updated public.commercial_opportunities;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;
  update public.commercial_opportunities
  set stage = p_stage, updated_at = now()
  where id = p_id and organization_id = public.crm_organization_id()
  returning * into updated;
  if updated.id is null then raise exception 'Opportunity not found'; end if;
  perform public.crm_audit('stage_updated', 'commercial_opportunity', updated.id, jsonb_build_object('stage', p_stage));
  return updated;
end;
$$;

create or replace function public.update_commercial_opportunity_details(p_id uuid, p_company_name text, p_contact_name text, p_contact_email text default null, p_note text default null, p_owner_id uuid default null, p_next_action_at timestamptz default null, p_company_nif text default null, p_phone text default null, p_website text default null, p_contact_channel text default null, p_last_contact_at timestamptz default null)
returns public.commercial_opportunities
language plpgsql security invoker set search_path = public as $$
declare updated public.commercial_opportunities;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;
  update public.commercial_opportunities
  set company_name=trim(p_company_name), contact_name=trim(p_contact_name), contact_email=nullif(trim(p_contact_email), ''), note=nullif(trim(p_note), ''), owner_id=coalesce(p_owner_id, owner_id), next_action_at=p_next_action_at, company_nif=nullif(trim(p_company_nif), ''), phone=nullif(trim(p_phone), ''), website=nullif(trim(p_website), ''), contact_channel=nullif(trim(p_contact_channel), ''), last_contact_at=p_last_contact_at, updated_at=now()
  where id=p_id and organization_id=public.crm_organization_id()
  returning * into updated;
  if updated.id is null then raise exception 'Opportunity not found'; end if;
  perform public.crm_audit('details_updated', 'commercial_opportunity', updated.id, jsonb_build_object('company_name', updated.company_name));
  return updated;
end;
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.company_verifications enable row level security;
alter table public.verified_domains enable row level security;
alter table public.commercial_opportunities enable row level security;
alter table public.commercial_notes enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists crm_members_select on public.organization_members;
create policy crm_members_select on public.organization_members for select using (user_id = auth.uid() or (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager'])));

drop policy if exists crm_members_update on public.organization_members;
create policy crm_members_update on public.organization_members for update using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager'])) with check (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

drop policy if exists crm_opportunities_select on public.commercial_opportunities;
create policy crm_opportunities_select on public.commercial_opportunities for select using (organization_id = public.crm_organization_id());

drop policy if exists crm_opportunities_insert on public.commercial_opportunities;
create policy crm_opportunities_insert on public.commercial_opportunities for insert with check (organization_id = public.crm_organization_id() and public.crm_has_role());

drop policy if exists crm_opportunities_update on public.commercial_opportunities;
create policy crm_opportunities_update on public.commercial_opportunities for update using (organization_id = public.crm_organization_id() and public.crm_has_role());

drop policy if exists crm_notes_select on public.commercial_notes;
create policy crm_notes_select on public.commercial_notes for select using (organization_id = public.crm_organization_id());

drop policy if exists crm_notes_insert on public.commercial_notes;
create policy crm_notes_insert on public.commercial_notes for insert with check (organization_id = public.crm_organization_id() and author_id = auth.uid() and public.crm_has_role());

drop policy if exists crm_verification_select on public.company_verifications;
create policy crm_verification_select on public.company_verifications for select using (organization_id = public.crm_organization_id());

drop policy if exists crm_domains_select on public.verified_domains;
create policy crm_domains_select on public.verified_domains for select using (organization_id = public.crm_organization_id());

drop policy if exists crm_audit_select on public.admin_audit_log;
create policy crm_audit_select on public.admin_audit_log for select using (organization_id = public.crm_organization_id() and public.crm_has_role(array['admin', 'commercial_manager']));

insert into public.organizations (legal_name, nif, country)
select 'Tiago Manuel Ferreira Dias - Radar B2B', '222184680', 'Portugal'
where not exists (select 1 from public.organizations where nif = '222184680');

insert into public.organization_members (organization_id, user_id, role, status)
select organization.id, auth_user.id, 'admin', 'active'
from public.organizations organization
cross join auth.users auth_user
where organization.nif = '222184680'
  and auth_user.email = 'vr.gesa@gmail.com'
on conflict (organization_id, user_id) do update set role = 'admin', status = 'active';
