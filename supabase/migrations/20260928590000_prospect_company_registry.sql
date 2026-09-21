-- Adjudata — Prospeção B2B: registo de empresas-prospecto (FASE 2).
--
-- Porquê esta migração:
--   Cria a estrutura de dados e os RPCs base do módulo de prospeção B2B:
--   representar empresas potencialmente interessadas na Adjudata, com contactos
--   empresariais públicos, localização, dimensão, estado de enriquecimento,
--   score comercial, estado comercial e opt-out.
--
-- Âmbito (Fase 2) — APENAS dados e backend base:
--   * NÃO faz pesquisa na Internet, crawling nem descoberta de websites;
--   * NÃO envia emails nem fala com o Autopilot;
--   * NÃO cria UI.
--
-- Princípios (AGENTS.md):
--   * Idempotente: pode correr várias vezes sem efeitos colaterais.
--   * Não destrói dados nem histórico.
--   * Não altera preços, Stripe, autenticação, clientes nem o Autopilot.
--   * Reutiliza a tabela de empresas existente (`public.companies`) via relação
--     opcional — NÃO duplica os dados do Radar. Empresas que ainda não existem
--     no Radar são representadas como prospecto "standalone" (company_id nulo).
--   * Sem dados inventados: todos os campos são dados reais de origem conhecida.
--
-- Deduplicação (regra do projeto: NIF como identificador lógico):
--   * `nif` normalizado (só dígitos) tem índice único parcial por organização;
--   * fallback seguro quando não há NIF: `dedup_key` = hash estável de
--     nome normalizado + localidade, com índice único parcial por organização;
--   * `UNIQUE (organization_id, company_id)` quando a empresa está ligada ao
--     Radar (evita dois prospectos para a mesma empresa do Radar).
--
-- Executar no Supabase SQL Editor como project owner (ou via `supabase db push`).

-- ===========================================================================
-- 1. Empresas-prospecto
-- ===========================================================================
create table if not exists public.prospect_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Relação com a tabela de empresas do Radar. Nulo quando a empresa ainda não
  -- existe no Radar (ex.: microempresas/pequenas empresas sem histórico CPV).
  company_id uuid references public.companies(id) on delete set null,

  -- Identificação da empresa.
  name text not null check (length(btrim(name)) > 0),
  nif text,
  -- NIF normalizado (só dígitos) para deduplicação lógica.
  nif_normalized text generated always as (nullif(regexp_replace(coalesce(nif, ''), '\D', '', 'g'), '')) stored,
  cae text,
  activity_description text,

  -- Localização (dados empresariais públicos, quando conhecidos).
  district text,
  municipality text,
  localidade text,
  -- Chave de deduplicação quando não há NIF (nome normalizado + localidade).
  dedup_key text generated always as (
    lower(btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g')))
    || '|' || lower(btrim(coalesce(localidade, '')))
  ) stored,

  -- Dimensão estimada (espelha a escala de `company_lead_stats.inferred_size`).
  estimated_size text check (estimated_size in ('micro', 'pequeno', 'medio', 'grande')),

  -- Website e domínio.
  website text check (website is null or website ~* '^https?://'),
  domain text,

  -- Contacto empresarial.
  phone text,
  email text,
  email_type text check (email_type is null or email_type in ('geral', 'comercial', 'suporte', 'outro')),
  contact_source_url text check (contact_source_url is null or contact_source_url ~* '^https?://'),

  -- Proveniência e enriquecimento.
  company_source text,
  contact_source text,
  discovered_at timestamptz,
  last_verified_at timestamptz,
  enrichment_status text not null default 'NEW'
    check (enrichment_status in (
      'NEW', 'PENDING_ENRICHMENT', 'WEBSITE_FOUND', 'CONTACT_FOUND',
      'VALIDATED', 'ELIGIBLE', 'REJECTED', 'READY_FOR_AUTOPILOT'
    )),

  -- Score comercial e oportunidades (valores derivados de dados reais).
  commercial_score integer check (commercial_score is null or commercial_score between 0 and 100),
  score_reason text,
  matching_opportunities integer not null default 0 check (matching_opportunities >= 0),
  estimated_opportunity_value numeric(14, 2) check (estimated_opportunity_value is null or estimated_opportunity_value >= 0),

  -- Estado comercial.
  commercial_status text not null default 'NEW'
    check (commercial_status in (
      'NEW', 'ELIGIBLE', 'REJECTED', 'READY_FOR_AUTOPILOT', 'IN_AUTOPILOT',
      'CONTACTED', 'CONVERTED', 'OPTED_OUT'
    )),
  last_contacted_at timestamptz,
  contact_count integer not null default 0 check (contact_count >= 0),

  -- Opt-out (oposição a comunicações). Impede reentrada em campanhas.
  opt_out boolean not null default false,
  opt_out_at timestamptz,
  opt_out_reason text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Consistência do opt-out.
  constraint prospect_companies_opt_out_consistent
    check (opt_out = false or (opt_out_at is not null))
);

-- ===========================================================================
-- 2. Índices (deduplicação + consultas frequentes)
-- ===========================================================================
-- Deduplicação por NIF (identificador lógico preferido), por organização.
create unique index if not exists prospect_companies_nif_idx
  on public.prospect_companies (organization_id, nif_normalized)
  where nif_normalized is not null;

-- Deduplicação de fallback quando não há NIF, por organização.
-- Aplica-se apenas a registos sem NIF para não colidir com o índice por NIF.
create unique index if not exists prospect_companies_dedup_idx
  on public.prospect_companies (organization_id, dedup_key)
  where nif_normalized is null;

-- Não ter dois prospectos para a mesma empresa do Radar.
create unique index if not exists prospect_companies_company_idx
  on public.prospect_companies (organization_id, company_id)
  where company_id is not null;

-- Filtros de listagem/fila.
create index if not exists prospect_companies_status_idx
  on public.prospect_companies (organization_id, commercial_status, created_at desc);
create index if not exists prospect_companies_enrichment_idx
  on public.prospect_companies (organization_id, enrichment_status);
create index if not exists prospect_companies_score_idx
  on public.prospect_companies (organization_id, commercial_score desc nulls last);
create index if not exists prospect_companies_domain_idx
  on public.prospect_companies (organization_id, domain)
  where domain is not null;
create index if not exists prospect_companies_name_idx
  on public.prospect_companies (organization_id, lower(name));

-- ===========================================================================
-- 3. Trigger: updated_at + coerção de estado/opt-out
-- ===========================================================================
create or replace function public.prospect_companies_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();

  -- Um prospect com opt-out não pode voltar a entrar em campanhas pela UI.
  if new.opt_out then
    new.opt_out_at := coalesce(new.opt_out_at, now());
    if new.commercial_status in ('READY_FOR_AUTOPILOT', 'IN_AUTOPILOT') then
      new.commercial_status := 'OPTED_OUT';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prospect_companies_touch on public.prospect_companies;
create trigger prospect_companies_touch
  before insert or update on public.prospect_companies
  for each row execute function public.prospect_companies_touch();

-- ===========================================================================
-- 4. RPCs base (repositório server-side) — admin/commercial_manager escrevem,
--    comerciais leem os prospectos da sua organização.
-- ===========================================================================
-- Criar prospect. Idempotente perante NIF (devolve o existente).
create or replace function public.prospect_company_create(
  p_name text,
  p_nif text default null,
  p_cae text default null,
  p_activity_description text default null,
  p_district text default null,
  p_municipality text default null,
  p_localidade text default null,
  p_estimated_size text default null,
  p_website text default null,
  p_domain text default null,
  p_phone text default null,
  p_email text default null,
  p_email_type text default null,
  p_contact_source_url text default null,
  p_company_source text default null,
  p_contact_source text default null,
  p_company_id uuid default null
)
returns public.prospect_companies
language plpgsql security definer set search_path = public as $$
declare
  created public.prospect_companies;
  existing public.prospect_companies;
  v_org uuid := public.crm_organization_id();
  v_nif_normalized text := nullif(regexp_replace(coalesce(p_nif, ''), '\D', '', 'g'), '');
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Nome da empresa obrigatório';
  end if;

  -- Deduplicação por NIF (identificador lógico).
  if v_nif_normalized is not null then
    select * into existing from public.prospect_companies
      where organization_id = v_org and nif_normalized = v_nif_normalized
      limit 1;
    if existing.id is not null then return existing; end if;
  end if;

  begin
    insert into public.prospect_companies (
      organization_id, company_id, name, nif, cae, activity_description,
      district, municipality, localidade, estimated_size,
      website, domain, phone, email, email_type, contact_source_url,
      company_source, contact_source, discovered_at, created_by
    )
    values (
      v_org, p_company_id, btrim(p_name), nullif(btrim(coalesce(p_nif, '')), ''), nullif(btrim(coalesce(p_cae, '')), ''),
      nullif(btrim(coalesce(p_activity_description, '')), ''), nullif(btrim(coalesce(p_district, '')), ''),
      nullif(btrim(coalesce(p_municipality, '')), ''), nullif(btrim(coalesce(p_localidade, '')), ''),
      p_estimated_size, nullif(btrim(coalesce(p_website, '')), ''), nullif(btrim(coalesce(p_domain, '')), ''),
      nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_email, '')), ''), p_email_type,
      nullif(btrim(coalesce(p_contact_source_url, '')), ''), nullif(btrim(coalesce(p_company_source, '')), ''),
      nullif(btrim(coalesce(p_contact_source, '')), ''), now(), auth.uid()
    )
    returning * into created;
  exception when unique_violation then
    -- Já existe um prospect para o mesmo NIF/dedup_key/empresa: devolve o existente.
    select * into created from public.prospect_companies
      where organization_id = v_org
        and (
          (v_nif_normalized is not null and nif_normalized = v_nif_normalized)
          or (p_company_id is not null and company_id = p_company_id)
        )
      limit 1;
  end;

  perform public.crm_audit('prospect_company_created', 'prospect_company', created.id,
    jsonb_build_object('name', created.name, 'nif', created.nif));
  return created;
end;
$$;

-- Atualizar prospect (campos de enriquecimento). Não toca em opt-out via este RPC.
create or replace function public.prospect_company_update(
  p_id uuid,
  p_name text default null,
  p_nif text default null,
  p_cae text default null,
  p_activity_description text default null,
  p_district text default null,
  p_municipality text default null,
  p_localidade text default null,
  p_estimated_size text default null,
  p_website text default null,
  p_domain text default null,
  p_phone text default null,
  p_email text default null,
  p_email_type text default null,
  p_contact_source_url text default null,
  p_company_source text default null,
  p_contact_source text default null,
  p_enrichment_status text default null,
  p_commercial_status text default null,
  p_commercial_score integer default null,
  p_score_reason text default null,
  p_matching_opportunities integer default null,
  p_estimated_opportunity_value numeric default null
)
returns public.prospect_companies
language plpgsql security definer set search_path = public as $$
declare updated public.prospect_companies;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;

  update public.prospect_companies set
    name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
    nif = coalesce(p_nif, nif),
    cae = coalesce(p_cae, cae),
    activity_description = coalesce(p_activity_description, activity_description),
    district = coalesce(p_district, district),
    municipality = coalesce(p_municipality, municipality),
    localidade = coalesce(p_localidade, localidade),
    estimated_size = coalesce(p_estimated_size, estimated_size),
    website = coalesce(p_website, website),
    domain = coalesce(p_domain, domain),
    phone = coalesce(p_phone, phone),
    email = coalesce(p_email, email),
    email_type = coalesce(p_email_type, email_type),
    contact_source_url = coalesce(p_contact_source_url, contact_source_url),
    company_source = coalesce(p_company_source, company_source),
    contact_source = coalesce(p_contact_source, contact_source),
    -- Avanço de enriquecimento: nunca retrocede um estado mais avançado.
    enrichment_status = coalesce(p_enrichment_status, enrichment_status),
    commercial_status = coalesce(p_commercial_status, commercial_status),
    commercial_score = coalesce(p_commercial_score, commercial_score),
    score_reason = coalesce(p_score_reason, score_reason),
    matching_opportunities = coalesce(p_matching_opportunities, matching_opportunities),
    estimated_opportunity_value = coalesce(p_estimated_opportunity_value, estimated_opportunity_value),
    -- Reavaliar a data de verificação quando se atualiza contacto/website.
    last_verified_at = case
      when p_email is not null or p_phone is not null or p_website is not null or p_contact_source_url is not null
        then now() else last_verified_at end
  where id = p_id and organization_id = public.crm_organization_id()
  returning * into updated;

  if updated.id is null then raise exception 'Prospecto não encontrado'; end if;
  perform public.crm_audit('prospect_company_updated', 'prospect_company', updated.id, '{}'::jsonb);
  return updated;
end;
$$;

-- Obter prospect por ID.
create or replace function public.prospect_company_get(p_id uuid)
returns public.prospect_companies
language sql stable security definer set search_path = public as $$
  select * from public.prospect_companies
  where id = p_id
    and organization_id = public.crm_organization_id()
    and public.crm_has_role();
$$;

-- Obter prospect por NIF (normalizado).
create or replace function public.prospect_company_get_by_nif(p_nif text)
returns public.prospect_companies
language sql stable security definer set search_path = public as $$
  select * from public.prospect_companies
  where organization_id = public.crm_organization_id()
    and nif_normalized = nullif(regexp_replace(coalesce(p_nif, ''), '\D', '', 'g'), '')
    and public.crm_has_role();
$$;

-- Listar/filtrar prospects (estado + score + pesquisa). Paginado.
create or replace function public.prospect_company_list(
  p_query text default null,
  p_commercial_status text default null,
  p_enrichment_status text default null,
  p_min_score integer default null,
  p_max_score integer default null,
  p_include_opted_out boolean default true,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid, name text, nif text, cae text, district text, municipality text, localidade text,
  estimated_size text, website text, domain text, email text, email_type text,
  enrichment_status text, commercial_status text, commercial_score integer, score_reason text,
  matching_opportunities integer, estimated_opportunity_value numeric,
  opt_out boolean, last_contacted_at timestamptz, contact_count integer,
  created_at timestamptz, updated_at timestamptz, total_count bigint
)
language sql stable security definer set search_path = public as $$
  with filtered as (
    select prospect.*
    from public.prospect_companies prospect
    where prospect.organization_id = public.crm_organization_id()
      and public.crm_has_role()
      and (coalesce(p_query, '') = ''
        or prospect.name ilike '%' || p_query || '%'
        or prospect.nif ilike '%' || p_query || '%')
      and (p_commercial_status is null or prospect.commercial_status = p_commercial_status)
      and (p_enrichment_status is null or prospect.enrichment_status = p_enrichment_status)
      and (p_min_score is null or prospect.commercial_score >= p_min_score)
      and (p_max_score is null or prospect.commercial_score <= p_max_score)
      and (p_include_opted_out or prospect.opt_out = false)
  )
  select
    id, name, nif, cae, district, municipality, localidade, estimated_size,
    website, domain, email, email_type, enrichment_status, commercial_status,
    commercial_score, score_reason, matching_opportunities, estimated_opportunity_value,
    opt_out, last_contacted_at, contact_count, created_at, updated_at,
    count(*) over()::bigint as total_count
  from filtered
  order by commercial_score desc nulls last, created_at desc
  limit least(greatest(coalesce(p_page_size, 25), 1), 100)
  offset (least(greatest(coalesce(p_page, 1), 1), 10000) - 1) * least(greatest(coalesce(p_page_size, 25), 1), 100);
$$;

-- Marcar opt-out (oposição a comunicações). Idempotente.
create or replace function public.prospect_company_opt_out(p_id uuid, p_reason text default null)
returns public.prospect_companies
language plpgsql security definer set search_path = public as $$
declare updated public.prospect_companies;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;

  update public.prospect_companies set
    opt_out = true,
    opt_out_at = coalesce(opt_out_at, now()),
    opt_out_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), opt_out_reason),
    commercial_status = 'OPTED_OUT',
    updated_at = now()
  where id = p_id and organization_id = public.crm_organization_id()
  returning * into updated;

  if updated.id is null then raise exception 'Prospecto não encontrado'; end if;
  perform public.crm_audit('prospect_company_opt_out', 'prospect_company', updated.id,
    jsonb_build_object('reason', updated.opt_out_reason));
  return updated;
end;
$$;

-- ===========================================================================
-- 5. RLS
-- ===========================================================================
alter table public.prospect_companies enable row level security;

drop policy if exists prospect_companies_select on public.prospect_companies;
create policy prospect_companies_select on public.prospect_companies
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

drop policy if exists prospect_companies_insert on public.prospect_companies;
create policy prospect_companies_insert on public.prospect_companies
  for insert with check (
    organization_id = public.crm_organization_id()
    and public.crm_has_role(array['admin', 'commercial_manager'])
  );

drop policy if exists prospect_companies_update on public.prospect_companies;
create policy prospect_companies_update on public.prospect_companies
  for update using (
    organization_id = public.crm_organization_id()
    and public.crm_has_role(array['admin', 'commercial_manager'])
  )
  with check (organization_id = public.crm_organization_id());

-- ===========================================================================
-- 6. Permissões (RPCs)
-- ===========================================================================
-- As funções `security definer` são executáveis por PUBLIC por omissão;
-- revogar antes de conceder apenas a `authenticated`.
revoke all on function public.prospect_company_create(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid) from public;
revoke all on function public.prospect_company_update(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, integer, text, integer, numeric) from public;
revoke all on function public.prospect_company_get(uuid) from public;
revoke all on function public.prospect_company_get_by_nif(text) from public;
revoke all on function public.prospect_company_list(text, text, text, integer, integer, boolean, integer, integer) from public;
revoke all on function public.prospect_company_opt_out(uuid, text) from public;

grant execute on function public.prospect_company_create(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.prospect_company_update(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, integer, text, integer, numeric) to authenticated;
grant execute on function public.prospect_company_get(uuid) to authenticated;
grant execute on function public.prospect_company_get_by_nif(text) to authenticated;
grant execute on function public.prospect_company_list(text, text, text, integer, integer, boolean, integer, integer) to authenticated;
grant execute on function public.prospect_company_opt_out(uuid, text) to authenticated;
