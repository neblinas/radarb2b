-- Adjudata — Prospeção B2B: Prospect Discovery Engine (FASE 3).
--
-- Porquê esta migração:
--   Cria o mecanismo que identifica empresas/perfis empresariais potencialmente
--   interessantes para a Adjudata, usando PRIORITARIAMENTE dados já disponíveis
--   no próprio sistema (contratação pública). Nesta fase NÃO se procura na
--   Internet (websites/emails/telefones), NÃO há crawling e NÃO há automação.
--
-- Dados reais reutilizados (nenhum dado é inventado):
--   * public.company_prospect_scores  (atividade, CPVs, valor, concorrência, recência)
--   * public.companies                (adjudicatárias com histórico)
--   * public.entities                 (entidades adjudicantes: district/region/entity_type)
--   * public.cpvs.radar_category      (ramo de negócio derivado do CPV)
--   * public.procedure_participants   (concorrentes por co-participação real)
--
-- Correspondência CAE ↔ CPV:
--   O sistema NÃO possui um mecanismo fiável de correspondência entre CAE e CPV.
--   Esta migração cria a ARQUITETURA necessária para o suportar (tabela
--   `cae_cpv_map` + índice de consulta), mas NÃO fabrica relações: a tabela
--   começa vazia de forma deliberada. Só correspondências revistas por um humano
--   (fonte conhecida) devem ser introduzidas. Enquanto não existirem dados CAE
--   fiáveis, os candidatos são identificados por CPV/ramo, valor, volume,
--   frequência, localização e dimensão — nunca por CAE inventado.
--
-- Executar no Supabase SQL Editor como project owner (ou via `supabase db push`).

-- ===========================================================================
-- 1. Mapa CAE ↔ CPV (arquitetura; deliberadamente vazio)
-- ===========================================================================
-- Tabela de suporte à correspondência, ainda sem dados. A relação tem de ser
-- FONTE HUMANA/DOCUMENTADA (ex.: informação da entidade, estudo setorial):
-- não é gerada nem inferida automaticamente.
create table if not exists public.cae_cpv_map (
  id uuid primary key default gen_random_uuid(),
  -- Código CAE (formato canónico: dígitos com pontuação, ex.: "62010").
  cae_code text not null check (length(btrim(cae_code)) > 0),
  -- Código CPV (ex.: "72000000").
  cpv_code text not null check (length(btrim(cpv_code)) > 0),
  -- Ramo de negócio de destino (opcional; alinhado com cpvs.radar_category).
  radar_category text,
  -- Confiança da correspondência (revista por humano).
  confidence smallint not null default 100 check (confidence between 0 and 100),
  -- Proveniência: obrigatória para evitar mapeamentos inventados.
  source text not null check (length(btrim(source)) > 0),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (cae_code, cpv_code)
);

create index if not exists cae_cpv_map_cae_idx on public.cae_cpv_map (cae_code);
create index if not exists cae_cpv_map_cpv_idx on public.cae_cpv_map (cpv_code);

alter table public.cae_cpv_map enable row level security;
drop policy if exists cae_cpv_map_select on public.cae_cpv_map;
create policy cae_cpv_map_select on public.cae_cpv_map
  for select using (public.crm_has_role());

-- RPC para introduzir mapeamentos CAE↔CPV revistos por humano (fonte obrigatória).
create or replace function public.cae_cpv_map_add(
  p_cae_code text,
  p_cpv_code text,
  p_source text,
  p_radar_category text default null,
  p_confidence integer default 100,
  p_note text default null
)
returns public.cae_cpv_map
language plpgsql security definer set search_path = public as $$
declare created public.cae_cpv_map;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;
  if p_cae_code is null or length(btrim(p_cae_code)) = 0 then raise exception 'CAE obrigatório'; end if;
  if p_cpv_code is null or length(btrim(p_cpv_code)) = 0 then raise exception 'CPV obrigatório'; end if;
  if p_source is null or length(btrim(p_source)) = 0 then raise exception 'Fonte obrigatória (não inventar correspondências)'; end if;
  insert into public.cae_cpv_map (cae_code, cpv_code, radar_category, confidence, source, note, created_by)
  values (btrim(p_cae_code), btrim(p_cpv_code), nullif(btrim(coalesce(p_radar_category, '')), ''), greatest(least(coalesce(p_confidence, 100), 100), 0), btrim(p_source), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (cae_code, cpv_code) do update set
    radar_category = excluded.radar_category, confidence = excluded.confidence, source = excluded.source, note = excluded.note
  returning * into created;
  perform public.crm_audit('cae_cpv_map_added', 'cae_cpv_map', created.id,
    jsonb_build_object('cae_code', created.cae_code, 'cpv_code', created.cpv_code, 'source', created.source));
  return created;
end;
$$;

-- ===========================================================================
-- 2. Execuções de descoberta (auditoria + contadores do relatório)
-- ===========================================================================
create table if not exists public.prospect_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Critérios usados (para reprodutibilidade e auditoria).
  criteria jsonb not null default '{}'::jsonb,
  -- Amostra usada (quando aplicável). Nulo = sem limite de amostra.
  sample_limit integer check (sample_limit is null or sample_limit > 0),
  -- Contadores do relatório.
  companies_analyzed integer not null default 0 check (companies_analyzed >= 0),
  candidates_generated integer not null default 0 check (candidates_generated >= 0),
  new_prospects integer not null default 0 check (new_prospects >= 0),
  skipped_duplicates integer not null default 0 check (skipped_duplicates >= 0),
  skipped_opt_out integer not null default 0 check (skipped_opt_out >= 0),
  skipped_low_signal integer not null default 0 check (skipped_low_signal >= 0),
  -- Distribuição de scores (portões: <40, 40-59, 60-79, >=80).
  score_distribution jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists prospect_discovery_runs_org_idx
  on public.prospect_discovery_runs (organization_id, created_at desc);

alter table public.prospect_discovery_runs enable row level security;
drop policy if exists prospect_discovery_runs_select on public.prospect_discovery_runs;
create policy prospect_discovery_runs_select on public.prospect_discovery_runs
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

-- ===========================================================================
-- 3. Motor de descoberta
-- ===========================================================================
-- Gera candidatos reais por organização, deduplica contra prospect_companies
-- (NIF / empresa do Radar) e exclui opt-out. NÃO insere prospects: apenas
-- devolve os candidatos e regista a execução (auditoria + contadores).
--
-- Motivos possíveis (transparentes): setor/ramo relevante (CPV), CAE compatível
-- (apenas se houver mapeamento revisto), volume/frequência, valor, baixa
-- participação conhecida (nicho), dimensão. Se nenhum sinal existir, o candidato
-- é marcado como 'low_signal' e contado à parte (não é apresentado como prospect).
create or replace function public.run_prospect_discovery(
  p_min_score integer default 40,
  p_radar_category text default null,
  p_district text default null,
  p_min_opportunities integer default 1,
  p_min_value numeric default null,
  p_sample_limit integer default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.crm_organization_id();
  v_run public.prospect_discovery_runs;
  v_candidates jsonb := '[]'::jsonb;
  v_analyzed integer := 0;
  v_generated integer := 0;
  v_duplicates integer := 0;
  v_opt_out integer := 0;
  v_low_signal integer := 0;
  v_distribution jsonb;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;

  -- Universo: empresas com atividade real em contratação pública (scores).
  -- A amostra (se indicada) limita o número de empresas analisadas.
  with universe as (
    select score.*
    from public.company_prospect_scores score
    where (p_radar_category is null or p_radar_category = any(public.cpv_codes_to_categories(score.cpv_codes)))
    order by (score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points) desc,
             score.last_participation desc nulls last
    limit coalesce(p_sample_limit, 100000)
  )
  select count(*)::integer into v_analyzed from universe;

  -- Construção dos candidatos a partir do universo, com deduplicação e opt-out.
  with universe as (
    select score.*,
      (score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points)::integer as total_score
    from public.company_prospect_scores score
    where (p_radar_category is null or p_radar_category = any(public.cpv_codes_to_categories(score.cpv_codes)))
    order by (score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points) desc,
             score.last_participation desc nulls last
    limit coalesce(p_sample_limit, 100000)
  ),
  enriched as (
    select universe.*,
      -- Localização relevante: distrito/região das entidades adjudicantes onde
      -- a empresa participou (dados reais). Nulo quando não conhecido.
      (
        select entity.district
        from public.procedure_participants participant
        join public.procedures procedure on procedure.id = participant.procedure_id
        join public.entities entity on entity.id = procedure.buyer_id
        where participant.company_id = universe.company_id
          and entity.district is not null and btrim(entity.district) <> ''
        group by entity.district
        order by count(*) desc
        limit 1
      ) as district,
      -- CAE compatível: apenas se existir mapeamento revisto por humano para os
      -- CPVs da empresa. Sem mapa → nulo (nunca inventado).
      (
        select map_entry.cae_code
        from public.cae_cpv_map map_entry
        where map_entry.cpv_code = any(universe.cpv_codes)
        order by map_entry.confidence desc
        limit 1
      ) as cae_compatible,
      -- Concorrentes identificados (co-participação real, quando disponível).
      coalesce(universe.competitor_count, 0) as competitor_count
    from universe
  ),
  filtered as (
    select enriched.*
    from enriched
    where (p_district is null or enriched.district = p_district)
      and coalesce(enriched.participation_count, 0) >= greatest(coalesce(p_min_opportunities, 1), 0)
      and (p_min_value is null or coalesce(enriched.total_award_value, 0) >= p_min_value)
      and enriched.total_score >= greatest(coalesce(p_min_score, 0), 0)
  ),
  classified as (
    select filtered.*,
      -- Motivo de seleção: derivado apenas de sinais reais disponíveis.
      array_remove(array[
        case when filtered.cpv_codes is not null and array_length(filtered.cpv_codes, 1) > 0
          then 'Setor relevante em contratação pública (' || coalesce((public.cpv_codes_to_categories(filtered.cpv_codes))[1], 'CPV') || ')' end,
        case when filtered.total_award_value >= 100000
          then 'Valor adjudicado relevante' end,
        case when filtered.participation_12m >= 3
          then 'Frequência de concursos nos últimos 12 meses' end,
        case when filtered.cae_compatible is not null
          then 'CAE compatível: ' || filtered.cae_compatible end,
        case when coalesce(filtered.competitor_count, 0) <= 1 and filtered.participation_count > 0
          then 'Baixa concorrência conhecida (nicho)' end,
        case when filtered.total_score >= 60
          then 'Dimensão empresarial / atividade consolidada' end
      ], null) as reasons
    from filtered
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'company_id', company_id,
    'name', name,
    'nif', nif,
    'total_score', total_score,
    'participation_count', participation_count,
    'participation_12m', participation_12m,
    'award_count', award_count,
    'total_award_value', total_award_value,
    'last_participation', last_participation,
    'cpv_codes', coalesce(to_jsonb(cpv_codes), '[]'::jsonb),
    'categories', coalesce(to_jsonb(public.cpv_codes_to_categories(cpv_codes)), '[]'::jsonb),
    'district', district,
    'cae_compatible', cae_compatible,
    'competitor_count', competitor_count,
    'reasons', to_jsonb(reasons),
    'inferred_size', case when total_score >= 60 then 'grande' when total_score >= 40 then 'medio' when total_score >= 20 then 'pequeno' else 'micro' end,
    'is_duplicate', exists (
      select 1 from public.prospect_companies prospect
      where prospect.organization_id = v_org
        and (prospect.company_id = classified.company_id
          or (prospect.nif_normalized is not null and prospect.nif_normalized = nullif(regexp_replace(coalesce(classified.nif, ''), '\D', '', 'g'), '')))
    ),
    'is_opt_out', exists (
      select 1 from public.prospect_companies prospect
      where prospect.organization_id = v_org
        and (prospect.company_id = classified.company_id
          or (prospect.nif_normalized is not null and prospect.nif_normalized = nullif(regexp_replace(coalesce(classified.nif, ''), '\D', '', 'g'), '')))
        and (prospect.opt_out = true or prospect.commercial_status = 'OPTED_OUT')
    )
  ) order by total_score desc, last_participation desc nulls last), '[]'::jsonb)
  into v_candidates
  from classified;

  -- Contadores e classificação (duplicado > opt-out > sinal > novo).
  select
    count(*) filter (where not (candidate->>'is_duplicate')::boolean and not (candidate->>'is_opt_out')::boolean)::integer,
    count(*) filter (where (candidate->>'is_duplicate')::boolean)::integer,
    count(*) filter (where not (candidate->>'is_duplicate')::boolean and (candidate->>'is_opt_out')::boolean)::integer,
    count(*) filter (where not (candidate->>'is_duplicate')::boolean and not (candidate->>'is_opt_out')::boolean and jsonb_array_length(candidate->'reasons') = 0)::integer
  into v_generated, v_duplicates, v_opt_out, v_low_signal
  from jsonb_array_elements(v_candidates) candidate;

  select jsonb_build_object(
    'lt40', count(*) filter (where (candidate->>'total_score')::integer < 40),
    '40_59', count(*) filter (where (candidate->>'total_score')::integer between 40 and 59),
    '60_79', count(*) filter (where (candidate->>'total_score')::integer between 60 and 79),
    'gte80', count(*) filter (where (candidate->>'total_score')::integer >= 80)
  )
  into v_distribution
  from jsonb_array_elements(v_candidates) candidate;

  insert into public.prospect_discovery_runs (
    organization_id, criteria, sample_limit, companies_analyzed, candidates_generated,
    new_prospects, skipped_duplicates, skipped_opt_out, skipped_low_signal, score_distribution, created_by
  ) values (
    v_org,
    jsonb_build_object(
      'min_score', coalesce(p_min_score, 0), 'radar_category', p_radar_category,
      'district', p_district, 'min_opportunities', coalesce(p_min_opportunities, 1),
      'min_value', p_min_value
    ),
    p_sample_limit, v_analyzed, v_generated, v_generated, v_duplicates, v_opt_out, v_low_signal, v_distribution, auth.uid()
  )
  returning * into v_run;

  perform public.crm_audit('prospect_discovery_run', 'prospect_discovery_run', v_run.id,
    jsonb_build_object('companies_analyzed', v_analyzed, 'candidates', v_generated, 'duplicates', v_duplicates, 'opt_out', v_opt_out));

  return jsonb_build_object(
    'run_id', v_run.id,
    'companies_analyzed', v_analyzed,
    'candidates_generated', v_generated,
    'new_prospects', v_generated,
    'skipped_duplicates', v_duplicates,
    'skipped_opt_out', v_opt_out,
    'skipped_low_signal', v_low_signal,
    'score_distribution', v_distribution,
    'candidates', v_candidates
  );
end;
$$;

-- ===========================================================================
-- 4. Relatório das últimas execuções (histórico)
-- ===========================================================================
create or replace function public.prospect_discovery_runs_list(p_limit integer default 10)
returns table (
  id uuid, criteria jsonb, sample_limit integer, companies_analyzed integer,
  candidates_generated integer, new_prospects integer, skipped_duplicates integer,
  skipped_opt_out integer, skipped_low_signal integer, score_distribution jsonb,
  created_by uuid, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select run.id, run.criteria, run.sample_limit, run.companies_analyzed,
    run.candidates_generated, run.new_prospects, run.skipped_duplicates,
    run.skipped_opt_out, run.skipped_low_signal, run.score_distribution,
    run.created_by, run.created_at
  from public.prospect_discovery_runs run
  where run.organization_id = public.crm_organization_id() and public.crm_has_role()
  order by run.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ===========================================================================
-- 5. Permissões
-- ===========================================================================
revoke all on function public.cae_cpv_map_add(text, text, text, text, integer, text) from public;
revoke all on function public.run_prospect_discovery(integer, text, text, integer, numeric, integer) from public;
revoke all on function public.prospect_discovery_runs_list(integer) from public;

-- Execução do motor apenas para admin/commercial_manager (a função valida o role).
grant execute on function public.cae_cpv_map_add(text, text, text, text, integer, text) to authenticated;
grant execute on function public.run_prospect_discovery(integer, text, text, integer, numeric, integer) to authenticated;
grant execute on function public.prospect_discovery_runs_list(integer) to authenticated;
