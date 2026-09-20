-- ===========================================================================
-- Inscrever um prospect numa campanha de outreach (a partir da ficha).
--
-- Antes: não existia mecanismo para criar outreach_enrollments. O autopilot
-- nunca inscrevia ninguém; tinha de ser feito à mão via SQL. Isto fazia com
-- que os contactos (mesmo confirmados) não chegassem ao autopilot.
--
-- Agora: RPC `outreach_enroll_prospect` cria/reutiliza um enrollment ativo,
-- usando o contacto de email verificado da empresa. Idempotente por
-- (campanha, prospect).
-- ===========================================================================

create or replace function public.outreach_enroll_prospect(
  p_company_id uuid,
  p_campaign_id uuid default null
)
returns public.outreach_enrollments
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.crm_organization_id();
  v_campaign uuid;
  v_prospect public.sales_prospects;
  v_email text;
  v_enrollment public.outreach_enrollments;
begin
  if not public.crm_has_role(array['admin', 'commercial_manager', 'commercial']) then
    raise exception 'CRM access denied';
  end if;

  select * into v_prospect
    from public.sales_prospects
    where company_id = p_company_id and organization_id = v_org
    limit 1;
  if v_prospect.id is null then
    raise exception 'Esta empresa ainda não é um prospect. Assume-a primeiro.';
  end if;

  -- Campanha: a indicada ou a primeira ativa.
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

  -- Contacto de email verificado e ativo da empresa.
  select value into v_email
    from public.company_public_contacts
    where company_id = p_company_id
      and active = true
      and verified = true
      and contact_type like '%_email'
    order by (contact_type = 'commercial_email') desc, confidence desc
    limit 1;
  if v_email is null then
    raise exception 'Confirma um contacto de email antes de enviar para o autopilot.';
  end if;

  -- Cria ou reutiliza o enrollment.
  select * into v_enrollment from public.outreach_enrollments
    where campaign_id = v_campaign and prospect_id = v_prospect.id;

  if v_enrollment.id is null then
    insert into public.outreach_enrollments
      (organization_id, campaign_id, prospect_id, company_id, contact_email, contact_type, status, current_step, next_send_at)
    values
      (v_org, v_campaign, v_prospect.id, p_company_id, v_email, 'commercial_email', 'active', 0, now())
    returning * into v_enrollment;
  else
    -- Reativa se estava terminado/em pausa.
    update public.outreach_enrollments
      set status = 'active', current_step = 0, next_send_at = now(), updated_at = now()
      where id = v_enrollment.id
      returning * into v_enrollment;
  end if;

  return v_enrollment;
end;
$$;

revoke all on function public.outreach_enroll_prospect(uuid, uuid) from public;
grant execute on function public.outreach_enroll_prospect(uuid, uuid) to authenticated;
