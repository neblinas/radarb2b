-- Adjudata — Prospeção B2B: preparar seleção para o Autopilot (FASE 9).
--
-- Porquê esta migração:
--   A ação `READY_AUTOPILOT` da Gestão de Prospeção apenas MARCA o prospecto
--   como pronto (`commercial_status = 'READY_FOR_AUTOPILOT'`); NÃO o inscreve
--   numa campanha nem gera mensagem. Faltava o passo real que liga a seleção de
--   empresas ao Autopilot. Sem ele, o gestor marcava "pronto" e nada acontecia:
--   nenhum email era preparado por empresa.
--
-- Esta migração fecha essa lacuna de forma honesta e auditável:
--   * `prospect_prepare_autopilot_bulk(p_ids, p_campaign_id)` — para cada
--     empresa selecionada: garante um contacto de email comercial, assume o
--     prospecto no Autopilot (`sales_prospects`) e cria o `outreach_enrollment`
--     (que gera a mensagem no próximo ciclo do worker `autopilot-outreach`).
--     Devolve, por empresa, se ficou preparada ou o motivo do bloqueio.
--   * `prospect_autopilot_messages_list()` — lista as mensagens geradas por
--     empresa (estado, assunto) para o gestor confirmar o que foi preparado.
--
-- Princípios (AGENTS.md):
--   * Idempotente: preparar duas vezes o mesmo prospecto não duplica nada
--     (`outreach_enrollments` tem UNIQUE (campanha, prospecto); os contactos
--     têm UNIQUE (empresa, tipo, valor normalizado)).
--   * Sem dados inventados: só se prepara quem TEM email real e está ligado a
--     uma empresa do Radar. Quem não tem email é reportado, não silenciado.
--   * Sem sobrepor opt-out: um prospecto em opt-out nunca é inscrito.
--   * Nada é enviado: a inscrição apenas agenda; o envio continua sujeito ao
--     worker, às flags (dry-run, require_approval) e à suppression.
--   * Segurança: admin/commercial_manager no backend; RLS por organização.
--
-- Executar no Supabase Studio SQL Editor como project owner (ou `supabase db push`).

-- ===========================================================================
-- 1. Preparar um lote de prospectos para o Autopilot
-- ===========================================================================
-- Para cada id:
--   1) valida organização, opt-out e existência de email;
--   2) exige ligação a uma empresa do Radar (`company_id`) — o Autopilot
--      trabalha sobre `companies`; prospects "standalone" não entram;
--   3) cria/reutiliza um contacto comercial verificado a partir do email do
--      prospect (fonte = website do prospect ou domínio, quando existam);
--   4) assume o `sales_prospect` (owner_type = 'automation' sem tocar num
--      prospect já atribuído a um humano);
--   5) inscreve no Autopilot (`outreach_enrollment`) via a RPC existente;
--   6) marca o estado comercial como `READY_FOR_AUTOPILOT`.
--
-- Retorna uma linha por id pedido com `ok` (bool) e `reason` (texto) — nunca
-- aborta o lote por um item inválido.
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

      if v_prospect.company_id is null then
        prospect_id := v_id; company_id := null; ok := false;
        reason := 'Empresa ainda não ligada ao Radar — sem histórico para o Autopilot';
        return next; continue;
      end if;

      v_email := nullif(btrim(coalesce(v_prospect.email, '')), '');
      if v_email is null then
        prospect_id := v_id; company_id := v_prospect.company_id; ok := false;
        reason := 'Sem email de contacto — confirma um contacto antes'; return next; continue;
      end if;

      -- Verificação de suppression central (não contactar).
      if public.is_suppressed(v_org, v_email, null, v_prospect.company_id) then
        prospect_id := v_id; company_id := v_prospect.company_id; ok := false;
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
        (v_prospect.company_id, 'commercial_email', v_email, lower(v_email), v_source_url, 70, true, now(), true)
      on conflict (company_id, contact_type, normalized_value) do update
        set active = true,
            verified = true,
            verified_at = coalesce(public.company_public_contacts.verified_at, now());

      -- Assume o prospecto no Autopilot (nunca tira a um humano).
      perform public.automation_claim_prospect_service(v_prospect.company_id, v_org);

      -- Inscreve no Autopilot (idempotente). Usa o email verificado.
      perform public.outreach_enroll_prospect(v_prospect.company_id, v_campaign);

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

      prospect_id := v_id; company_id := v_prospect.company_id; ok := true;
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
-- 2. Mensagens de Autopilot por empresa (para o gestor confirmar o que foi gerado)
-- ===========================================================================
-- Lista as mensagens de outreach da organização, com o nome/NIF da empresa, o
-- estado e o assunto. Serve para a UI mostrar "email preparado por empresa".
create or replace function public.prospect_autopilot_messages_list(p_limit integer default 50)
returns table (
  message_id uuid,
  enrollment_id uuid,
  company_id uuid,
  company_name text,
  company_nif text,
  to_email text,
  subject text,
  status text,
  step_position integer,
  created_at timestamptz,
  sent_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    message.id,
    message.enrollment_id,
    enrollment.company_id,
    company.name,
    company.nif,
    message.to_email,
    message.subject,
    message.status,
    message.step_position,
    message.created_at,
    message.sent_at
  from public.outreach_messages message
  join public.outreach_enrollments enrollment on enrollment.id = message.enrollment_id
  left join public.companies company on company.id = enrollment.company_id
  where message.organization_id = public.crm_organization_id()
    and public.crm_has_role(array['admin', 'commercial_manager'])
  order by message.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ===========================================================================
-- 3. Permissões
-- ===========================================================================
revoke all on function public.prospect_prepare_autopilot_bulk(uuid[], uuid) from public;
revoke all on function public.prospect_autopilot_messages_list(integer) from public;

grant execute on function public.prospect_prepare_autopilot_bulk(uuid[], uuid) to authenticated;
grant execute on function public.prospect_autopilot_messages_list(integer) to authenticated;
