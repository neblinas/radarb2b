-- Adjudata — Prospeção B2B: corrige referência ambígua a `company_id` (FASE 12).
--
-- BUG: `prospect_prepare_autopilot_bulk` declara `RETURNS TABLE(... company_id
-- uuid ...)`, pelo que `company_id` é simultaneamente uma variável OUT e uma
-- coluna real de `company_public_contacts`. No `insert into
-- company_public_contacts (company_id, ...) ... on conflict (company_id, ...)`,
-- o PostgreSQL não consegue decidir qual é qual -> "column reference company_id
-- is ambiguous". O bloco de exceção da função apanha o erro e devolve-o como
-- `reason`, pelo que TODAS as empresas preparadas falhavam com esse motivo.
--
-- CORREÇÃO: declarar `#variable_conflict use_column` no início da função, o que
-- resolve a ambiguidade a favor da COLUNA (comportamento pretendido no INSERT) e
-- mantém o contrato de retorno inalterado.
--
-- Idempotente. Assinatura/contrato inalterados. Sem dados inventados.
--
-- Executar no Supabase Studio SQL Editor como project owner (ou `supabase db push`).

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
#variable_conflict use_column
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

revoke all on function public.prospect_prepare_autopilot_bulk(uuid[], uuid) from public;
grant execute on function public.prospect_prepare_autopilot_bulk(uuid[], uuid) to authenticated;
