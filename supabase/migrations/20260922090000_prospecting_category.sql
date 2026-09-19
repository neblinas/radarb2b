-- Radar B2B — Ramo de negócio na prospeção (derivado do CPV).
-- Run once in Supabase SQL Editor as project owner.
--
-- O "ramo de negócio" de uma empresa é derivado das categorias CPV
-- (public.cpvs.radar_category) dos CPVs associados às suas adjudicações.
-- Uma empresa pode ter vários ramos. Sem custo e sem dados externos.

-- Mapeia uma lista de códigos CPV para as categorias de negócio distintas
-- existentes em public.cpvs (ignora categorias nulas/vazias).
create or replace function public.cpv_codes_to_categories(p_codes text[])
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct cpv.radar_category order by cpv.radar_category), array[]::text[])
  from public.cpvs cpv
  where cpv.cpv_code = any(coalesce(p_codes, array[]::text[]))
    and cpv.radar_category is not null
    and btrim(cpv.radar_category) <> ''
    and public.crm_has_role();
$$;

-- Lista de categorias distintas disponíveis (para popular o filtro no frontend).
create or replace function public.prospect_categories()
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct cpv.radar_category order by cpv.radar_category), array[]::text[])
  from public.cpvs cpv
  where cpv.radar_category is not null
    and btrim(cpv.radar_category) <> ''
    and public.crm_has_role();
$$;

-- Fila de prospeção com filtro por ramo de negócio.
drop function if exists public.prospect_queue(text, integer, text, text, integer, integer);
create or replace function public.prospect_queue(
  p_query text default null,
  p_min_score integer default 0,
  p_status text default null,
  p_assignment text default 'all',
  p_page integer default 1,
  p_page_size integer default 25,
  p_category text default null
)
returns table (
  company_id uuid, company_name text, company_nif text, prospect_score integer,
  participation_count integer, participation_12m integer, award_count integer,
  total_award_value numeric, last_participation date, cpv_codes text[],
  categories text[],
  prospect_id uuid, prospect_status text, assigned_to uuid, assigned_at timestamptz,
  next_action_at timestamptz, total_count bigint
)
language sql stable security definer set search_path = public as $$
  with queue as (
    select score.company_id, score.name, score.nif,
      (score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points)::integer as total_score,
      score.participation_count, score.participation_12m, score.award_count, score.total_award_value, score.last_participation, score.cpv_codes,
      public.cpv_codes_to_categories(score.cpv_codes) as categories,
      prospect.id as local_prospect_id, prospect.status, prospect.assigned_to, prospect.assigned_at, prospect.next_action_at
    from public.company_prospect_scores score
    left join public.sales_prospects prospect on prospect.company_id=score.company_id and prospect.organization_id=public.crm_organization_id()
    where public.crm_has_role()
      and (coalesce(p_query, '') = '' or score.name ilike '%' || p_query || '%' or score.nif ilike '%' || p_query || '%')
      and (score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points) >= greatest(coalesce(p_min_score, 0), 0)
      and (p_status is null or prospect.status = p_status)
      and (p_assignment = 'all' or (p_assignment = 'mine' and prospect.assigned_to=auth.uid()) or (p_assignment = 'available' and (prospect.id is null or prospect.assigned_to is null)))
      and (coalesce(p_category, '') = '' or p_category = any(public.cpv_codes_to_categories(score.cpv_codes)))
  )
  select company_id, name, nif, total_score, participation_count, participation_12m, award_count, total_award_value, last_participation, cpv_codes,
    categories, local_prospect_id, status, assigned_to, assigned_at, next_action_at, count(*) over()
  from queue
  order by case when local_prospect_id is null or assigned_to is null then 0 else 1 end, total_score desc, last_participation desc nulls last
  limit least(greatest(coalesce(p_page_size, 25), 1), 100)
  offset (least(greatest(coalesce(p_page, 1), 1), 10000) - 1) * least(greatest(coalesce(p_page_size, 25), 1), 100);
$$;

-- Snapshot da ficha do prospect, agora com os ramos de negócio.
create or replace function public.prospect_snapshot(p_company_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'company_id', score.company_id, 'name', score.name, 'nif', score.nif,
    'score', score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points,
    'participation_count', score.participation_count, 'participation_12m', score.participation_12m,
    'award_count', score.award_count, 'total_award_value', score.total_award_value,
    'average_contract_value', score.average_contract_value, 'last_participation', score.last_participation,
    'last_award', score.last_award, 'cpv_codes', coalesce(to_jsonb(score.cpv_codes), '[]'::jsonb),
    'categories', coalesce(to_jsonb(public.cpv_codes_to_categories(score.cpv_codes)), '[]'::jsonb),
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

grant execute on function public.cpv_codes_to_categories(text[]) to authenticated;
grant execute on function public.prospect_categories() to authenticated;
grant execute on function public.prospect_queue(text, integer, text, text, integer, integer, text) to authenticated;
