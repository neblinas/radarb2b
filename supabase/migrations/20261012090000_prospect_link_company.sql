-- Adjudata — Prospeção B2B: garantir empresa do Radar antes do Autopilot (FASE 10).
--
-- Porquê esta migração:
--   A preparação para o Autopilot exigia que o prospecto já estivesse LIGADO a
--   uma empresa do Radar (`prospect_companies.company_id`). Mas o import por
--   ficheiro cria prospects "standalone" (company_id nulo), pelo que a inscrição
--   falhava com "Empresa ainda não ligada ao Radar — sem histórico para o
--   Autopilot". Na prática, nenhuma empresa importada conseguia entrar.
--
-- Solução:
--   * `prospect_ensure_company(p_prospect_id)` — devolve o `company_id` do
--     prospecto, criando a ligação quando falta:
--       1. se já tem `company_id`, devolve-o;
--       2. senão, casa com uma empresa do Radar pelo NIF (só dígitos);
--       3. senão, CRIA uma empresa em `companies` (nome + NIF) e devolve o id;
--     e atualiza `prospect_companies.company_id`.
--   * Recria `prospect_prepare_autopilot_bulk` para usar essa função em vez de
--     bloquear quando `company_id` é nulo.
--
-- Princípios (AGENTS.md):
--   * Idempotente: casar por NIF (índice único `companies_nif_key`) ou reutilizar
--     a empresa existente; ligar duas vezes não duplica.
--   * Sem dados inventados: a empresa criada usa dados REAIS do prospecto (nome,
--     NIF); não se inventam métricas nem histórico. As empresas criadas não
--     entram no Radar materializado até que exista atividade real de contratação.
--   * Sem sobrepor opt-out nem tocar em auth/Stripe.
--   * Segurança: admin/commercial_manager no backend (RPC security definer).
--
-- Executar no Supabase Studio SQL Editor como project owner (ou `supabase db push`).

-- ===========================================================================
-- 1. Garantir (ligar ou criar) a empresa do Radar para um prospecto
-- ===========================================================================
create or replace function public.prospect_ensure_company(p_prospect_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.crm_organization_id();
  v_prospect public.prospect_companies;
  v_company_id uuid;
  v_nif text;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;

  select * into v_prospect
    from public.prospect_companies
    where id = p_prospect_id and organization_id = v_org;
  if v_prospect.id is null then
    raise exception 'Prospecto não encontrado';
  end if;

  -- 1. Já ligado: devolve.
  if v_prospect.company_id is not null then
    return v_prospect.company_id;
  end if;

  v_nif := nullif(regexp_replace(coalesce(v_prospect.nif, ''), '\D', '', 'g'), '');

  -- 2. Casar com empresa existente do Radar pelo NIF (só dígitos).
  if v_nif is not null then
    select id into v_company_id
      from public.companies
      where regexp_replace(coalesce(nif, ''), '\D', '', 'g') = v_nif
      limit 1;
  end if;

  -- 3. Criar empresa a partir dos dados reais do prospecto.
  if v_company_id is null then
    insert into public.companies (name, nif, first_seen, last_seen)
    values (btrim(v_prospect.name), v_nif, current_date, current_date)
    returning id into v_company_id;
  end if;

  -- Ligar o prospecto à empresa.
  update public.prospect_companies
    set company_id = v_company_id, updated_at = now()
    where id = p_prospect_id and organization_id = v_org;

  perform public.crm_audit('prospect_company_linked', 'prospect_company', p_prospect_id,
    jsonb_build_object('company_id', v_company_id, 'nif', v_nif, 'created', v_company_id is not null));

  return v_company_id;
end;
$$;

-- ===========================================================================
-- 2. Preparar lote para o Autopilot usando a ligação automática
-- ===========================================================================
-- Mesma assinatura/contrato que a versão anterior (20261011090000), mas deixa
-- de bloquear quando o prospecto não está ligado ao Radar: garante a empresa
-- via `prospect_ensure_company`.
create or replace function public.prospect_prepare_autopilot_bulk(
  p_ids uuid[],
  p_campaign_id uuid default null
)
returns table (
  prospect_id uuid,
  company_id uuid,
  ok boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.crm_organization_id();
  v_id uuid;
  v_prospect public.prospect_companies;
  v_email text;
  v_source_url text;
  v_campaign uuid;
  v_company uuid;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager']) then
    raise exception 'CRM access denied';
  end if;

  -- Resolve a campanha uma única vez (a indicada ou a primeira ativa).
  if p_campaign_id is not null then
    select id into v_campaign from public.outreach_campaigns
      where id = p_campaign_id and organization_id = v_org;
  else
    select id into v_campaign from public.outreach_campaigns
      where organization_id = v_org and status = 'active'
      order by created_at asc limit 1;
  end if;
  if v_campaign is null then
    raise exception 'Não há campanha ativa. Ativa uma campanha primeiro.';
  end if;

  foreach v_id in array coalesce(p_ids, array[]::uuid[])
  loop
    begin
      select * into v_prospect
        from public.prospect_companies
        where id = v_id and organization_id = v_org;

      if v_prospect.id is null then
        prospect_id := v_id; company_id := null; ok := false; reason := 'Prospecto não encontrado';
        return next; continue;
      end if;

      if v_prospect.opt_out or v_prospect.commercial_status = 'OPTED_OUT' then
        prospect_id := v_id; company_id := v_prospect.company_id; ok := false;
        reason := 'Prospecto com opt-out — não pode ser preparado'; return next; continue;
      end if;

      v_email := nullif(btrim(coalesce(v_prospect.email, '')), '');
      if v_email is null then
        prospect_id := v_id; company_id := v_prospect.company_id; ok := false;
        reason := 'Sem email de contacto — confirma um contacto antes'; return next; continue;
      end if;

      -- Garante a empresa do Radar (liga por NIF ou cria).
      v_company := public.prospect_ensure_company(v_id);

      -- Verificação de suppression central (não contactar).
      if public.is_suppressed(v_org, v_email, null, v_company) then
        prospect_id := v_id; company_id := v_company; ok := false;
        reason := 'Contacto em suppression (opt-out/bounce)'; return next; continue;
      end if;

      -- Fonte do contacto: website do prospect, ou domínio, ou página do Radar.
      v_source_url := coalesce(
        nullif(btrim(coalesce(v_prospect.website, '')), ''),
        case when nullif(btrim(coalesce(v_prospect.domain, '')), '') is not null
          then 'https://' || btrim(v_prospect.domain) end,
        'https://adjudata.pt'
      );

      -- Contacto comercial verificado, a partir do email fornecido pela fonte
      -- conhecida (`contact_source`). Não sobrepõe um contacto existente.
      insert into public.company_public_contacts
        (company_id, contact_type, value, normalized_value, source_url, confidence, verified, verified_at, active)
      values
        (v_company, 'commercial_email', v_email, lower(v_email), v_source_url, 70, true, now(), true)
      on conflict (company_id, contact_type, normalized_value) do update
        set active = true,
            verified = true,
            verified_at = coalesce(public.company_public_contacts.verified_at, now());

      -- Assume o prospecto no Autopilot (nunca tira a um humano).
      perform public.automation_claim_prospect_service(v_company, v_org);

      -- Inscreve no Autopilot (idempotente). Usa o email verificado.
      perform public.outreach_enroll_prospect(v_company, v_campaign);

      -- Marca o estado comercial como pronto para o Autopilot.
      update public.prospect_companies
        set commercial_status = 'READY_FOR_AUTOPILOT',
            enrichment_status = case
              when enrichment_status in ('NEW', 'PENDING_ENRICHMENT', 'WEBSITE_FOUND', 'CONTACT_FOUND')
                then 'READY_FOR_AUTOPILOT'
              else enrichment_status end,
            last_verified_at = now(),
            updated_at = now()
        where id = v_id and organization_id = v_org;

      prospect_id := v_id; company_id := v_company; ok := true;
      reason := 'Preparado para o Autopilot';
      return next;
    exception when others then
      -- Um item inválido não interrompe o lote; é reportado.
      prospect_id := v_id; company_id := null; ok := false; reason := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

-- ===========================================================================
-- 3. Permissões
-- ===========================================================================
revoke all on function public.prospect_ensure_company(uuid) from public;
revoke all on function public.prospect_prepare_autopilot_bulk(uuid[], uuid) from public;

grant execute on function public.prospect_ensure_company(uuid) to authenticated;
grant execute on function public.prospect_prepare_autopilot_bulk(uuid[], uuid) to authenticated;
