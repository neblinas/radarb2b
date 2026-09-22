-- Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
--
-- Porquê esta migração:
--   Cria a estrutura de dados e os RPCs que permitem ao administrador
--   descobrir/importar empresas EXTERNAS (que ainda não existem na Adjudata) a
--   partir de fontes legalmente reutilizáveis (dados abertos/API, ficheiros
--   CSV/JSON, listas manuais), e inseri-las de forma idempotente e auditada no
--   fluxo normal (prospect_companies → enriquecimento → scoring → elegibilidade).
--
-- Âmbito (Fase 8):
--   * registo das execuções de descoberta externa (auditoria + contadores);
--   * snapshot de empresas conhecidas/bloqueadas (para o motor pré-visualizar
--     sem repetir trabalho);
--   * persistência idempotente: dry-run apenas registra; execução real cria
--     prospects via `prospect_company_create` (deduplicação + opt-out
--     autoritativos no backend).
--
-- NÃO implementado nesta fase (deliberado):
--   * envio de emails, campanhas, integração com o Autopilot;
--   * crawling/scraping de websites (continua na FASE 4, respeitando robots.txt);
--   * agendamento automático (cron/scheduler).
--
-- Princípios (AGENTS.md):
--   * Idempotente: pode correr várias vezes sem efeitos colaterais.
--   * Não destrói dados nem histórico.
--   * Segurança: RLS por organização; RPCs security definer com search_path
--     fixo; escrita restrita a admin/commercial_manager validada no backend.
--   * Integridade: nenhum dado inventado; a criação reutiliza a validação já
--     existente (NIF como identificador lógico, dedup_key conservador, opt-out).
--
-- Executar no Supabase SQL Editor como project owner (ou via `supabase db push`).

-- ===========================================================================
-- 1. Execuções de descoberta externa (auditoria + contadores)
-- ===========================================================================
create table if not exists public.external_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Identificador do provider que produziu os resultados (ex.: file_import).
  provider text not null check (length(btrim(provider)) > 0),
  -- Execução em modo simulação (nenhum prospect criado)?
  dry_run boolean not null default true,
  -- Filtros usados (para reprodutibilidade e auditoria).
  filters jsonb not null default '{}'::jsonb,
  -- Contadores do relatório.
  found integer not null default 0 check (found >= 0),
  existing integer not null default 0 check (existing >= 0),
  blocked integer not null default 0 check (blocked >= 0),
  invalid integer not null default 0 check (invalid >= 0),
  created integer not null default 0 check (created >= 0),
  errors integer not null default 0 check (errors >= 0),
  source_duplicates integer not null default 0 check (source_duplicates >= 0),
  -- Detalhe de erros parciais (não fatais).
  errors_detail jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists external_discovery_runs_org_idx
  on public.external_discovery_runs (organization_id, created_at desc);
create index if not exists external_discovery_runs_provider_idx
  on public.external_discovery_runs (organization_id, provider, created_at desc);

alter table public.external_discovery_runs enable row level security;

drop policy if exists external_discovery_runs_select on public.external_discovery_runs;
create policy external_discovery_runs_select on public.external_discovery_runs
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

-- ===========================================================================
-- 2. Checkpoints de sincronização incremental (por provider)
-- ===========================================================================
-- Guarda o cursor/data da última sincronização incremental de cada fonte. Só
-- se aplica a providers que suportem incremental (a maioria não suporta nesta
-- fase). A coluna `cursor` é OPACA (nunca interpretada pelo motor).
create table if not exists public.external_discovery_checkpoints (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (length(btrim(provider)) > 0),
  cursor text,
  updated_since timestamptz,
  last_run_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider)
);

alter table public.external_discovery_checkpoints enable row level security;

drop policy if exists external_discovery_checkpoints_select on public.external_discovery_checkpoints;
create policy external_discovery_checkpoints_select on public.external_discovery_checkpoints
  for select using (organization_id = public.crm_organization_id() and public.crm_has_role());

-- ===========================================================================
-- 3. Snapshot de empresas conhecidas (deduplicação não-autoritativa)
-- ===========================================================================
-- Devolve os NIFs e chaves conservadoras (nome|localização) que JÁ existem na
-- Adjudata, e as que estão BLOQUEADAS (opt-out / suppression). Serve apenas para
-- o motor pré-visualizar (dry-run) e evitar trabalho repetido — a autoridade da
-- deduplicação é sempre `prospect_company_create` no momento da inserção.
create or replace function public.external_discovery_known_companies()
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

  with known_prospects as (
    select
      prospect.nif_normalized,
      prospect.dedup_key,
      prospect.opt_out or prospect.commercial_status = 'OPTED_OUT' as is_blocked
    from public.prospect_companies prospect
    where prospect.organization_id = v_org
  ),
  known_companies as (
    -- Empresas do Radar (adjudicatárias) — contribuem o NIF conhecido.
    select
      nullif(regexp_replace(coalesce(company.nif, ''), '\D', '', 'g'), '') as nif_normalized
    from public.companies company
    where nullif(regexp_replace(coalesce(company.nif, ''), '\D', '', 'g'), '') is not null
  )
  select jsonb_build_object(
    'known_nifs', coalesce((
      select jsonb_agg(distinct nif order by nif)
      from (
        select nif_normalized as nif from known_prospects where nif_normalized is not null
        union
        select nif_normalized as nif from known_companies where nif_normalized is not null
      ) all_known
    ), '[]'::jsonb),
    'known_dedup_keys', coalesce((
      select jsonb_agg(distinct dedup_key order by dedup_key)
      from known_prospects
      where nif_normalized is null and dedup_key is not null
    ), '[]'::jsonb),
    'blocked_nifs', coalesce((
      select jsonb_agg(distinct nif_normalized order by nif_normalized)
      from known_prospects
      where is_blocked and nif_normalized is not null
    ), '[]'::jsonb),
    'blocked_dedup_keys', coalesce((
      select jsonb_agg(distinct dedup_key order by dedup_key)
      from known_prospects
      where is_blocked and nif_normalized is null and dedup_key is not null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ===========================================================================
-- 4. Persistência idempotente de uma execução
-- ===========================================================================
-- Comportamento:
--   * dry-run: registra a execução com os contadores, cria ZERO prospects;
--   * real: registra a execução e cria cada candidato novo via
--     `prospect_company_create` (que valida role, deduplica por NIF/empresa e
--     respeita opt-out), contando criados vs. ignorados (já existentes).
--
-- Idempotência: chamadas repetidas do mesmo payload não duplicam prospects
-- (a deduplicação do create é a barreira). O RPC nunca falha em bloco por causa
-- de um registo inválido: contabiliza-o e continua.
--
-- Segurança: só admin/commercial_manager. Cada execução é auditada.
create or replace function public.external_discovery_persist(
  p_provider text,
  p_dry_run boolean default true,
  p_filters jsonb default '{}'::jsonb,
  p_found integer default 0,
  p_existing integer default 0,
  p_blocked integer default 0,
  p_invalid integer default 0,
  p_errors integer default 0,
  p_source_duplicates integer default 0,
  p_errors_detail jsonb default '[]'::jsonb,
  p_records jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.crm_organization_id();
  v_run public.external_discovery_runs;
  v_created integer := 0;
  v_skipped integer := 0;
  v_before integer := 0;
  v_after integer := 0;
  v_item jsonb;
  v_provider text := nullif(btrim(coalesce(p_provider, '')), '');
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;
  if v_provider is null then raise exception 'Provider obrigatório'; end if;

  -- Conta prospects ANTES (para medir criados reais de forma determinística).
  select count(*) into v_before from public.prospect_companies where organization_id = v_org;

  if not coalesce(p_dry_run, true) then
    for v_item in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb))
    loop
      -- Só processa itens com nome; tudo o resto é ignorado (contado à parte).
      if nullif(btrim(coalesce(v_item->>'name', '')), '') is not null then
        begin
          perform public.prospect_company_create(
            p_name => v_item->>'name',
            p_nif => nullif(v_item->>'nif', ''),
            p_cae => nullif(v_item->>'cae', ''),
            p_activity_description => nullif(v_item->>'activity_description', ''),
            p_district => nullif(v_item->>'district', ''),
            p_municipality => nullif(v_item->>'municipality', ''),
            p_localidade => nullif(v_item->>'localidade', ''),
            p_estimated_size => nullif(v_item->>'estimated_size', ''),
            p_website => nullif(v_item->>'website', ''),
            p_domain => nullif(v_item->>'domain', ''),
            p_company_source => coalesce(nullif(v_item->>'company_source', ''), v_provider),
            p_contact_source => null
          );
        exception when others then
          -- Um registo inválido não interrompe os restantes; é contabilizado.
          v_skipped := v_skipped + 1;
          continue;
        end;
      else
        v_skipped := v_skipped + 1;
      end if;
    end loop;
  end if;

  select count(*) into v_after from public.prospect_companies where organization_id = v_org;
  v_created := greatest(v_after - v_before, 0);
  -- No dry-run nada é criado; no real, o que não foi criado foi ignorado.
  if coalesce(p_dry_run, true) then
    v_created := 0;
    v_skipped := jsonb_array_length(coalesce(p_records, '[]'::jsonb));
  else
    v_skipped := greatest(v_skipped, 0);
  end if;

  insert into public.external_discovery_runs (
    organization_id, provider, dry_run, filters, found, existing, blocked, invalid,
    created, errors, source_duplicates, errors_detail, created_by, started_at, finished_at
  ) values (
    v_org, v_provider, coalesce(p_dry_run, true), coalesce(p_filters, '{}'::jsonb),
    greatest(coalesce(p_found, 0), 0), greatest(coalesce(p_existing, 0), 0),
    greatest(coalesce(p_blocked, 0), 0), greatest(coalesce(p_invalid, 0), 0),
    v_created, greatest(coalesce(p_errors, 0), 0), greatest(coalesce(p_source_duplicates, 0), 0),
    coalesce(p_errors_detail, '[]'::jsonb), auth.uid(), now(), now()
  )
  returning * into v_run;

  -- Atualiza o checkpoint do provider (última execução).
  insert into public.external_discovery_checkpoints (organization_id, provider, last_run_at, updated_at)
  values (v_org, v_provider, now(), now())
  on conflict (organization_id, provider)
  do update set last_run_at = now(), updated_at = now();

  perform public.crm_audit('external_discovery_run', 'external_discovery_run', v_run.id,
    jsonb_build_object(
      'provider', v_provider, 'dry_run', coalesce(p_dry_run, true),
      'found', v_run.found, 'created', v_run.created, 'skipped', v_skipped
    ));

  return jsonb_build_object(
    'run_id', v_run.id,
    'provider', v_run.provider,
    'dry_run', v_run.dry_run,
    'created', v_run.created,
    'skipped', v_skipped,
    'counters', jsonb_build_object(
      'found', v_run.found, 'existing', v_run.existing, 'blocked', v_run.blocked,
      'invalid', v_run.invalid, 'created', v_run.created, 'errors', v_run.errors,
      'source_duplicates', v_run.source_duplicates
    )
  );
end;
$$;

-- ===========================================================================
-- 5. Histórico de execuções
-- ===========================================================================
create or replace function public.external_discovery_runs_list(p_limit integer default 10)
returns table (
  id uuid, provider text, dry_run boolean, filters jsonb, found integer,
  existing integer, blocked integer, invalid integer, created integer,
  errors integer, source_duplicates integer, created_by uuid,
  started_at timestamptz, finished_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select run.id, run.provider, run.dry_run, run.filters, run.found, run.existing,
    run.blocked, run.invalid, run.created, run.errors, run.source_duplicates,
    run.created_by, run.started_at, run.finished_at
  from public.external_discovery_runs run
  where run.organization_id = public.crm_organization_id() and public.crm_has_role()
  order by run.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- ===========================================================================
-- 6. Permissões
-- ===========================================================================
revoke all on function public.external_discovery_known_companies() from public;
revoke all on function public.external_discovery_persist(text, boolean, jsonb, integer, integer, integer, integer, integer, integer, jsonb, jsonb) from public;
revoke all on function public.external_discovery_runs_list(integer) from public;

grant execute on function public.external_discovery_known_companies() to authenticated;
grant execute on function public.external_discovery_persist(text, boolean, jsonb, integer, integer, integer, integer, integer, integer, jsonb, jsonb) to authenticated;
grant execute on function public.external_discovery_runs_list(integer) to authenticated;
