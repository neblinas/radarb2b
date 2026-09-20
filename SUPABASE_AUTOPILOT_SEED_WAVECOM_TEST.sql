-- ===========================================================================
-- Adjudata — Autopilot: semear campanha + templates (FASE 1)
-- Criar a base de outbound. NÃO ativa a campanha nem inscreve empresas.
-- Run once in Supabase SQL Editor as project owner.
--
--   * 1 campanha em 'draft' (não ativa — segurança)
--   * 3 templates versionados (1.º contacto + 2 follow-ups)
--   * 3 passos da campanha (delay 0 / 4 / 9 dias)
--   * corrige auto_outreach_enabled -> true
--
-- Idempotente: pode ser corrido mais do que uma vez sem duplicar.
-- ===========================================================================

do $$
declare
  v_org uuid;
  v_campaign uuid;
  t1 uuid;
  t2 uuid;
  t3 uuid;
begin
  -- Organização CRM atual (a tua).
  select id into v_org from public.organizations order by created_at asc limit 1;
  if v_org is null then raise exception 'Nenhuma organização encontrada'; end if;

  -- -------------------------------------------------------------------------
  -- 1. Templates (idempotente por nome+versão)
  -- -------------------------------------------------------------------------
  insert into public.email_templates (organization_id, name, subject, body, version, active)
  values (
    v_org,
    'Autopilot — Primeiro contacto',
    'Uma oportunidade em contratação pública para a {company}',
    E'Bom dia,\n\nChamo-me parte da Equipa Adjudata e contactamo-la porque a {company} (NIF {nif}) tem atividade relevante em contratação pública que gostaríamos de acompanhar mais de perto.\n\nTemos dados concretos sobre o mercado: a vossa empresa registou {participation_12m} participações nos últimos 12 meses, {awards} adjudicações e um valor adjudicado de {value}, com presença em CPVs como {cpv}.\n\nTrabalhamos com empresas que querem encontrar melhores oportunidades de concursos e preparar propostas com mais informação — menos tempo a procurar, mais tempo a ganhar.\n\nEste contacto é feito ao abrigo do interesse legítimo em contexto B2B. Se não quiser receber mais mensagens nossas, pode responder a este email a pedir para sair.\n\nSe fizer sentido, gostaríamos de lhe mostrar como funciona. Pode ver mais em https://adjudata.pt.\n\nCom os melhores cumprimentos,\nEquipa Adjudata',
    1,
    true
  )
  on conflict (organization_id, name, version) do update
    set subject = excluded.subject, body = excluded.body, active = true, updated_at = now()
  returning id into t1;

  if t1 is null then
    select id into t1 from public.email_templates
      where organization_id = v_org and name = 'Autopilot — Primeiro contacto' and version = 1;
  end if;

  insert into public.email_templates (organization_id, name, subject, body, version, active)
  values (
    v_org,
    'Autopilot — Follow-up 1',
    'Re: uma oportunidade em contratação pública para a {company}',
    E'Bom dia,\n\nRetomo o meu contacto anterior sobre as oportunidades em contratação pública para a {company}.\n\nPartilhei alguns dados que podem ser relevantes: {participation_12m} participações nos últimos 12 meses e {awards} adjudicações registadas.\n\nSe quiser, mostro-lhe numa breve conversa como outras empresas estão a usar esta informação. Basta responder a este email.\n\nCom os melhores cumprimentos,\nEquipa Adjudata',
    1,
    true
  )
  on conflict (organization_id, name, version) do update
    set subject = excluded.subject, body = excluded.body, active = true, updated_at = now()
  returning id into t2;

  if t2 is null then
    select id into t2 from public.email_templates
      where organization_id = v_org and name = 'Autopilot — Follow-up 1' and version = 1;
  end if;

  insert into public.email_templates (organization_id, name, subject, body, version, active)
  values (
    v_org,
    'Autopilot — Follow-up 2',
    'Última nota — {company} e contratação pública',
    E'Bom dia,\n\nEscrevo-lhe uma última vez para não ser insistente.\n\nSe o tema da contratação pública for relevante para a {company} agora ou mais à frente, ficamos disponíveis — pode ver mais em https://adjudata.pt ou responder directamente a este email.\n\nSe preferir não receber mais mensagens, é só pedir.\n\nObrigado pelo seu tempo,\nEquipa Adjudata',
    1,
    true
  )
  on conflict (organization_id, name, version) do update
    set subject = excluded.subject, body = excluded.body, active = true, updated_at = now()
  returning id into t3;

  if t3 is null then
    select id into t3 from public.email_templates
      where organization_id = v_org and name = 'Autopilot — Follow-up 2' and version = 1;
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Campanha (draft) — idempotente por nome
  -- -------------------------------------------------------------------------
  select id into v_campaign from public.outreach_campaigns
    where organization_id = v_org and name = 'Prospeção — Contratação Pública (base)';

  if v_campaign is null then
    insert into public.outreach_campaigns
      (organization_id, name, description, status, daily_limit, domain_daily_limit)
    values
      (v_org, 'Prospeção — Contratação Pública (base)',
       'Campanha base de prospeção B2B para empresas com atividade em contratação pública. Revê os textos antes de ativar.',
       'draft', 20, 2)
    returning id into v_campaign;
  end if;

  -- -------------------------------------------------------------------------
  -- 3. Passos da campanha (idempotente por campaign_id+position)
  -- -------------------------------------------------------------------------
  insert into public.outreach_steps (organization_id, campaign_id, position, template_id, delay_days)
  values
    (v_org, v_campaign, 1, t1, 0),
    (v_org, v_campaign, 2, t2, 4),
    (v_org, v_campaign, 3, t3, 9)
  on conflict (campaign_id, position) do update
    set template_id = excluded.template_id, delay_days = excluded.delay_days;

  -- -------------------------------------------------------------------------
  -- 4. Ligar outbound (live com aprovação humana)
  -- -------------------------------------------------------------------------
  insert into public.app_settings (organization_id, key, value)
  values
    (v_org, 'auto_outreach_enabled', 'true'::jsonb),
    (v_org, 'sales_autopilot_enabled', 'true'::jsonb),
    (v_org, 'autopilot_dry_run', 'false'::jsonb),
    (v_org, 'autopilot_require_approval', 'true'::jsonb),
    (v_org, 'autopilot_kill_switch', 'false'::jsonb)
  on conflict (organization_id, key) do update set value = excluded.value;
end $$;

-- ===========================================================================
-- Verificação
-- ===========================================================================
select
  (select count(*) from public.email_templates) as templates,
  (select count(*) from public.outreach_campaigns where status = 'draft') as campanhas_draft,
  (select count(*) from public.outreach_steps) as passos;

select key, value from public.app_settings
where key in ('auto_outreach_enabled','sales_autopilot_enabled','autopilot_dry_run','autopilot_require_approval','autopilot_kill_switch')
order by key;
