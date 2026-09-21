-- Adjudata — Prospeção B2B: Gestão de Prospeção (FASE 6).
--
-- Porquê esta migração:
--   A FASE 6 é a área de GESTÃO de prospeção no back-office: uma visão única
--   onde um gestor comercial revê as empresas-prospecto, filtra-as, abre o
--   detalhe e executa ações administrativas (enriquecer, recalcular score,
--   aprovar/rejeitar, aplicar opt-out, preparar para o Autopilot).
--
-- Âmbito (Fase 6) — camada de dados/backend para a gestão:
--   * métricas agregadas do funil (`prospect_management_metrics`);
--   * listagem paginada com TODOS os filtros pedidos
--     (`prospect_management_list`);
--   * detalhe consolidado por prospecto, com oportunidades, CPVs, score,
--     contactos com proveniência, histórico de enriquecimento e histórico
--     comercial (`prospect_management_detail`);
--   * ações administrativas auditadas (`prospect_management_action`).
--
-- NÃO implementado nesta fase (deliberado):
--   * envio de emails, campanhas, crawling novo;
--   * automação periódica.
--   A preparação para o Autopilot apenas MARCA o prospecto como pronto — não o
--   inscreve em campanhas. A inscrição continua a exigir contacto verificado e
--   a RPC dedicada `outreach_enroll_prospect`.
--
-- Princípios (AGENTS.md):
--   * Idempotente (pode correr várias vezes sem efeitos colaterais).
--   * Não destrói dados nem histórico.
--   * RLS por organização; RPCs security definer com search_path fixo.
--   * Não inventa dados: só usa sinais existentes.
--   * Ações sensíveis (opt-out, aprovação) exigem admin/commercial_manager no
--     backend — nunca apenas escondidas na UI.
--
-- Executar no Supabase Studio SQL Editor como project owner (ou `supabase db push`).

-- ===========================================================================
-- 1. Métricas de gestão do funil
-- ===========================================================================
create or replace function public.prospect_management_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.crm_organization_id();
  v_result jsonb;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;

  with base as (
    select prospect.*
    from public.prospect_companies prospect
    where prospect.organization_id = v_org
  ),
  enriched as (
    select
      prospect.id,
      exists (
        select 1 from public.company_enrichment_runs run
        where run.organization_id = v_org
          and run.prospect_id = prospect.id
          and run.status in ('COMPLETED', 'PARTIAL')
      ) as has_enrichment,
      exists (
        select 1 from public.company_enrichment_contacts contact
        where contact.organization_id = v_org
          and contact.prospect_id = prospect.id
          and contact.is_opt_out = false
      ) as has_public_contact
    from public.prospect_companies prospect
    where prospect.organization_id = v_org
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'opted_out', (select count(*) from base where opt_out or commercial_status = 'OPTED_OUT'),
    'ready_for_autopilot', (select count(*) from base where commercial_status = 'READY_FOR_AUTOPILOT'),
    'in_autopilot', (select count(*) from base where commercial_status = 'IN_AUTOPILOT'),
    'contacted', (select count(*) from base where commercial_status in ('CONTACTED', 'CONVERTED')),
    'converted', (select count(*) from base where commercial_status = 'CONVERTED'),
    'rejected', (select count(*) from base where commercial_status = 'REJECTED'),
    'with_website', (select count(*) from base where website is not null and btrim(website) <> ''),
    'with_valid_contact', (select count(*) from base where email is not null and btrim(email) <> ''),
    'enriched', (select count(*) from enriched where has_enrichment),
    'with_public_contact', (select count(*) from enriched where has_public_contact),
    'by_status', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', total) order by total desc)
      from (select commercial_status as status, count(*)::integer as total from base group by commercial_status) grouped
    ), '[]'::jsonb),
    'by_enrichment', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', total) order by total desc)
      from (select enrichment_status as status, count(*)::integer as total from base group by enrichment_status) grouped
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ===========================================================================
-- 2. Listagem paginada com filtros completos
-- ===========================================================================
-- Filtros suportados:
--   p_query              — nome/NIF (texto)
--   p_commercial_status  — estado comercial exato
--   p_enrichment_status  — estado de enriquecimento exato
--   p_min_score / p_max_score — score comercial (prospect_companies)
--   p_cae                — CAE
--   p_cpv                — prefixo de CPV (usa cpv_codes do Radar, se ligado)
--   p_district           — distrito
--   p_category           — ramo (CPV → categoria, se ligado ao Radar)
--   p_email_type         — tipo de email (geral/comercial/suporte/outro)
--   p_has_website        — só com website
--   p_has_email          — só com email
--   p_opt_out            — incluir opt-out (por omissão exclui)
--   p_min_opportunities  — mínimo de oportunidades compatíveis
--   p_min_value          — valor mínimo de oportunidade
--   p_page / p_page_size — paginação
create or replace function public.prospect_management_list(
  p_query text default null,
  p_commercial_status text default null,
  p_enrichment_status text default null,
  p_min_score integer default null,
  p_max_score integer default null,
  p_cae text default null,
  p_cpv text default null,
  p_district text default null,
  p_category text default null,
  p_email_type text default null,
  p_has_website boolean default null,
  p_has_email boolean default null,
  p_opt_out boolean default false,
  p_min_opportunities integer default null,
  p_min_value numeric default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid, name text, nif text, cae text, district text, municipality text, localidade text,
  estimated_size text, website text, domain text, email text, email_type text,
  enrichment_status text, commercial_status text, commercial_score integer, score_reason text,
  matching_opportunities integer, estimated_opportunity_value numeric,
  cpv_codes text[], categories text[],
  opt_out boolean, contact_count integer, last_contacted_at timestamptz,
  enriched boolean, has_public_contact boolean,
  created_at timestamptz, updated_at timestamptz, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with source as (
    select
      prospect.*,
      score.cpv_codes as radar_cpv_codes
    from public.prospect_companies prospect
    left join public.company_prospect_scores score on score.company_id = prospect.company_id
    where prospect.organization_id = public.crm_organization_id()
      and public.crm_has_role()
  ),
  enriched as (
    select
      source.id,
      exists (
        select 1 from public.company_enrichment_runs run
        where run.organization_id = public.crm_organization_id()
          and run.prospect_id = source.id
          and run.status in ('COMPLETED', 'PARTIAL')
      ) as enriched,
      exists (
        select 1 from public.company_enrichment_contacts contact
        where contact.organization_id = public.crm_organization_id()
          and contact.prospect_id = source.id
          and contact.is_opt_out = false
      ) as has_public_contact
    from source
  ),
  filtered as (
    select source.*, enriched.enriched, enriched.has_public_contact
    from source
    join enriched on enriched.id = source.id
    where
      (coalesce(p_query, '') = ''
        or source.name ilike '%' || p_query || '%'
        or source.nif ilike '%' || p_query || '%')
      and (p_commercial_status is null or source.commercial_status = p_commercial_status)
      and (p_enrichment_status is null or source.enrichment_status = p_enrichment_status)
      and (p_min_score is null or source.commercial_score >= p_min_score)
      and (p_max_score is null or source.commercial_score <= p_max_score)
      and (p_cae is null or source.cae = p_cae)
      and (p_district is null or lower(coalesce(source.district, '')) = lower(p_district))
      and (p_email_type is null or source.email_type = p_email_type)
      and (p_has_website is null or not p_has_website
           or (source.website is not null and btrim(source.website) <> ''))
      and (p_has_email is null or not p_has_email
           or (source.email is not null and btrim(source.email) <> ''))
      and (p_opt_out or (source.opt_out = false and source.commercial_status <> 'OPTED_OUT'))
      and (p_min_opportunities is null or source.matching_opportunities >= p_min_opportunities)
      and (p_min_value is null or coalesce(source.estimated_opportunity_value, 0) >= p_min_value)
      -- Filtro por prefixo de CPV e por ramo: só se aplicam quando há dados do
      -- Radar ligados; nunca inventamos correspondências.
      and (p_cpv is null or exists (
        select 1 from unnest(coalesce(source.radar_cpv_codes, array[]::text[])) code
        where code like p_cpv || '%'
      ))
      and (p_category is null
           or p_category = any(public.cpv_codes_to_categories(coalesce(source.radar_cpv_codes, array[]::text[]))))
  )
  select
    filtered.id, filtered.name, filtered.nif, filtered.cae, filtered.district,
    filtered.municipality, filtered.localidade, filtered.estimated_size, filtered.website,
    filtered.domain, filtered.email, filtered.email_type, filtered.enrichment_status,
    filtered.commercial_status, filtered.commercial_score, filtered.score_reason,
    filtered.matching_opportunities, filtered.estimated_opportunity_value,
    coalesce(filtered.radar_cpv_codes, array[]::text[]) as cpv_codes,
    public.cpv_codes_to_categories(coalesce(filtered.radar_cpv_codes, array[]::text[])) as categories,
    filtered.opt_out, filtered.contact_count, filtered.last_contacted_at,
    filtered.enriched, filtered.has_public_contact,
    filtered.created_at, filtered.updated_at,
    count(*) over()::bigint as total_count
  from filtered
  order by
    filtered.commercial_score desc nulls last,
    filtered.updated_at desc
  limit least(greatest(coalesce(p_page_size, 25), 1), 100)
  offset (least(greatest(coalesce(p_page, 1), 1), 10000) - 1) * least(greatest(coalesce(p_page_size, 25), 1), 100);
$$;

-- ===========================================================================
-- 3. Detalhe consolidado por prospecto
-- ===========================================================================
-- Agrega, num único jsonb auditável:
--   * dados da empresa (prospect_companies);
--   * score comercial + motivo;
--   * oportunidades e CPVs (via Radar, quando ligado);
--   * contactos recolhidos com proveniência (company_enrichment_contacts);
--   * histórico de enriquecimento (company_enrichment_runs);
--   * histórico comercial (melhor snapshot de lead_scores + atividades recentes).
create or replace function public.prospect_management_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.crm_organization_id();
  v_prospect public.prospect_companies;
  v_cpv text[];
  v_categories text[];
  v_detail jsonb;
begin
  if not public.crm_has_role() then raise exception 'CRM access denied'; end if;

  select * into v_prospect
  from public.prospect_companies
  where id = p_id and organization_id = v_org;

  if v_prospect.id is null then
    raise exception 'Prospecto não encontrado';
  end if;

  select coalesce(score.cpv_codes, array[]::text[])
    into v_cpv
    from public.company_prospect_scores score
    where score.company_id = v_prospect.company_id;

  v_cpv := coalesce(v_cpv, array[]::text[]);
  v_categories := public.cpv_codes_to_categories(v_cpv);

  select jsonb_build_object(
    'id', v_prospect.id,
    'name', v_prospect.name,
    'nif', v_prospect.nif,
    'cae', v_prospect.cae,
    'activity_description', v_prospect.activity_description,
    'district', v_prospect.district,
    'municipality', v_prospect.municipality,
    'localidade', v_prospect.localidade,
    'estimated_size', v_prospect.estimated_size,
    'website', v_prospect.website,
    'domain', v_prospect.domain,
    'email', v_prospect.email,
    'email_type', v_prospect.email_type,
    'phone', v_prospect.phone,
    'enrichment_status', v_prospect.enrichment_status,
    'commercial_status', v_prospect.commercial_status,
    'commercial_score', v_prospect.commercial_score,
    'score_reason', v_prospect.score_reason,
    'matching_opportunities', v_prospect.matching_opportunities,
    'estimated_opportunity_value', v_prospect.estimated_opportunity_value,
    'cpv_codes', to_jsonb(v_cpv),
    'categories', to_jsonb(v_categories),
    'opt_out', v_prospect.opt_out,
    'opt_out_at', v_prospect.opt_out_at,
    'opt_out_reason', v_prospect.opt_out_reason,
    'contact_count', v_prospect.contact_count,
    'last_contacted_at', v_prospect.last_contacted_at,
    'created_at', v_prospect.created_at,
    'updated_at', v_prospect.updated_at,
    -- Oportunidades e contexto do Radar (quando a empresa está ligada).
    'radar', (
      select jsonb_build_object(
        'company_id', score.company_id,
        'participation_count', score.participation_count,
        'participation_12m', score.participation_12m,
        'award_count', score.award_count,
        'total_award_value', score.total_award_value,
        'last_participation', score.last_participation,
        'competitor_count', score.competitor_count
      )
      from public.company_prospect_scores score
      where score.company_id = v_prospect.company_id
    ),
    -- Contactos públicos recolhidos, com proveniência completa.
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', contact.id,
        'contacto', contact.contacto,
        'normalizado', contact.normalizado,
        'source_url', contact.source_url,
        'domain', contact.domain,
        'contact_type', contact.contact_type,
        'classification', contact.classification,
        'confidence', contact.confidence,
        'method', contact.method,
        'collected_at', contact.collected_at,
        'note', contact.note,
        'is_opt_out', contact.is_opt_out
      ) order by
        case contact.classification when 'GENERIC_BUSINESS' then 0 when 'UNKNOWN' then 1 else 2 end,
        contact.confidence desc)
      from public.company_enrichment_contacts contact
      where contact.organization_id = v_org and contact.prospect_id = v_prospect.id
    ), '[]'::jsonb),
    -- Histórico de enriquecimento.
    'enrichment_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', run.id,
        'status', run.status,
        'website', run.website,
        'domain', run.domain,
        'website_confidence', run.website_confidence,
        'website_method', run.website_method,
        'pages_crawled', run.pages_crawled,
        'contacts_found', run.contacts_found,
        'emails_found', run.emails_found,
        'phones_found', run.phones_found,
        'skipped_reason', run.skipped_reason,
        'error', run.error,
        'created_at', run.created_at
      ) order by run.created_at desc)
      from public.company_enrichment_runs run
      where run.organization_id = v_org and run.prospect_id = v_prospect.id
    ), '[]'::jsonb),
    -- Histórico comercial: atividades registadas (sales_activities liga-se ao
    -- funil antigo por company; usamos as atividades por prospect quando há
    -- correspondência e, em alternativa, ficamos sem histórico inventado).
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', activity.id,
        'activity_type', activity.activity_type,
        'outcome', activity.outcome,
        'notes', activity.notes,
        'occurred_at', activity.occurred_at,
        'next_action_at', activity.next_action_at
      ) order by activity.occurred_at desc)
      from public.sales_activities activity
      join public.sales_prospects prospect on prospect.id = activity.prospect_id
      where prospect.organization_id = v_org
        and prospect.company_id = v_prospect.company_id
    ), '[]'::jsonb)
  ) into v_detail;

  return v_detail;
end;
$$;

-- ===========================================================================
-- 4. Ações administrativas (auditadas)
-- ===========================================================================
-- Ações suportadas:
--   APPROVE          — aprova o prospecto (ELIGIBLE)
--   REJECT           — rejeita (REJECTED)
--   READY_AUTOPILOT  — marca pronto para Autopilot (não inscreve em campanhas)
--   OPT_OUT          — aplica opt-out definitivo
--   RESET            — devolve o estado comercial a NEW (nunca repõe opt-out)
--
-- Segurança: só admin/commercial_manager. Cada ação é registada em crm_audit.
-- Idempotência: aplicar a mesma ação duas vezes não corrompe o estado; a
-- transição é registada e o estado final é determinístico.
create or replace function public.prospect_management_action(
  p_id uuid,
  p_action text,
  p_reason text default null
)
returns public.prospect_companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.crm_organization_id();
  v_prospect public.prospect_companies;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;

  if p_action not in ('APPROVE', 'REJECT', 'READY_AUTOPILOT', 'OPT_OUT', 'RESET') then
    raise exception 'Ação inválida';
  end if;

  select * into v_prospect
  from public.prospect_companies
  where id = p_id and organization_id = v_org
  for update;

  if v_prospect.id is null then raise exception 'Prospecto não encontrado'; end if;

  -- Um prospecto em opt-out não volta a estado comercial ativo por ação manual.
  if (v_prospect.opt_out or v_prospect.commercial_status = 'OPTED_OUT')
     and p_action in ('APPROVE', 'READY_AUTOPILOT', 'RESET') then
    raise exception 'Prospecto com opt-out — não pode ser reativado';
  end if;

  update public.prospect_companies set
    commercial_status = case p_action
      when 'APPROVE' then 'ELIGIBLE'
      when 'REJECT' then 'REJECTED'
      when 'READY_AUTOPILOT' then 'READY_FOR_AUTOPILOT'
      when 'OPT_OUT' then 'OPTED_OUT'
      when 'RESET' then 'NEW'
      else commercial_status end,
    enrichment_status = case p_action
      when 'APPROVE' then 'ELIGIBLE'
      when 'REJECT' then 'REJECTED'
      when 'READY_AUTOPILOT' then 'READY_FOR_AUTOPILOT'
      else enrichment_status end,
    opt_out = case when p_action = 'OPT_OUT' then true else opt_out end,
    opt_out_at = case when p_action = 'OPT_OUT' then coalesce(opt_out_at, now()) else opt_out_at end,
    opt_out_reason = case when p_action = 'OPT_OUT'
      then coalesce(nullif(btrim(coalesce(p_reason, '')), ''), opt_out_reason)
      else opt_out_reason end,
    updated_at = now()
  where id = p_id and organization_id = v_org
  returning * into v_prospect;

  perform public.crm_audit('prospect_management_action', 'prospect_company', v_prospect.id,
    jsonb_build_object('action', p_action, 'reason', p_reason));
  return v_prospect;
end;
$$;

-- ===========================================================================
-- 5. Permissões
-- ===========================================================================
revoke all on function public.prospect_management_metrics() from public;
revoke all on function public.prospect_management_list(text, text, text, integer, integer, text, text, text, text, text, boolean, boolean, boolean, integer, numeric, integer, integer) from public;
revoke all on function public.prospect_management_detail(uuid) from public;
revoke all on function public.prospect_management_action(uuid, text, text) from public;

grant execute on function public.prospect_management_metrics() to authenticated;
grant execute on function public.prospect_management_list(text, text, text, integer, integer, text, text, text, text, text, boolean, boolean, boolean, integer, numeric, integer, integer) to authenticated;
grant execute on function public.prospect_management_detail(uuid) to authenticated;
grant execute on function public.prospect_management_action(uuid, text, text) to authenticated;
