-- ===========================================================================
-- Adjudata — Autopilot: impedir envios duplicados ao mesmo passo (fix).
-- Run once in Supabase SQL Editor as project owner.
--
-- Porquê esta migração:
--   Deteta-se duplicação de envios no outbound. Duas causas:
--
--   (1) `outreach_enroll_prospect` reativava um enrollment já existente
--       resetando `current_step = 0` incondicionalmente. Se a empresa já
--       tinha recebido o passo 1 e voltava a ser "preparada para o Autopilot"
--       (ex.: clique repetido na UI, reprocessamento do bulk), a sequência
--       recomeçava no passo 1 → NOVO email "Primeiro contacto" para quem já
--       o tinha recebido.
--
--   (2) `outreach_messages` não tinha qualquer restrição única por
--       (enrollment_id, step_position), pelo que a causa (1) — e qualquer
--       reprocessamento concorrente — criava uma segunda mensagem para um
--       passo já enviado.
--
-- Correções:
--   A. Constraint única (enrollment_id, step_position) em outreach_messages,
--      após deduplicar eventuais duplicados existentes.
--   B. `outreach_enroll_prospect` deixa de resetar `current_step`: só
--      reativa o estado, preservando o progresso da sequência.
--   C. O worker passa a tratar o conflito de chave duplicada (23505) como
--      "passo já existe" e a abortar (skip) — robustez em corrida.
--
-- Idempotente e seguro de reexecutar. Nada é enviado por esta migração.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A. Deduplicar mensagens já existentes por (enrollment_id, step_position)
-- ---------------------------------------------------------------------------
-- Mantém a mensagem "mais definitiva": prioriza 'sent' > 'approved' >
-- 'pending_approval' > 'queued' > 'skipped' > 'failed'; em empate, a mais
-- antiga (created_at, depois id) para preservar o token de tracking original.
-- Apaga as restantes (são duplicados do mesmo passo).
with ranked as (
  select
    id,
    row_number() over (
      partition by enrollment_id, step_position
      order by
        case status
          when 'sent' then 0
          when 'approved' then 1
          when 'pending_approval' then 2
          when 'queued' then 3
          when 'skipped' then 4
          when 'failed' then 5
          else 6
        end,
        created_at asc,
        id asc
    ) as rn
  from public.outreach_messages
)
delete from public.outreach_messages m
using ranked r
where m.id = r.id and r.rn > 1;

-- ---------------------------------------------------------------------------
-- B. Constraint única por (enrollment_id, step_position)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'outreach_messages_enrollment_step_key'
      and conrelid = 'public.outreach_messages'::regclass
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_enrollment_step_key
      unique (enrollment_id, step_position);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- C. Reativar sem recomeçar a sequência
-- ---------------------------------------------------------------------------
-- Só se reativa se NÃO houver um envio efetivo (sent) para o enrollment numa
-- fase já avançada. Preserva `current_step`; se o enrollment terminou
-- ('completed'), mantém-no concluído (não reenvia).
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
    -- Reativa SEM recomeçar a sequência.
    --   * 'completed'  → já terminou; mantém concluído (não reenvia). No máximo
    --                    reafirma o contacto atual.
    --   * 'replied'    → o prospect respondeu; não reabrir automaticamente.
    --   * outros       → reativa preservando current_step; reagenda já.
    if v_enrollment.status = 'completed' then
      update public.outreach_enrollments
        set contact_email = v_email, updated_at = now()
        where id = v_enrollment.id
        returning * into v_enrollment;
    elsif v_enrollment.status = 'replied' then
      update public.outreach_enrollments
        set contact_email = v_email, updated_at = now()
        where id = v_enrollment.id
        returning * into v_enrollment;
    else
      update public.outreach_enrollments
        set status = 'active',
            contact_email = v_email,
            next_send_at = now(),
            updated_at = now()
        where id = v_enrollment.id
        returning * into v_enrollment;
    end if;
  end if;

  return v_enrollment;
end;
$$;

revoke all on function public.outreach_enroll_prospect(uuid, uuid) from public;
grant execute on function public.outreach_enroll_prospect(uuid, uuid) to authenticated;
