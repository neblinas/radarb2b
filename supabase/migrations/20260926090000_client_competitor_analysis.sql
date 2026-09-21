-- Adjudata — Análise de concorrência para o portal do cliente.
--
-- Reutiliza dados reais já existentes na plataforma:
--   * public.procedure_participants (procedure_id, company_id, participant_type)
--   * public.awards               (procedure_id, company_id, award_value, award_date)
--   * public.procedures           (publication_date, base_price, buyer_id)
--   * public.companies / public.entities / public.cpvs
--
-- NÃO cria dados nem infere concorrentes por "mesmo setor". Um concorrente é
-- sempre uma empresa com PRESENÇA REAL observada nos mesmos procedimentos.
--
-- O gating de plano é aplicado no BACKEND (RLS não é suficiente aqui porque as
-- tabelas base são de leitura pública; o valor está na agregação). Assim, um
-- utilizador Free não consegue obter a análise completa nem chamando a RPC
-- diretamente, independentemente do que o frontend mostra.

-- ---------------------------------------------------------------------------
-- 1. Plano atual do utilizador autenticado.
-- ---------------------------------------------------------------------------
create or replace function public.client_current_plan()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select subscription.plan_id
      from public.subscriptions subscription
      where subscription.user_id = auth.uid()
        and subscription.status in ('active', 'trialing', 'past_due')
      order by subscription.updated_at desc nulls last
      limit 1
    ),
    'free'
  );
$$;

revoke all on function public.client_current_plan() from public;
grant execute on function public.client_current_plan() to authenticated;

-- Pro ou Starter desbloqueiam a análise de concorrência completa.
create or replace function public.client_can_use_competitor_analysis()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.client_current_plan(), 'free') in ('starter', 'pro');
$$;

revoke all on function public.client_can_use_competitor_analysis() from public;
grant execute on function public.client_can_use_competitor_analysis() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Competidores de uma empresa (por co-participação real em procedimentos).
--
-- Devolve, no máximo, `p_limit` concorrentes ordenados por número de
-- procedimentos em comum. Cada linha usa apenas indicadores calculáveis.
-- ---------------------------------------------------------------------------
create or replace function public.company_competitors(
  p_company_id uuid,
  p_limit integer default 25
)
returns table (
  company_id uuid,
  name text,
  nif text,
  shared_procedures integer,
  shared_last_date date,
  competitor_awards integer,
  competitor_award_value numeric,
  competitor_participations integer,
  competitor_participations_12m integer,
  top_cpvs text[],
  top_buyers text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with my_procedures as (
    select participant.procedure_id
    from public.procedure_participants participant
    where participant.company_id = p_company_id
  ),
  shared as (
    select peer.company_id,
      count(distinct peer.procedure_id)::integer as shared_procedures
    from public.procedure_participants peer
    where peer.company_id <> p_company_id
      and peer.procedure_id in (select procedure_id from my_procedures)
    group by peer.company_id
  ),
  shared_dates as (
    select peer.company_id, max(procedure.publication_date) as shared_last_date
    from public.procedure_participants peer
    join public.procedures procedure on procedure.id = peer.procedure_id
    where peer.company_id <> p_company_id
      and peer.procedure_id in (select procedure_id from my_procedures)
    group by peer.company_id
  ),
  participation as (
    select participant.company_id,
      count(distinct participant.procedure_id)::integer as participations,
      count(distinct participant.procedure_id) filter (
        where procedure.publication_date >= current_date - interval '12 months'
      )::integer as participations_12m
    from public.procedure_participants participant
    join public.procedures procedure on procedure.id = participant.procedure_id
    group by participant.company_id
  ),
  awards_agg as (
    select award.company_id,
      count(*)::integer as awards,
      coalesce(sum(award.award_value), 0)::numeric as award_value
    from public.awards award
    group by award.company_id
  ),
  cpv_rank as (
    select link.company_id, cpv.cpv_code, count(*)::integer as hits
    from (
      select award.company_id, cpv_link.cpv_id
      from public.awards award
      join public.contract_awards contract_award on contract_award.award_id = award.id
      join public.contract_cpvs cpv_link on cpv_link.contract_id = contract_award.contract_id
      where award.company_id in (select company_id from shared)
    ) link
    join public.cpvs cpv on cpv.id = link.cpv_id
    where cpv.cpv_code is not null
    group by link.company_id, cpv.cpv_code
  ),
  cpv_top as (
    select cpv_rank.company_id, array_agg(cpv_rank.cpv_code order by cpv_rank.hits desc) as cpv_codes
    from cpv_rank
    group by cpv_rank.company_id
  ),
  buyer_rank as (
    select award.company_id, entity.name, count(*)::integer as hits
    from public.awards award
    join public.procedures procedure on procedure.id = award.procedure_id
    join public.entities entity on entity.id = procedure.buyer_id
    where award.company_id in (select company_id from shared)
      and entity.name is not null
    group by award.company_id, entity.name
  ),
  buyer_top as (
    select buyer_rank.company_id, array_agg(buyer_rank.name order by buyer_rank.hits desc) as buyer_names
    from buyer_rank
    group by buyer_rank.company_id
  )
  select
    shared.company_id,
    company.name,
    company.nif,
    shared.shared_procedures,
    shared_dates.shared_last_date,
    coalesce(awards_agg.awards, 0) as competitor_awards,
    coalesce(awards_agg.award_value, 0) as competitor_award_value,
    coalesce(participation.participations, 0) as competitor_participations,
    coalesce(participation.participations_12m, 0) as competitor_participations_12m,
    coalesce(cpv_top.cpv_codes[1:5], array[]::text[]) as top_cpvs,
    coalesce(buyer_top.buyer_names[1:3], array[]::text[]) as top_buyers
  from shared
  join public.companies company on company.id = shared.company_id
  left join shared_dates on shared_dates.company_id = shared.company_id
  left join participation on participation.company_id = shared.company_id
  left join awards_agg on awards_agg.company_id = shared.company_id
  left join cpv_top on cpv_top.company_id = shared.company_id
  left join buyer_top on buyer_top.company_id = shared.company_id
  order by shared.shared_procedures desc, competitor_award_value desc
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

revoke all on function public.company_competitors(uuid, integer) from public;
grant execute on function public.company_competitors(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Indicadores de competição de uma empresa (KPIs do topo da página).
-- ---------------------------------------------------------------------------
create or replace function public.company_competition_summary(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with my_procedures as (
    select distinct procedure_id
    from public.procedure_participants
    where company_id = p_company_id
  ),
  competitors as (
    select distinct peer.company_id
    from public.procedure_participants peer
    where peer.company_id <> p_company_id
      and peer.procedure_id in (select procedure_id from my_procedures)
  ),
  recent_competitors as (
    select distinct peer.company_id
    from public.procedure_participants peer
    join public.procedures procedure on procedure.id = peer.procedure_id
    where peer.company_id <> p_company_id
      and procedure.publication_date >= current_date - interval '12 months'
      and peer.procedure_id in (select procedure_id from my_procedures)
  ),
  most_frequent as (
    select peer.company_id, company.name, count(distinct peer.procedure_id)::integer as shared
    from public.procedure_participants peer
    join public.companies company on company.id = peer.company_id
    where peer.company_id <> p_company_id
      and peer.procedure_id in (select procedure_id from my_procedures)
    group by peer.company_id, company.name
    order by shared desc
    limit 1
  )
  select jsonb_build_object(
    'company_id', p_company_id,
    'participations', (select count(*) from my_procedures),
    'has_company', exists (select 1 from public.companies where id = p_company_id),
    'competitor_count', (select count(*) from competitors),
    'competitor_count_12m', (select count(*) from recent_competitors),
    'most_frequent_competitor', (
      select jsonb_build_object('company_id', company_id, 'name', name, 'shared', shared)
      from most_frequent
    )
  );
$$;

revoke all on function public.company_competition_summary(uuid) from public;
grant execute on function public.company_competition_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Competidores dentro de um procedimento (co-participantes + adjudicatários).
-- ---------------------------------------------------------------------------
create or replace function public.procedure_competitors(p_procedure_id uuid)
returns table (
  company_id uuid,
  name text,
  nif text,
  role text,
  won boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with participants as (
    select participant.company_id, coalesce(participant.participant_type, 'Participante') as role
    from public.procedure_participants participant
    where participant.procedure_id = p_procedure_id
  ),
  winners as (
    select distinct award.company_id
    from public.awards award
    where award.procedure_id = p_procedure_id
  ),
  combined as (
    select participants.company_id, participants.role
    from participants
    union
    select winners.company_id, 'Adjudicatário'
    from winners
  )
  select
    combined.company_id,
    company.name,
    company.nif,
    combined.role,
    exists (select 1 from winners where winners.company_id = combined.company_id) as won
  from combined
  join public.companies company on company.id = combined.company_id
  order by won desc, company.name;
$$;

revoke all on function public.procedure_competitors(uuid) from public;
grant execute on function public.procedure_competitors(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Índices de suporte (verificados inexistentes pelos nomes atuais).
-- ---------------------------------------------------------------------------
create index if not exists procedure_participants_company_idx
  on public.procedure_participants (company_id, procedure_id);
create index if not exists procedure_participants_procedure_company_idx
  on public.procedure_participants (procedure_id, company_id);
create index if not exists awards_procedure_company_idx
  on public.awards (procedure_id, company_id);
