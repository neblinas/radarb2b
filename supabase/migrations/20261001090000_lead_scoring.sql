-- Adjudata — Prospeção B2B: Lead Scoring Engine (FASE 5).
--
-- Porquê esta migração:
--   Cria um motor de scoring DETERMINÍSTICO e AUDITÁVEL que decide quais
--   prospects devem ser priorizados comercialmente. O score (0-100) é
--   calculado apenas a partir de dados objetivos já existentes na Adjudata —
--   NUNCA por IA generativa. A explicação é montada por templates/dados.
--
-- Âmbito (Fase 5):
--   * Configuração central e configurável (pesos, portões, sub-scores).
--   * Score por prospeto com componentes individuais guardados (snapshot).
--   * Explicação gerada a partir de dados objetivos.
--   * Portões configuráveis: 0-39 LOW · 40-59 MEDIUM · 60-79 HIGH · 80-100 VERY_HIGH.
--   * Opt-out NUNCA é elegível para contacto.
--   * Filtros: score, estado, CAE, CPV, localização, contacto, email genérico,
--     nº de oportunidades e valor das oportunidades.
--
-- NÃO implementado nesta fase (deliberado):
--   * envio de emails, integração com o Autopilot, campanhas, automação periódica.
--
-- Princípios (AGENTS.md):
--   * Idempotente (pode correr várias vezes sem efeitos colaterais).
--   * Não destrói dados nem histórico.
--   * RLS por organização; RPCs security definer com search_path fixo.
--   * Não inventa dados: só usa sinais existentes.
--
-- Executar no Supabase SQL Editor como project owner (ou via `supabase db push`).

-- ===========================================================================
-- 1. Configuração central do scoring (espelhada em src/lib/leadScoring/config.ts)
-- ===========================================================================
-- A configuração ATIVA é guardada aqui (autoridade em runtime). A migração é
-- semeada com os MESMOS valores por omissão definidos em
-- `src/lib/leadScoring/config.ts`. Alterar pesos = atualizar esta linha e/ou o
-- ficheiro — nunca espalhar constantes por vários ficheiros.
create table if not exists public.lead_scoring_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  version text not null,
  weights jsonb not null,
  bands jsonb not null,
  components jsonb not null default '{}'::jsonb,
  eligibility jsonb not null default '{"blockOnOptOut": true}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Uma única configuração ativa por organização (ou global quando nulo).
create unique index if not exists lead_scoring_config_active_idx
  on public.lead_scoring_config (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_active;

alter table public.lead_scoring_config enable row level security;
drop policy if exists lead_scoring_config_select on public.lead_scoring_config;
create policy lead_scoring_config_select on public.lead_scoring_config
  for select using (public.crm_has_role());

-- Semeia a configuração por omissão (idempotente).
insert into public.lead_scoring_config (organization_id, version, weights, bands, components, eligibility, is_active)
select
  null,
  '1.0.0',
  jsonb_build_object(
    'opportunity_fit', 0.25, 'market_value', 0.20, 'contact_quality', 0.20,
    'company_fit', 0.15, 'public_procurement_gap', 0.10, 'data_confidence', 0.10
  ),
  jsonb_build_array(
    jsonb_build_object('key', 'LOW', 'min', 0, 'max', 39, 'label', 'Baixa'),
    jsonb_build_object('key', 'MEDIUM', 'min', 40, 'max', 59, 'label', 'Média'),
    jsonb_build_object('key', 'HIGH', 'min', 60, 'max', 79, 'label', 'Alta'),
    jsonb_build_object('key', 'VERY_HIGH', 'min', 80, 'max', 100, 'label', 'Muito alta')
  ),
  jsonb_build_object(
    'opportunityFit', jsonb_build_object(
      'breakpoints', jsonb_build_array(
        jsonb_build_object('at', 0, 'score', 0), jsonb_build_object('at', 1, 'score', 25),
        jsonb_build_object('at', 3, 'score', 50), jsonb_build_object('at', 6, 'score', 75),
        jsonb_build_object('at', 10, 'score', 100)
      ),
      'recencyBonus', jsonb_build_object('within90', 10, 'within180', 5), 'max', 100
    ),
    'marketValue', jsonb_build_object(
      'breakpoints', jsonb_build_array(
        jsonb_build_object('at', 0, 'score', 0), jsonb_build_object('at', 50000, 'score', 25),
        jsonb_build_object('at', 150000, 'score', 50), jsonb_build_object('at', 400000, 'score', 75),
        jsonb_build_object('at', 1000000, 'score', 100)
      ), 'max', 100
    ),
    'contactQuality', jsonb_build_object(
      'max', 100, 'genericEmail', 60, 'commercialEmail', 65, 'phone', 40, 'website', 15,
      'validatedContactBonus', 25, 'namedEmailPenalty', 15, 'validationBothBonus', 10, 'confidenceWeight', 0.2
    ),
    'companyFit', jsonb_build_object(
      'max', 100, 'cpvPresence', 35, 'caeCompatible', 20, 'websitePresence', 15,
      'sizePoints', jsonb_build_object('micro', 5, 'pequeno', 10, 'medio', 15, 'grande', 20),
      'districtPresence', 10
    ),
    'publicProcurementGap', jsonb_build_object('max', 100, 'fitFloor', 0.4, 'participationFullPenalty', 5),
    'dataConfidence', jsonb_build_object(
      'max', 100,
      'freshness', jsonb_build_object('within30', 60, 'within90', 40, 'within180', 25, 'older', 10, 'none', 5),
      'provenance', jsonb_build_object('website', 20, 'contactSource', 20)
    )
  ),
  '{"blockOnOptOut": true}'::jsonb,
  true
where not exists (select 1 from public.lead_scoring_config where is_active);

-- Leitura da configuração ativa (organização do utilizador; fallback global).
create or replace function public.lead_scoring_config_get()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', config.version,
    'weights', config.weights,
    'bands', config.bands,
    'components', config.components,
    'eligibility', config.eligibility
  )
  from public.lead_scoring_config config
  where config.is_active
    and public.crm_has_role()
    and (config.organization_id = public.crm_organization_id() or config.organization_id is null)
  order by (config.organization_id is not null) desc
  limit 1;
$$;

-- ===========================================================================
-- 2. Snapshots de score (auditoria; componentes individuais guardados)
-- ===========================================================================
create table if not exists public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prospect_id uuid references public.prospect_companies(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  nif text,
  cae text,
  district text,
  estimated_size text,
  website text,
  email text,
  email_type text,
  phone text,
  commercial_status text,
  opt_out boolean not null default false,
  score smallint not null check (score between 0 and 100),
  band text not null check (band in ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH')),
  components jsonb not null default '{}'::jsonb,
  contributions jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  eligible boolean not null default true,
  blocked_reason text,
  matching_opportunities integer not null default 0 check (matching_opportunities >= 0),
  estimated_opportunity_value numeric(14, 2),
  config_version text not null,
  created_by uuid references auth.users(id),
  computed_at timestamptz not null default now()
);

create index if not exists lead_scores_org_idx on public.lead_scores (organization_id, computed_at desc);
create index if not exists lead_scores_prospect_idx on public.lead_scores (prospect_id, computed_at desc);
create index if not exists lead_scores_ranking_idx on public.lead_scores (organization_id, score desc);

alter table public.lead_scores enable row level security;
drop policy if exists lead_scores_select on public.lead_scores;
create policy lead_scores_select on public.lead_scores
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

-- ===========================================================================
-- 3. Execuções de scoring (auditoria + distribuição)
-- ===========================================================================
create table if not exists public.lead_scoring_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  filters jsonb not null default '{}'::jsonb,
  config_version text not null,
  scored integer not null default 0 check (scored >= 0),
  eligible integer not null default 0 check (eligible >= 0),
  blocked_opt_out integer not null default 0 check (blocked_opt_out >= 0),
  distribution jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists lead_scoring_runs_org_idx on public.lead_scoring_runs (organization_id, created_at desc);

alter table public.lead_scoring_runs enable row level security;
drop policy if exists lead_scoring_runs_select on public.lead_scoring_runs;
create policy lead_scoring_runs_select on public.lead_scoring_runs
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

-- ===========================================================================
-- 4. Funções puras de scoring (espelham src/lib/leadScoring/engine.ts)
-- ===========================================================================

-- Interpolação linear por troços (breakpoints jsonb: [{"at":n,"score":m}]).
create or replace function public.lead_score_piecewise(p_value numeric, p_breakpoints jsonb)
returns integer
language plpgsql immutable as $$
declare
  v_points jsonb;
  v_prev_at numeric := null;
  v_prev_score numeric := null;
  v_at numeric;
  v_score numeric;
  v_item jsonb;
begin
  if p_value is null or p_value <= 0 then return 0; end if;
  select jsonb_agg(item order by (item->>'at')::numeric)
    into v_points
    from jsonb_array_elements(coalesce(p_breakpoints, '[]'::jsonb)) item;
  if v_points is null or jsonb_array_length(v_points) = 0 then return 0; end if;

  for v_item in select * from jsonb_array_elements(v_points) loop
    v_at := (v_item->>'at')::numeric;
    v_score := (v_item->>'score')::numeric;
    if p_value <= v_at then
      if v_prev_at is null then return round(v_score)::integer; end if;
      if v_at = v_prev_at then return round(v_score)::integer; end if;
      return round(v_prev_score + (p_value - v_prev_at) / (v_at - v_prev_at) * (v_score - v_prev_score))::integer;
    end if;
    v_prev_at := v_at;
    v_prev_score := v_score;
  end loop;
  return round(v_prev_score)::integer;
end;
$$;

-- opportunity_fit: oportunidades compatíveis + bónus de recência.
create or replace function public.lead_score_opportunity_fit(
  p_opportunities integer, p_last_participation date, p_components jsonb
)
returns integer
language plpgsql immutable as $$
declare
  v_cfg jsonb := coalesce(p_components->'opportunityFit', '{}'::jsonb);
  v_base integer;
  v_bonus integer := 0;
begin
  v_base := public.lead_score_piecewise(greatest(coalesce(p_opportunities, 0), 0), v_cfg->'breakpoints');
  if p_last_participation is not null then
    if p_last_participation >= current_date - interval '90 days' then
      v_bonus := coalesce((v_cfg->'recencyBonus'->>'within90')::integer, 0);
    elsif p_last_participation >= current_date - interval '180 days' then
      v_bonus := coalesce((v_cfg->'recencyBonus'->>'within180')::integer, 0);
    end if;
  end if;
  return least(greatest(v_base + v_bonus, 0), coalesce((v_cfg->>'max')::integer, 100));
end;
$$;

-- market_value: valor agregado.
create or replace function public.lead_score_market_value(p_value numeric, p_components jsonb)
returns integer
language plpgsql immutable as $$
declare v_cfg jsonb := coalesce(p_components->'marketValue', '{}'::jsonb);
begin
  return least(public.lead_score_piecewise(greatest(coalesce(p_value, 0), 0), v_cfg->'breakpoints'),
               coalesce((v_cfg->>'max')::integer, 100));
end;
$$;

-- contact_quality: tipo/validade do contacto.
create or replace function public.lead_score_contact_quality(
  p_email text, p_email_type text, p_has_generic_email boolean, p_phone text,
  p_website text, p_validated boolean, p_confidence integer, p_components jsonb
)
returns integer
language plpgsql immutable as $$
declare
  v_cfg jsonb := coalesce(p_components->'contactQuality', '{}'::jsonb);
  v_score integer := 0;
  v_generic boolean := coalesce(p_has_generic_email, false) or p_email_type = 'geral';
begin
  if v_generic then
    v_score := v_score + coalesce((v_cfg->>'genericEmail')::integer, 60);
  elsif p_email_type = 'comercial' then
    v_score := v_score + coalesce((v_cfg->>'commercialEmail')::integer, 65);
  elsif p_email is not null and btrim(p_email) <> '' then
    v_score := v_score + greatest(0, coalesce((v_cfg->>'commercialEmail')::integer, 65) - coalesce((v_cfg->>'namedEmailPenalty')::integer, 15));
  end if;
  if p_phone is not null and btrim(p_phone) <> '' then
    v_score := v_score + coalesce((v_cfg->>'phone')::integer, 40);
  end if;
  if p_website is not null and btrim(p_website) <> '' then
    v_score := v_score + coalesce((v_cfg->>'website')::integer, 15);
  end if;
  if coalesce(p_validated, false) then
    v_score := v_score + coalesce((v_cfg->>'validatedContactBonus')::integer, 25);
  end if;
  if p_phone is not null and btrim(p_phone) <> '' and p_email is not null and btrim(p_email) <> '' then
    v_score := v_score + coalesce((v_cfg->>'validationBothBonus')::integer, 10);
  end if;
  if coalesce(p_confidence, 0) > 0 then
    v_score := v_score + round(p_confidence * coalesce((v_cfg->>'confidenceWeight')::numeric, 0.2))::integer;
  end if;
  return least(greatest(v_score, 0), coalesce((v_cfg->>'max')::integer, 100));
end;
$$;

-- company_fit: CPV, CAE, website, dimensão, localização.
create or replace function public.lead_score_company_fit(
  p_has_cpv boolean, p_cae text, p_website text, p_estimated_size text, p_district text, p_components jsonb
)
returns integer
language plpgsql immutable as $$
declare
  v_cfg jsonb := coalesce(p_components->'companyFit', '{}'::jsonb);
  v_score integer := 0;
begin
  if coalesce(p_has_cpv, false) then v_score := v_score + coalesce((v_cfg->>'cpvPresence')::integer, 35); end if;
  if p_cae is not null and btrim(p_cae) <> '' then v_score := v_score + coalesce((v_cfg->>'caeCompatible')::integer, 20); end if;
  if p_website is not null and btrim(p_website) <> '' then v_score := v_score + coalesce((v_cfg->>'websitePresence')::integer, 15); end if;
  if p_estimated_size in ('micro', 'pequeno', 'medio', 'grande') then
    v_score := v_score + coalesce((v_cfg->'sizePoints'->>p_estimated_size)::integer, 0);
  end if;
  if p_district is not null and btrim(p_district) <> '' then v_score := v_score + coalesce((v_cfg->>'districtPresence')::integer, 10); end if;
  return least(greatest(v_score, 0), coalesce((v_cfg->>'max')::integer, 100));
end;
$$;

-- public_procurement_gap: encaixe no ramo vs. participação conhecida.
create or replace function public.lead_score_procurement_gap(
  p_has_sector_fit boolean, p_participation_count integer, p_components jsonb
)
returns integer
language plpgsql immutable as $$
declare
  v_cfg jsonb := coalesce(p_components->'publicProcurementGap', '{}'::jsonb);
  v_fit_factor numeric := case when coalesce(p_has_sector_fit, false) then 1 else coalesce((v_cfg->>'fitFloor')::numeric, 0.4) end;
  v_ceiling numeric := greatest(coalesce((v_cfg->>'participationFullPenalty')::numeric, 5), 1);
  v_participation_factor numeric := 1 - least(greatest(coalesce(p_participation_count, 0), 0) / v_ceiling, 1);
begin
  return least(greatest(round(v_fit_factor * v_participation_factor * coalesce((v_cfg->>'max')::numeric, 100))::integer, 0),
               coalesce((v_cfg->>'max')::integer, 100));
end;
$$;

-- data_confidence: frescura + proveniência.
create or replace function public.lead_score_data_confidence(
  p_last_activity date, p_website text, p_has_contact boolean, p_components jsonb
)
returns integer
language plpgsql immutable as $$
declare
  v_cfg jsonb := coalesce(p_components->'dataConfidence', '{}'::jsonb);
  v_score integer;
begin
  if p_last_activity is null then
    v_score := coalesce((v_cfg->'freshness'->>'none')::integer, 5);
  elsif p_last_activity >= current_date - interval '30 days' then
    v_score := coalesce((v_cfg->'freshness'->>'within30')::integer, 60);
  elsif p_last_activity >= current_date - interval '90 days' then
    v_score := coalesce((v_cfg->'freshness'->>'within90')::integer, 40);
  elsif p_last_activity >= current_date - interval '180 days' then
    v_score := coalesce((v_cfg->'freshness'->>'within180')::integer, 25);
  else
    v_score := coalesce((v_cfg->'freshness'->>'older')::integer, 10);
  end if;
  if p_website is not null and btrim(p_website) <> '' then
    v_score := v_score + coalesce((v_cfg->'provenance'->>'website')::integer, 20);
  end if;
  if coalesce(p_has_contact, false) then
    v_score := v_score + coalesce((v_cfg->'provenance'->>'contactSource')::integer, 20);
  end if;
  return least(greatest(v_score, 0), coalesce((v_cfg->>'max')::integer, 100));
end;
$$;

-- Devolve a chave do portão (band) para um score 0-100.
create or replace function public.lead_score_band(p_score integer, p_bands jsonb)
returns text
language sql immutable as $$
  select band->>'key'
  from jsonb_array_elements(coalesce(p_bands, '[]'::jsonb)) band
  where least(greatest(coalesce(p_score, 0), 0), 100)
        between (band->>'min')::integer and (band->>'max')::integer
  limit 1;
$$;

-- Explicação determinística a partir de dados objetivos (sem LLM).
create or replace function public.lead_score_reasons(
  p_categories text[], p_opportunities integer, p_participation_12m integer, p_value numeric,
  p_email text, p_email_type text, p_has_generic_email boolean, p_phone text, p_validated boolean,
  p_gap integer, p_participation_count integer, p_estimated_size text, p_website text, p_data_confidence integer
)
returns jsonb
language plpgsql immutable as $$
declare
  v_reasons text[] := array[]::text[];
  v_cats text;
begin
  v_cats := array_to_string((coalesce(p_categories, array[]::text[]))[1:3], ', ');
  if coalesce(array_length(p_categories, 1), 0) > 0 then
    v_reasons := v_reasons || (array['Correspondência com CPVs' || case when v_cats <> '' then ' (' || v_cats || ')' else '' end]);
  end if;
  if coalesce(p_opportunities, 0) > 0 then
    v_reasons := v_reasons || (array[p_opportunities || case when p_opportunities = 1 then ' oportunidade compatível' else ' oportunidades compatíveis' end]);
  elsif coalesce(p_participation_12m, 0) > 0 then
    v_reasons := v_reasons || (array[p_participation_12m || ' participações nos últimos 12 meses']);
  end if;
  if coalesce(p_value, 0) > 0 then
    v_reasons := v_reasons || (array[to_char(p_value, 'FM999G999G999G999') || ' EUR de valor agregado']);
  end if;
  if (coalesce(p_has_generic_email, false) or p_email_type = 'geral') and coalesce(p_validated, false) then
    v_reasons := v_reasons || (array['Contacto empresarial validado (email institucional)']);
  elsif coalesce(p_has_generic_email, false) or p_email_type = 'geral' then
    v_reasons := v_reasons || (array['Email empresarial genérico disponível']);
  elsif p_phone is not null and btrim(p_phone) <> '' then
    v_reasons := v_reasons || (array['Telefone empresarial disponível']);
  elsif p_email is null or btrim(p_email) = '' then
    v_reasons := v_reasons || (array['Sem contacto empresarial disponível']);
  end if;
  if coalesce(p_gap, 0) >= 60 then
    v_reasons := v_reasons || (array['Baixa participação pública conhecida (oportunidade de entrada)']);
  elsif coalesce(p_participation_count, 0) >= 5 then
    v_reasons := v_reasons || (array['Participação ativa conhecida em contratação pública (' || p_participation_count || ' registos)']);
  end if;
  if p_estimated_size in ('grande', 'medio') then
    v_reasons := v_reasons || (array['Dimensão empresarial ' || case when p_estimated_size = 'grande' then 'grande' else 'média' end]);
  end if;
  if p_website is not null and btrim(p_website) <> '' then
    v_reasons := v_reasons || (array['Website oficial identificado']);
  end if;
  if coalesce(p_data_confidence, 100) <= 30 then
    v_reasons := v_reasons || (array['Dados pouco recentes — requer verificação']);
  end if;
  return to_jsonb(v_reasons);
end;
$$;

-- Cálculo completo de um score a partir de sinais já reunidos.
create or replace function public.lead_score_compute(
  p_has_cpv boolean, p_cae text, p_district text, p_estimated_size text, p_website text,
  p_email text, p_email_type text, p_phone text,
  p_has_generic_email boolean, p_validated boolean, p_confidence integer,
  p_opportunities integer, p_value numeric, p_participation_count integer, p_participation_12m integer,
  p_last_participation date, p_categories text[], p_weights jsonb, p_components jsonb
)
returns jsonb
language plpgsql immutable as $$
declare
  v_opp integer := public.lead_score_opportunity_fit(p_opportunities, p_last_participation, p_components);
  v_mkt integer := public.lead_score_market_value(p_value, p_components);
  v_ctc integer := public.lead_score_contact_quality(p_email, p_email_type, p_has_generic_email, p_phone, p_website, p_validated, p_confidence, p_components);
  v_fit integer := public.lead_score_company_fit(p_has_cpv, p_cae, p_website, p_estimated_size, p_district, p_components);
  v_gap integer := public.lead_score_procurement_gap(p_has_cpv, p_participation_count, p_components);
  v_data integer := public.lead_score_data_confidence(p_last_participation, p_website, (p_email is not null or p_phone is not null), p_components);
  v_total numeric;
begin
  v_total := v_opp * coalesce((p_weights->>'opportunity_fit')::numeric, 0)
           + v_mkt * coalesce((p_weights->>'market_value')::numeric, 0)
           + v_ctc * coalesce((p_weights->>'contact_quality')::numeric, 0)
           + v_fit * coalesce((p_weights->>'company_fit')::numeric, 0)
           + v_gap * coalesce((p_weights->>'public_procurement_gap')::numeric, 0)
           + v_data * coalesce((p_weights->>'data_confidence')::numeric, 0);
  return jsonb_build_object(
    'score', least(greatest(round(v_total)::integer, 0), 100),
    'components', jsonb_build_object(
      'opportunity_fit', v_opp, 'market_value', v_mkt, 'contact_quality', v_ctc,
      'company_fit', v_fit, 'public_procurement_gap', v_gap, 'data_confidence', v_data
    ),
    'contributions', jsonb_build_object(
      'opportunity_fit', round(v_opp * coalesce((p_weights->>'opportunity_fit')::numeric, 0), 2),
      'market_value', round(v_mkt * coalesce((p_weights->>'market_value')::numeric, 0), 2),
      'contact_quality', round(v_ctc * coalesce((p_weights->>'contact_quality')::numeric, 0), 2),
      'company_fit', round(v_fit * coalesce((p_weights->>'company_fit')::numeric, 0), 2),
      'public_procurement_gap', round(v_gap * coalesce((p_weights->>'public_procurement_gap')::numeric, 0), 2),
      'data_confidence', round(v_data * coalesce((p_weights->>'data_confidence')::numeric, 0), 2)
    ),
    'reasons', public.lead_score_reasons(
      p_categories, p_opportunities, p_participation_12m, p_value,
      p_email, p_email_type, p_has_generic_email, p_phone, p_validated,
      v_gap, p_participation_count, p_estimated_size, p_website, v_data
    )
  );
end;
$$;

-- ===========================================================================
-- 5. Motor de execução (percorre prospects reais, aplica filtros, guarda)
-- ===========================================================================
-- NÃO inscreve leads no Autopilot nem cria campanhas: apenas calcula e guarda
-- snapshots auditáveis + devolve a distribuição e os exemplos.
create or replace function public.lead_scoring_run(
  p_min_score integer default null,
  p_max_score integer default null,
  p_band text default null,
  p_commercial_status text default null,
  p_cae text default null,
  p_cpv text default null,
  p_district text default null,
  p_contact_available boolean default null,
  p_generic_email boolean default null,
  p_min_opportunities integer default null,
  p_min_value numeric default null,
  p_include_opted_out boolean default false,
  p_sample_limit integer default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.crm_organization_id();
  v_config public.lead_scoring_config;
  v_weights jsonb;
  v_bands jsonb;
  v_components jsonb;
  v_block_opt_out boolean;
  v_run_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_scored integer := 0;
  v_eligible integer := 0;
  v_blocked integer := 0;
  v_distribution jsonb;
  v_row record;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;

  -- Configuração ativa (organização do utilizador, com fallback global).
  select * into v_config from public.lead_scoring_config config
    where config.is_active and (config.organization_id = v_org or config.organization_id is null)
    order by (config.organization_id is not null) desc limit 1;
  if v_config.id is null then raise exception 'Configuração de Lead Scoring não encontrada'; end if;

  v_weights := v_config.weights;
  v_bands := v_config.bands;
  v_components := v_config.components;
  v_block_opt_out := coalesce((v_config.eligibility->>'blockOnOptOut')::boolean, true);

  -- Itera os prospects reais da organização, enriquecidos com os melhores sinais.
  for v_row in
    with score_source as (
      select score.company_id, score.participation_count, score.participation_12m,
             score.award_count, score.total_award_value, score.last_participation,
             score.cpv_codes, score.competitor_count
      from public.company_prospect_scores score
    ),
    best_contact as (
      select contact.prospect_id,
             count(*) filter (where contact.contact_type = 'email' and contact.classification = 'GENERIC_BUSINESS') as generic_emails,
             count(*) filter (where contact.is_opt_out = false) as valid_contacts,
             max(contact.confidence) as confidence
      from public.company_enrichment_contacts contact
      where contact.organization_id = v_org
      group by contact.prospect_id
    )
    select
      prospect.id as prospect_id,
      prospect.company_id,
      prospect.name,
      prospect.nif,
      prospect.cae,
      prospect.district,
      prospect.estimated_size,
      prospect.website,
      prospect.email,
      prospect.email_type,
      prospect.phone,
      prospect.commercial_status,
      prospect.opt_out,
      prospect.matching_opportunities,
      prospect.estimated_opportunity_value,
      coalesce(score.participation_count, 0) as participation_count,
      coalesce(score.participation_12m, 0) as participation_12m,
      coalesce(score.total_award_value, 0) as total_award_value,
      score.last_participation,
      coalesce(score.cpv_codes, array[]::text[]) as cpv_codes,
      public.cpv_codes_to_categories(coalesce(score.cpv_codes, array[]::text[])) as categories,
      (coalesce(contact.generic_emails, 0) > 0 or prospect.email_type = 'geral') as has_generic_email,
      (coalesce(contact.valid_contacts, 0) > 0) as validated_contact,
      contact.confidence as contact_confidence
    from public.prospect_companies prospect
    left join score_source score on score.company_id = prospect.company_id
    left join best_contact contact on contact.prospect_id = prospect.id
    where prospect.organization_id = v_org
      and (v_block_opt_out is false or p_include_opted_out
           or (prospect.opt_out = false and prospect.commercial_status <> 'OPTED_OUT'))
      and (p_commercial_status is null or prospect.commercial_status = p_commercial_status)
      and (p_cae is null or prospect.cae = p_cae)
      and (p_district is null or lower(coalesce(prospect.district, '')) = lower(p_district))
      and (p_contact_available is null or not p_contact_available
           or (prospect.email is not null and btrim(prospect.email) <> '')
           or (prospect.phone is not null and btrim(prospect.phone) <> ''))
      and (p_generic_email is null or not p_generic_email
           or coalesce(contact.generic_emails, 0) > 0 or prospect.email_type = 'geral')
      and (p_min_opportunities is null or coalesce(prospect.matching_opportunities, 0) >= p_min_opportunities)
      and (p_min_value is null or coalesce(prospect.estimated_opportunity_value, 0) >= p_min_value)
    order by coalesce(prospect.estimated_opportunity_value, 0) desc, prospect.name
    limit coalesce(p_sample_limit, 100000)
  loop
    declare
      v_result jsonb;
      v_score integer;
      v_band text;
      v_eligible_row boolean;
      v_blocked_reason text;
      v_score_id uuid;
    begin
      -- Filtro CPV (prefixo) aplicado no motor (usa cpv_codes reais).
      if p_cpv is not null and not exists (
        select 1 from unnest(v_row.cpv_codes) code where code like p_cpv || '%'
      ) then
        continue;
      end if;

      v_result := public.lead_score_compute(
        (coalesce(array_length(v_row.cpv_codes, 1), 0) > 0 or coalesce(array_length(v_row.categories, 1), 0) > 0),
        v_row.cae, v_row.district, v_row.estimated_size, v_row.website,
        v_row.email, v_row.email_type, v_row.phone,
        v_row.has_generic_email, v_row.validated_contact, v_row.contact_confidence,
        v_row.matching_opportunities, coalesce(v_row.estimated_opportunity_value, v_row.total_award_value, 0),
        v_row.participation_count, v_row.participation_12m, v_row.last_participation, v_row.categories,
        v_weights, v_components
      );

      v_score := coalesce((v_result->>'score')::integer, 0);
      v_band := public.lead_score_band(v_score, v_bands);

      -- Elegibilidade: opt-out nunca é elegível para contacto.
      v_eligible_row := not (v_block_opt_out and (v_row.opt_out or v_row.commercial_status = 'OPTED_OUT'));
      v_blocked_reason := case when v_eligible_row then null else 'Opt-out — não pode ser contactado' end;

      -- Filtros de score/portão aplicados após o cálculo.
      if p_min_score is not null and v_score < p_min_score then continue; end if;
      if p_max_score is not null and v_score > p_max_score then continue; end if;
      if p_band is not null and v_band <> p_band then continue; end if;

      -- Guarda o snapshot auditável.
      insert into public.lead_scores (
        organization_id, prospect_id, company_id, name, nif, cae, district, estimated_size,
        website, email, email_type, phone, commercial_status, opt_out, score, band,
        components, contributions, reasons, eligible, blocked_reason,
        matching_opportunities, estimated_opportunity_value, config_version, created_by, computed_at
      ) values (
        v_org, v_row.prospect_id, v_row.company_id, v_row.name, v_row.nif, v_row.cae, v_row.district,
        v_row.estimated_size, v_row.website, v_row.email, v_row.email_type, v_row.phone,
        v_row.commercial_status, v_row.opt_out, v_score, v_band,
        v_result->'components', v_result->'contributions', v_result->'reasons',
        v_eligible_row, v_blocked_reason, coalesce(v_row.matching_opportunities, 0),
        v_row.estimated_opportunity_value, v_config.version, auth.uid(), now()
      ) returning id into v_score_id;

      v_scored := v_scored + 1;
      if v_eligible_row then v_eligible := v_eligible + 1; else v_blocked := v_blocked + 1; end if;

      v_rows := v_rows || jsonb_build_object(
        'score_id', v_score_id,
        'prospect_id', v_row.prospect_id, 'company_id', v_row.company_id, 'name', v_row.name,
        'nif', v_row.nif, 'cae', v_row.cae, 'district', v_row.district,
        'estimated_size', v_row.estimated_size, 'website', v_row.website, 'email', v_row.email,
        'email_type', v_row.email_type, 'phone', v_row.phone,
        'commercial_status', v_row.commercial_status, 'opt_out', v_row.opt_out,
        'score', v_score, 'band', v_band,
        'components', v_result->'components', 'contributions', v_result->'contributions',
        'reasons', v_result->'reasons', 'eligible', v_eligible_row, 'blocked_reason', v_blocked_reason,
        'matching_opportunities', coalesce(v_row.matching_opportunities, 0),
        'estimated_opportunity_value', v_row.estimated_opportunity_value,
        'config_version', v_config.version
      );
    end;
  end loop;

  -- Distribuição por portão.
  select jsonb_build_object(
    'LOW', count(*) filter (where (candidate->>'band') = 'LOW'),
    'MEDIUM', count(*) filter (where (candidate->>'band') = 'MEDIUM'),
    'HIGH', count(*) filter (where (candidate->>'band') = 'HIGH'),
    'VERY_HIGH', count(*) filter (where (candidate->>'band') = 'VERY_HIGH')
  ) into v_distribution from jsonb_array_elements(v_rows) candidate;

  insert into public.lead_scoring_runs (
    organization_id, filters, config_version, scored, eligible, blocked_opt_out, distribution, created_by
  ) values (
    v_org,
    jsonb_build_object(
      'min_score', p_min_score, 'max_score', p_max_score, 'band', p_band,
      'commercial_status', p_commercial_status, 'cae', p_cae, 'cpv', p_cpv,
      'district', p_district, 'contact_available', p_contact_available,
      'generic_email', p_generic_email, 'min_opportunities', p_min_opportunities,
      'min_value', p_min_value, 'include_opted_out', p_include_opted_out,
      'sample_limit', p_sample_limit
    ),
    v_config.version, v_scored, v_eligible, v_blocked, v_distribution, auth.uid()
  ) returning id into v_run_id;

  perform public.crm_audit('lead_scoring_run', 'lead_scoring_run', v_run_id,
    jsonb_build_object('scored', v_scored, 'eligible', v_eligible, 'blocked_opt_out', v_blocked));

  return jsonb_build_object(
    'run_id', v_run_id,
    'scored', v_scored,
    'eligible', v_eligible,
    'blocked_opt_out', v_blocked,
    'distribution', coalesce(v_distribution, jsonb_build_object('LOW', 0, 'MEDIUM', 0, 'HIGH', 0, 'VERY_HIGH', 0)),
    'filters', jsonb_build_object(
      'min_score', p_min_score, 'band', p_band, 'district', p_district,
      'generic_email', p_generic_email, 'contact_available', p_contact_available
    ),
    'rows', v_rows
  );
end;
$$;

-- ===========================================================================
-- 6. RPCs de leitura (histórico e snapshots mais recentes)
-- ===========================================================================
create or replace function public.lead_scoring_runs_list(p_limit integer default 10)
returns table (
  id uuid, filters jsonb, config_version text, scored integer, eligible integer,
  blocked_opt_out integer, distribution jsonb, created_by uuid, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select run.id, run.filters, run.config_version, run.scored, run.eligible,
    run.blocked_opt_out, run.distribution, run.created_by, run.created_at
  from public.lead_scoring_runs run
  where run.organization_id = public.crm_organization_id() and public.crm_has_role()
  order by run.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- Snapshot mais recente por prospect (com filtros opcionais).
create or replace function public.lead_scores_list(
  p_min_score integer default null,
  p_band text default null,
  p_district text default null,
  p_generic_email boolean default null,
  p_contact_available boolean default null,
  p_include_opted_out boolean default false,
  p_limit integer default 100
)
returns table (
  score_id uuid, prospect_id uuid, company_id uuid, name text, nif text, cae text,
  district text, estimated_size text, website text, email text, email_type text, phone text,
  commercial_status text, opt_out boolean, score smallint, band text, components jsonb,
  contributions jsonb, reasons jsonb, eligible boolean, blocked_reason text,
  matching_opportunities integer, estimated_opportunity_value numeric,
  config_version text, computed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (score.prospect_id) score.*
    from public.lead_scores score
    where score.organization_id = public.crm_organization_id() and public.crm_has_role()
    order by score.prospect_id, score.computed_at desc
  )
  select latest.id, latest.prospect_id, latest.company_id, latest.name, latest.nif,
    latest.cae, latest.district, latest.estimated_size, latest.website, latest.email,
    latest.email_type, latest.phone, latest.commercial_status, latest.opt_out,
    latest.score, latest.band, latest.components, latest.contributions, latest.reasons,
    latest.eligible, latest.blocked_reason, latest.matching_opportunities,
    latest.estimated_opportunity_value, latest.config_version, latest.computed_at
  from latest
  where (p_include_opted_out or latest.opt_out = false)
    and (p_min_score is null or latest.score >= p_min_score)
    and (p_band is null or latest.band = p_band)
    and (p_district is null or lower(coalesce(latest.district, '')) = lower(p_district))
    and (p_generic_email is null or not p_generic_email or latest.email_type = 'geral')
    and (p_contact_available is null or not p_contact_available
         or latest.email is not null or latest.phone is not null)
  order by latest.score desc, latest.computed_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- ===========================================================================
-- 7. Permissões
-- ===========================================================================
revoke all on function public.lead_scoring_config_get() from public;
revoke all on function public.lead_scoring_run(integer, integer, text, text, text, text, text, boolean, boolean, integer, numeric, boolean, integer) from public;
revoke all on function public.lead_scoring_runs_list(integer) from public;
revoke all on function public.lead_scores_list(integer, text, text, boolean, boolean, boolean, integer) from public;

grant execute on function public.lead_scoring_config_get() to authenticated;
grant execute on function public.lead_scoring_run(integer, integer, text, text, text, text, text, boolean, boolean, integer, numeric, boolean, integer) to authenticated;
grant execute on function public.lead_scoring_runs_list(integer) to authenticated;
grant execute on function public.lead_scores_list(integer, text, text, boolean, boolean, boolean, integer) to authenticated;
