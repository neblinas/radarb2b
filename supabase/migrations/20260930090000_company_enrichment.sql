-- Adjudata — Prospeção B2B: enriquecimento de empresas (FASE 4).
--
-- Porquê esta migração:
--   Cria a estrutura que regista as execuções de enriquecimento (descoberta de
--   website + recolha de contactos empresariais publicamente disponibilizados)
--   e os contactos recolhidos com proveniência auditável completa. O crawling
--   em si acontece no edge function `enrich-company`, que aplica as proteções
--   de rede (SSRF, robots, rate limit, timeouts).
--
-- Âmbito (Fase 4):
--   * Descobrir o website oficial (com confidence) e recolher contactos
--     empresariais públicos (emails/telefones) com proveniência.
--   * Idempotente: não repete crawling recente sem necessidade.
--   * Não processa prospects com opt-out quando o objetivo é marketing.
--
-- NÃO implementado nesta fase (deliberado):
--   * envio de emails, integração com o Autopilot, campanhas;
--   * cron automático em larga escala.
--
-- Princípios (AGENTS.md):
--   * Idempotente (pode correr várias vezes sem efeitos colaterais).
--   * Não destrói dados nem histórico.
--   * RLS por organização; RPCs security definer com search_path fixo.
--
-- Executar no Supabase SQL Editor como project owner (ou via `supabase db push`).

-- ===========================================================================
-- 1. Execuções de enriquecimento (auditoria + contadores)
-- ===========================================================================
create table if not exists public.company_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Alvo: prospecto (prospect_companies) e/ou empresa do Radar (companies).
  prospect_id uuid references public.prospect_companies(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  target_name text not null,
  -- Website descoberto e como foi descoberto.
  website text check (website is null or website ~* '^https?://'),
  domain text,
  website_confidence smallint check (website_confidence is null or website_confidence between 0 and 100),
  website_method text,
  -- Estado da execução.
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'SKIPPED')),
  pages_crawled integer not null default 0 check (pages_crawled >= 0),
  contacts_found integer not null default 0 check (contacts_found >= 0),
  emails_found integer not null default 0 check (emails_found >= 0),
  phones_found integer not null default 0 check (phones_found >= 0),
  -- Motivo quando a execução é ignorada (opt-out, crawling recente, etc.).
  skipped_reason text,
  error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists company_enrichment_runs_org_idx
  on public.company_enrichment_runs (organization_id, created_at desc);
create index if not exists company_enrichment_runs_prospect_idx
  on public.company_enrichment_runs (prospect_id, created_at desc)
  where prospect_id is not null;
create index if not exists company_enrichment_runs_domain_idx
  on public.company_enrichment_runs (organization_id, domain)
  where domain is not null;

-- ===========================================================================
-- 2. Contactos empresariais recolhidos (proveniência obrigatória)
-- ===========================================================================
create table if not exists public.company_enrichment_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.company_enrichment_runs(id) on delete cascade,
  prospect_id uuid references public.prospect_companies(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  -- Proveniência obrigatória: contacto, URL de origem, domínio, data, tipo,
  -- classification, confidence e método de descoberta.
  contacto text not null check (length(btrim(contacto)) > 0),
  normalizado text not null check (length(btrim(normalizado)) > 0),
  source_url text not null check (source_url ~* '^https?://'),
  domain text not null,
  contact_type text not null check (contact_type in ('email', 'phone')),
  classification text not null default 'UNKNOWN'
    check (classification in ('GENERIC_BUSINESS', 'NAMED_PERSON', 'UNKNOWN')),
  confidence smallint not null default 0 check (confidence between 0 and 100),
  method text not null,
  collected_at timestamptz not null default now(),
  note text,
  -- Um contacto pertencente a um prospect com opt-out fica marcado (não usar
  -- para marketing).
  is_opt_out boolean not null default false,
  created_at timestamptz not null default now(),
  -- Deduplicação lógica por empresa+contacto+domínio.
  unique (organization_id, normalizado, domain)
);

create index if not exists company_enrichment_contacts_org_idx
  on public.company_enrichment_contacts (organization_id, created_at desc);
create index if not exists company_enrichment_contacts_prospect_idx
  on public.company_enrichment_contacts (prospect_id, contact_type, classification);
create index if not exists company_enrichment_contacts_domain_idx
  on public.company_enrichment_contacts (organization_id, domain);

-- ===========================================================================
-- 3. RLS
-- ===========================================================================
alter table public.company_enrichment_runs enable row level security;
alter table public.company_enrichment_contacts enable row level security;

drop policy if exists company_enrichment_runs_select on public.company_enrichment_runs;
create policy company_enrichment_runs_select on public.company_enrichment_runs
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

drop policy if exists company_enrichment_contacts_select on public.company_enrichment_contacts;
create policy company_enrichment_contacts_select on public.company_enrichment_contacts
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

-- ===========================================================================
-- 4. RPCs de orquestração (invocadas pelo edge function `enrich-company`)
-- ===========================================================================
-- Inicia uma execução de enriquecimento. Idempotente por comportamento:
--   * Não recolhe um prospect com opt-out quando o objetivo é marketing.
--   * Ignora crawling recente (últimas 24h sem `force`) e devolve SKIPPED.
-- Devolve a linha da execução criada (ou reutilizada) para o crawler preencher.
create or replace function public.enrichment_run_start(
  p_prospect_id uuid default null,
  p_company_id uuid default null,
  p_target_name text default null,
  p_force boolean default false
)
returns public.company_enrichment_runs
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.crm_organization_id();
  v_run public.company_enrichment_runs;
  v_recent public.company_enrichment_runs;
  v_prospect public.prospect_companies;
  v_opt_out boolean := false;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;

  -- Opt-out: não processar para marketing.
  if p_prospect_id is not null then
    select * into v_prospect from public.prospect_companies
      where id = p_prospect_id and organization_id = v_org;
    if v_prospect.id is not null then
      v_opt_out := v_prospect.opt_out = true or v_prospect.commercial_status = 'OPTED_OUT';
    end if;
  end if;

  -- Crawling recente sem necessidade → SKIPPED (idempotência), salvo `force`.
  if not coalesce(p_force, false) and p_prospect_id is not null then
    select * into v_recent from public.company_enrichment_runs
      where organization_id = v_org
        and prospect_id = p_prospect_id
        and status in ('COMPLETED', 'PARTIAL')
        and created_at > now() - interval '24 hours'
      order by created_at desc limit 1;
    if v_recent.id is not null then
      insert into public.company_enrichment_runs (
        organization_id, prospect_id, company_id, target_name, website, domain,
        website_confidence, website_method, status, pages_crawled, contacts_found,
        emails_found, phones_found, skipped_reason, created_by
      ) values (
        v_org, p_prospect_id, p_company_id,
        coalesce(nullif(btrim(coalesce(p_target_name, '')), ''), v_prospect.name, 'Empresa'),
        v_recent.website, v_recent.domain, v_recent.website_confidence, v_recent.website_method,
        'SKIPPED', 0, 0, 0, 0, 'Crawling recente (menos de 24h) — não repetido', auth.uid()
      )
      returning * into v_run;
      perform public.crm_audit('enrichment_run_skipped', 'company_enrichment_run', v_run.id,
        jsonb_build_object('reason', v_run.skipped_reason));
      return v_run;
    end if;
  end if;

  insert into public.company_enrichment_runs (
    organization_id, prospect_id, company_id, target_name, status, skipped_reason, created_by
  ) values (
    v_org, p_prospect_id, p_company_id,
    coalesce(nullif(btrim(coalesce(p_target_name, '')), ''), v_prospect.name, 'Empresa'),
    case when v_opt_out then 'SKIPPED' else 'RUNNING' end,
    case when v_opt_out then 'Prospect com opt-out — não processado para marketing' else null end,
    auth.uid()
  )
  returning * into v_run;

  perform public.crm_audit('enrichment_run_start', 'company_enrichment_run', v_run.id,
    jsonb_build_object('target', v_run.target_name, 'opt_out', v_opt_out));
  return v_run;
end;
$$;

-- Finaliza uma execução com o resultado do crawler e grava os contactos
-- recolhidos (idempotente por deduplicação: ON CONFLICT atualiza proveniência).
create or replace function public.enrichment_run_finish(
  p_run_id uuid,
  p_status text,
  p_website text default null,
  p_domain text default null,
  p_website_confidence integer default null,
  p_website_method text default null,
  p_pages_crawled integer default 0,
  p_contacts jsonb default '[]'::jsonb,
  p_error text default null
)
returns public.company_enrichment_runs
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.crm_organization_id();
  v_run public.company_enrichment_runs;
  v_emails integer := 0;
  v_phones integer := 0;
  v_total integer := 0;
  v_is_opt_out boolean := false;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;
  if p_status not in ('COMPLETED', 'PARTIAL', 'FAILED', 'SKIPPED') then
    raise exception 'Invalid enrichment status';
  end if;

  select * into v_run from public.company_enrichment_runs
    where id = p_run_id and organization_id = v_org;
  if v_run.id is null then raise exception 'Execução de enriquecimento não encontrada'; end if;

  -- Opt-out do prospect associado: marca os contactos (não usar em marketing).
  if v_run.prospect_id is not null then
    v_is_opt_out := exists (
      select 1 from public.prospect_companies prospect
      where prospect.id = v_run.prospect_id
        and (prospect.opt_out = true or prospect.commercial_status = 'OPTED_OUT')
    );
  end if;

  -- Grava contactos válidos com proveniência completa.
  insert into public.company_enrichment_contacts (
    organization_id, run_id, prospect_id, company_id, contacto, normalizado,
    source_url, domain, contact_type, classification, confidence, method,
    collected_at, note, is_opt_out
  )
  select
    v_org, p_run_id, v_run.prospect_id, v_run.company_id,
    item->>'contacto',
    item->>'normalizado',
    item->>'sourceUrl',
    coalesce(item->>'domain', p_domain),
    item->>'kind',
    coalesce(item->>'classification', 'UNKNOWN'),
    least(greatest(coalesce((item->>'confidence')::integer, 0), 0), 100),
    coalesce(item->>'method', 'official_website_crawl'),
    coalesce((item->>'collectedAt')::timestamptz, now()),
    nullif(item->>'note', ''),
    v_is_opt_out
  from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) item
  where item->>'contacto' is not null
    and item->>'normalizado' is not null
    and item->>'sourceUrl' ~* '^https?://'
    and item->>'kind' in ('email', 'phone')
  on conflict (organization_id, normalizado, domain) do update set
    confidence = greatest(public.company_enrichment_contacts.confidence, excluded.confidence),
    source_url = excluded.source_url,
    collected_at = excluded.collected_at,
    method = excluded.method,
    note = excluded.note,
    is_opt_out = excluded.is_opt_out,
    run_id = excluded.run_id;

  select
    count(*) filter (where contact_type = 'email'),
    count(*) filter (where contact_type = 'phone'),
    count(*)
  into v_emails, v_phones, v_total
  from public.company_enrichment_contacts
  where organization_id = v_org and run_id = p_run_id;

  update public.company_enrichment_runs set
    status = p_status,
    website = coalesce(nullif(btrim(coalesce(p_website, '')), ''), website),
    domain = coalesce(nullif(btrim(coalesce(p_domain, '')), ''), domain),
    website_confidence = coalesce(p_website_confidence, website_confidence),
    website_method = coalesce(nullif(btrim(coalesce(p_website_method, '')), ''), website_method),
    pages_crawled = greatest(coalesce(p_pages_crawled, 0), 0),
    contacts_found = v_total,
    emails_found = v_emails,
    phones_found = v_phones,
    error = nullif(btrim(coalesce(p_error, '')), '')
  where id = p_run_id and organization_id = v_org
  returning * into v_run;

  perform public.crm_audit('enrichment_run_finish', 'company_enrichment_run', v_run.id,
    jsonb_build_object('status', v_run.status, 'contacts', v_total, 'website', v_run.website));
  return v_run;
end;
$$;

-- ===========================================================================
-- 5. RPCs de leitura (lista de execuções e contactos)
-- ===========================================================================
create or replace function public.enrichment_runs_list(p_limit integer default 20)
returns table (
  id uuid, target_name text, prospect_id uuid, company_id uuid, website text,
  domain text, website_confidence smallint, website_method text, status text,
  pages_crawled integer, contacts_found integer, emails_found integer,
  phones_found integer, skipped_reason text, error text, created_by uuid,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select run.id, run.target_name, run.prospect_id, run.company_id, run.website,
    run.domain, run.website_confidence, run.website_method, run.status,
    run.pages_crawled, run.contacts_found, run.emails_found, run.phones_found,
    run.skipped_reason, run.error, run.created_by, run.created_at
  from public.company_enrichment_runs run
  where run.organization_id = public.crm_organization_id() and public.crm_has_role()
  order by run.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create or replace function public.enrichment_contacts_list(
  p_prospect_id uuid default null,
  p_company_id uuid default null,
  p_limit integer default 50
)
returns table (
  id uuid, run_id uuid, prospect_id uuid, company_id uuid, contacto text,
  normalizado text, source_url text, domain text, contact_type text,
  classification text, confidence smallint, method text, collected_at timestamptz,
  note text, is_opt_out boolean
)
language sql stable security definer set search_path = public as $$
  select contact.id, contact.run_id, contact.prospect_id, contact.company_id,
    contact.contacto, contact.normalizado, contact.source_url, contact.domain,
    contact.contact_type, contact.classification, contact.confidence,
    contact.method, contact.collected_at, contact.note, contact.is_opt_out
  from public.company_enrichment_contacts contact
  where contact.organization_id = public.crm_organization_id()
    and public.crm_has_role()
    and (p_prospect_id is null or contact.prospect_id = p_prospect_id)
    and (p_company_id is null or contact.company_id = p_company_id)
  order by
    -- Prioridade: institucional primeiro, nominais depois; maior confiança antes.
    case contact.classification when 'GENERIC_BUSINESS' then 0 when 'UNKNOWN' then 1 else 2 end,
    contact.confidence desc,
    contact.collected_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ===========================================================================
-- 6. Permissões
-- ===========================================================================
revoke all on function public.enrichment_run_start(uuid, uuid, text, boolean) from public;
revoke all on function public.enrichment_run_finish(uuid, text, text, text, integer, text, integer, jsonb, text) from public;
revoke all on function public.enrichment_runs_list(integer) from public;
revoke all on function public.enrichment_contacts_list(uuid, uuid, integer) from public;

grant execute on function public.enrichment_run_start(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.enrichment_run_finish(uuid, text, text, text, integer, text, integer, jsonb, text) to authenticated;
grant execute on function public.enrichment_runs_list(integer) to authenticated;
grant execute on function public.enrichment_contacts_list(uuid, uuid, integer) to authenticated;
