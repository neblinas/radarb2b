-- Adjudata — Prospeção B2B: contacto por email no import de ficheiros (FASE 8).
--
-- Porquê esta migração:
--   A descoberta externa (FASE 8) importava apenas dados empresariais e nunca
--   transportava o contacto. Com o novo ficheiro de prospetos (CSV/JSON) a
--   incluir uma coluna de contacto, o email fornecido explicitamente pelo
--   administrador deve ser persistido no prospect criado, para ser visível na
--   Gestão de Prospeção.
--
-- Âmbito:
--   * Recria APENAS `external_discovery_persist` com a MESMA assinatura, contrato
--     de retorno e segurança. Passa a ler `email`/`contact_source` do item e a
--     transmiti-los a `prospect_company_create` (que os valida/persiste).
--   * Nenhuma outra função, tabela ou política é tocada.
--
-- Conformidade (Opção A — decisão de produto):
--   * Apenas emails de caixa genérica de empresa entram no import. A exclusão de
--     emails que aparentam ser de pessoa nomeada é feita no MOTOR (TS, função
--     `classifyEmail`) antes da persistência; o backend apenas armazena o que
--     recebe e mantém `contact_source` para rastreabilidade honesta.
--   * Sem dados inventados: o email só é gravado quando a fonte o fornece.
--
-- Executar no Supabase SQL Editor como project owner (ou via `supabase db push`).

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
            -- Novo: email fornecido explicitamente pela fonte/ficheiro.
            p_email => nullif(v_item->>'email', ''),
            p_email_type => nullif(v_item->>'email_type', ''),
            p_company_source => coalesce(nullif(v_item->>'company_source', ''), v_provider),
            p_contact_source => coalesce(nullif(v_item->>'contact_source', ''), 'file_import')
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

revoke all on function public.external_discovery_persist(text, boolean, jsonb, integer, integer, integer, integer, integer, integer, jsonb, jsonb) from public;
grant execute on function public.external_discovery_persist(text, boolean, jsonb, integer, integer, integer, integer, integer, integer, jsonb, jsonb) to authenticated;
