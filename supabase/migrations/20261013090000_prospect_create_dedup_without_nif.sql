-- Adjudata — Prospeção B2B: deduplicação correta de prospects sem NIF (FASE 11).
--
-- BUG corrigido:
--   `prospect_company_create` só deduplicava por NIF. Para registos SEM NIF
--   (a maioria dos imports por ficheiro), o `insert` colidia com o índice único
--   parcial `prospect_companies_dedup_idx` (organization_id, dedup_key) WHERE
--   nif_normalized IS NULL. O bloco `exception when unique_violation` recuperava
--   o existente apenas por NIF/company_id — e como ambos são nulos, devolvia
--   ZERO linhas, deixando o record de retorno com um `id` INEXISTENTE (fantasma).
--
--   Consequência: `external_discovery_persist` fazia o upsert de contacto com o
--   `id` fantasma, que não correspondia a nenhuma linha -> o email nunca era
--   gravado em prospects sem NIF. Só entravam os que tinham NIF.
--
-- Correção:
--   * deduplicação por `dedup_key` (nome normalizado + localidade) quando não há
--     NIF, ANTES do insert;
--   * recuperação no `unique_violation` também por `dedup_key` (cobre corridas),
--     devolvendo sempre a linha REAL existente.
--
-- Idempotente. Não altera o contrato (mesma assinatura/retorno). Sem dados
-- inventados. Segurança inalterada (security definer, role admin/manager).
--
-- Executar no Supabase Studio SQL Editor como project owner (ou `supabase db push`).

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
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.prospect_companies;
  existing public.prospect_companies;
  v_org uuid := public.crm_organization_id();
  v_nif_normalized text := nullif(regexp_replace(coalesce(p_nif, ''), '\D', '', 'g'), '');
  v_dedup_key text;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Nome da empresa obrigatório';
  end if;

  -- Chave de deduplicação CONSERVADORA (nome normalizado + localidade), igual à
  -- coluna gerada `prospect_companies.dedup_key` e à usada pelo motor do
  -- frontend (`dedupKeyForRecord`). Só relevante quando não há NIF.
  v_dedup_key := lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'))
    || '|' || lower(regexp_replace(btrim(coalesce(p_localidade, '')), '\s+', ' ', 'g'));

  -- Deduplicação por NIF (identificador lógico, preferido).
  if v_nif_normalized is not null then
    select * into existing from public.prospect_companies
      where organization_id = v_org and nif_normalized = v_nif_normalized
      limit 1;
    if existing.id is not null then return existing; end if;
  else
    -- Sem NIF: deduplica por nome + localidade.
    select * into existing from public.prospect_companies
      where organization_id = v_org and nif_normalized is null and dedup_key = v_dedup_key
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
      v_org, p_company_id, btrim(p_name), nullif(btrim(coalesce(p_nif, '')), ''),
      nullif(btrim(coalesce(p_cae, '')), ''), nullif(btrim(coalesce(p_activity_description, '')), ''),
      nullif(btrim(coalesce(p_district, '')), ''), nullif(btrim(coalesce(p_municipality, '')), ''),
      nullif(btrim(coalesce(p_localidade, '')), ''), p_estimated_size,
      nullif(btrim(coalesce(p_website, '')), ''), nullif(btrim(coalesce(p_domain, '')), ''),
      nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_email, '')), ''), p_email_type,
      nullif(btrim(coalesce(p_contact_source_url, '')), ''), nullif(btrim(coalesce(p_company_source, '')), ''),
      nullif(btrim(coalesce(p_contact_source, '')), ''), now(), auth.uid()
    )
    returning * into created;
  exception when unique_violation then
    -- Corrida/conflito: recupera o existente REAL pela chave adequada.
    -- (Antes só procurava por NIF/company_id, falhando para registos sem NIF.)
    select * into created from public.prospect_companies
      where organization_id = v_org
        and (
          (v_nif_normalized is not null and nif_normalized = v_nif_normalized)
          or (v_nif_normalized is null and nif_normalized is null and dedup_key = v_dedup_key)
          or (p_company_id is not null and company_id = p_company_id)
        )
      limit 1;
  end;

  perform public.crm_audit('prospect_company_created', 'prospect_company', created.id,
    jsonb_build_object('name', created.name, 'nif', created.nif));

  return created;
end;
$$;

revoke all on function public.prospect_company_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid
) from public;
grant execute on function public.prospect_company_create(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid
) to authenticated;
