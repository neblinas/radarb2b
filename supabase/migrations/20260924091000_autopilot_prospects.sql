-- Radar B2B — Sales Autopilot: autopilot de prospects (FASE 2).
-- Run once in Supabase SQL Editor as project owner.
--
-- Objetivo: permitir que prospects sejam geridos pela AUTOMAÇÃO sem quebrar o
-- sistema comercial humano existente.
--
--   * owner_type em sales_prospects: 'unassigned' | 'automation' | 'commercial'
--   * selector configurável (sem regras hardcoded): automation_select_prospects
--   * porta de serviço para enriquecimento/validação (service role)
--   * registo de transições do autopilot em automation_events

-- ===========================================================================
-- 1. Ownership
-- ===========================================================================
alter table public.sales_prospects
  add column if not exists owner_type text not null default 'unassigned'
    check (owner_type in ('unassigned', 'automation', 'commercial'));
alter table public.sales_prospects
  add column if not exists autopilot_state text;
alter table public.sales_prospects
  add column if not exists last_contacted_at timestamptz;
alter table public.sales_prospects
  add column if not exists contact_confidence smallint;

create index if not exists sales_prospects_owner_idx
  on public.sales_prospects (organization_id, owner_type, status);
create index if not exists sales_prospects_autopilot_idx
  on public.sales_prospects (organization_id, autopilot_state)
  where owner_type = 'automation';

-- Mantém owner_type coerente com assigned_to quando este é definido por humanos.
create or replace function public.sales_prospects_sync_owner()
returns trigger language plpgsql as $$
begin
  if new.owner_type = 'commercial' and new.assigned_to is null then
    new.owner_type := 'unassigned';
  end if;
  if new.assigned_to is not null and new.owner_type <> 'commercial' then
    -- Alguém atribuiu a um humano explicitamente via assigned_to.
    new.owner_type := 'commercial';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_prospects_owner_sync on public.sales_prospects;
create trigger sales_prospects_owner_sync
  before insert or update of assigned_to, owner_type on public.sales_prospects
  for each row execute function public.sales_prospects_sync_owner();

-- ===========================================================================
-- 2. Registar transição do autopilot (escreve histórico + estado atual)
-- ===========================================================================
create or replace function public.automation_record_transition_service(
  p_prospect_id uuid,
  p_to_state text,
  p_reason text default null,
  p_source text default 'automation',
  p_metadata jsonb default '{}'::jsonb
)
returns public.automation_events
language plpgsql security definer set search_path = public as $$
declare
  current_state text;
  event public.automation_events;
  prospect_org uuid;
begin
  select autopilot_state, organization_id into current_state, prospect_org
    from public.sales_prospects where id = p_prospect_id;
  if prospect_org is null then raise exception 'Prospect not found'; end if;

  insert into public.automation_events
    (organization_id, prospect_id, from_state, to_state, reason, source, actor_id, metadata)
  values
    (prospect_org, p_prospect_id, current_state, p_to_state, left(coalesce(p_reason, ''), 500),
     case when p_source in ('automation','commercial','system','webhook','user') then p_source else 'system' end,
     auth.uid(), coalesce(p_metadata, '{}'::jsonb))
  returning * into event;

  update public.sales_prospects
    set autopilot_state = p_to_state, updated_at = now()
  where id = p_prospect_id;

  return event;
end;
$$;

-- ===========================================================================
-- 3. Selector de prospects (regras configuráveis, sem hardcode disperso)
-- ===========================================================================
-- Seleciona candidatos para automação com base nas settings da organização.
-- NÃO atribui nada; apenas devolve a lista ordenada por score. A atribuição e
-- o enfileiramento são feitos pelo worker.
create or replace function public.automation_select_prospects(
  p_organization_id uuid,
  p_limit integer default 25
)
returns table (
  company_id uuid,
  company_name text,
  company_nif text,
  prospect_score integer,
  participation_12m integer,
  total_award_value numeric,
  last_participation date,
  has_website boolean,
  website_verified boolean,
  prospect_id uuid,
  prospects_count integer
)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select
      coalesce((select value::text::integer from public.app_settings where organization_id = p_organization_id and key = 'autopilot_min_score'), 60) as min_score,
      coalesce((select value::text::integer from public.app_settings where organization_id = p_organization_id and key = 'autopilot_prospect_cooldown_days'), 30) as cooldown_days
  ),
  scored as (
    select
      score.company_id, score.name, score.nif,
      (score.recent_activity_points + score.frequency_points + score.value_points + score.competition_points + score.cpv_diversity_points + score.recency_points)::integer as total_score,
      score.participation_12m, score.total_award_value, score.last_participation
    from public.company_prospect_scores score
  )
  select
    scored.company_id, scored.name, scored.nif, scored.total_score,
    scored.participation_12m, scored.total_award_value, scored.last_participation,
    (profile.website is not null) as has_website,
    coalesce(profile.website_verified, false) as website_verified,
    prospect.id as prospect_id,
    count(*) over()::integer as prospects_count
  from scored
  cross join cfg
  left join public.company_public_profiles profile on profile.company_id = scored.company_id
  left join public.sales_prospects prospect
    on prospect.company_id = scored.company_id and prospect.organization_id = p_organization_id
  where
    -- Score mínimo.
    scored.total_score >= cfg.min_score
    -- Atividade recente relevante (participação nos últimos 12 meses ou valor).
    and (coalesce(scored.participation_12m, 0) > 0 or coalesce(scored.total_award_value, 0) > 0)
    -- Não convertido e não em estados finais CRM.
    and (prospect.id is null or prospect.status not in ('WON', 'LOST', 'DO_NOT_CONTACT', 'INACTIVE'))
    -- Ownership: só disponíveis (sem humano e sem automação já ativa).
    and (prospect.id is null or prospect.owner_type = 'unassigned')
    -- Cooldown por contacto recente.
    and (prospect.last_contacted_at is null or prospect.last_contacted_at < now() - (cfg.cooldown_days || ' days')::interval)
    -- Suppression central (não contactar).
    and not public.is_suppressed(p_organization_id, null, null, scored.company_id)
  order by scored.total_score desc, scored.last_participation desc nulls last
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.automation_select_prospects(uuid, integer) from public;
grant execute on function public.automation_select_prospects(uuid, integer) to service_role;

-- ===========================================================================
-- 4. Porta de serviço: marcar contacto, enriquecer, validar contacto
-- ===========================================================================
-- Atribui o prospect à automação e registra a transição inicial.
create or replace function public.automation_claim_prospect_service(
  p_company_id uuid,
  p_organization_id uuid
)
returns public.sales_prospects
language plpgsql security definer set search_path = public as $$
declare prospect public.sales_prospects;
begin
  insert into public.sales_prospects (organization_id, company_id, owner_type, autopilot_state, last_activity_at)
  values (p_organization_id, p_company_id, 'automation', 'discovered', now())
  on conflict (organization_id, company_id) do nothing;

  select * into prospect from public.sales_prospects
    where organization_id = p_organization_id and company_id = p_company_id
    for update;

  -- Não mexer se já pertence a um humano.
  if prospect.owner_type = 'commercial' or prospect.assigned_to is not null then
    return prospect;
  end if;

  update public.sales_prospects
    set owner_type = 'automation', updated_at = now()
    where id = prospect.id
    returning * into prospect;

  perform public.automation_record_transition_service(prospect.id, 'discovered', 'autopilot_claimed', 'automation');
  return prospect;
end;
$$;

-- Define/atualiza o website + verificação do perfil público (service role).
create or replace function public.automation_set_company_profile_service(
  p_company_id uuid,
  p_website text,
  p_source_url text,
  p_verified boolean default false
)
returns public.company_public_profiles
language plpgsql security definer set search_path = public as $$
declare profile public.company_public_profiles;
begin
  insert into public.company_public_profiles (company_id, website, website_verified, website_source_url, website_verified_at)
  values (p_company_id, nullif(trim(coalesce(p_website,'')), ''), coalesce(p_verified,false),
          nullif(trim(coalesce(p_source_url,'')), ''), case when p_verified then now() else null end)
  on conflict (company_id) do update set
    website = excluded.website,
    website_verified = excluded.website_verified,
    website_source_url = excluded.website_source_url,
    website_verified_at = excluded.website_verified_at,
    updated_at = now()
  returning * into profile;
  return profile;
end;
$$;

-- Grava contactos descobertos (service role), respeitando confidence e dedup.
create or replace function public.automation_upsert_contacts_service(
  p_company_id uuid,
  p_contacts jsonb
)
returns integer
language plpgsql security definer set search_path = public as $$
declare inserted integer := 0;
begin
  insert into public.company_public_contacts (company_id, contact_type, value, normalized_value, source_url, confidence, active)
  select
    p_company_id,
    (item->>'contact_type'),
    (item->>'value'),
    (item->>'normalized_value'),
    (item->>'source_url'),
    least(100, greatest(0, coalesce((item->>'confidence')::integer, 50))),
    true
  from jsonb_array_elements(coalesce(p_contacts, '[]'::jsonb)) item
  where (item->>'contact_type') in ('general_email','commercial_email','support_email','phone','address','linkedin','contact_page','other')
    and coalesce(item->>'source_url','') ~* '^https?://'
  on conflict (company_id, contact_type, normalized_value) do update
    set confidence = greatest(public.company_public_contacts.confidence, excluded.confidence),
        active = true;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Marca o contacto principal escolhido e a confiança no prospect.
create or replace function public.automation_set_contact_confidence_service(
  p_prospect_id uuid,
  p_confidence integer
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.sales_prospects
    set contact_confidence = least(100, greatest(0, coalesce(p_confidence, 0))), updated_at = now()
  where id = p_prospect_id;
end;
$$;

-- Marca contacto realizado (atualiza last_contacted_at) — usado no outbound.
create or replace function public.automation_mark_contacted_service(
  p_prospect_id uuid,
  p_state text default 'contacted'
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.sales_prospects
    set last_contacted_at = now(), autopilot_state = coalesce(p_state, 'contacted'), updated_at = now()
  where id = p_prospect_id;
end;
$$;

-- Devolve o snapshot mínimo de dados reais (para personalização sem inventar).
create or replace function public.automation_prospect_facts(p_company_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'company_name', score.name,
    'nif', score.nif,
    'participation_count', score.participation_count,
    'participation_12m', score.participation_12m,
    'award_count', score.award_count,
    'total_award_value', score.total_award_value,
    'last_participation', score.last_participation,
    'cpv_codes', coalesce(to_jsonb(score.cpv_codes), '[]'::jsonb),
    'competitor_count', score.competitor_count
  )
  from public.company_prospect_scores score
  where score.company_id = p_company_id;
$$;

revoke all on function public.automation_claim_prospect_service(uuid, uuid) from public;
revoke all on function public.automation_set_company_profile_service(uuid, text, text, boolean) from public;
revoke all on function public.automation_upsert_contacts_service(uuid, jsonb) from public;
revoke all on function public.automation_set_contact_confidence_service(uuid, integer) from public;
revoke all on function public.automation_mark_contacted_service(uuid, text) from public;
revoke all on function public.automation_record_transition_service(uuid, text, text, text, jsonb) from public;
revoke all on function public.automation_prospect_facts(uuid) from public;

grant execute on function public.automation_claim_prospect_service(uuid, uuid) to service_role;
grant execute on function public.automation_set_company_profile_service(uuid, text, text, boolean) to service_role;
grant execute on function public.automation_upsert_contacts_service(uuid, jsonb) to service_role;
grant execute on function public.automation_set_contact_confidence_service(uuid, integer) to service_role;
grant execute on function public.automation_mark_contacted_service(uuid, text) to service_role;
grant execute on function public.automation_record_transition_service(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.automation_prospect_facts(uuid) to service_role;
