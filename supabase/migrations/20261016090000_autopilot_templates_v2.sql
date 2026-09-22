-- ===========================================================================
-- Adjudata — Autopilot: templates de outreach v2 (copy mais cativante).
-- Run once in Supabase SQL Editor as project owner.
--
-- Substitui o copy dos 3 emails da sequência base (1.º contacto + 2 follow-ups)
-- por versões mais cativantes. Mantém:
--   * todas as variáveis reais: {company}, {nif}, {participation_12m},
--     {awards}, {value}, {cpv} (nunca inventa dados);
--   * a base de conformidade (interesse legítimo B2B + direito de saída).
--
-- Estratégia de versionamento: cria os templates como version = 2 (não destrói
-- o histórico da version = 1) e reaponta os passos da campanha para os novos
-- template_ids. Idempotente: pode ser corrido mais do que uma vez.
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
  -- 1. Template 1 — Primeiro contacto (version 2)
  -- -------------------------------------------------------------------------
  insert into public.email_templates (organization_id, name, subject, body, version, active)
  values (
    v_org,
    'Autopilot — Primeiro contacto',
    '{company}, estão a passar-lhe à frente em concursos?',
    E'Bom dia,\n\nSei que recebe muitos emails. Este é curto e só lhe faz sentido se a {company} participa em concursos públicos.\n\nFui ver os dados do mercado e a vossa empresa tem atividade concreta: {participation_12m} participações nos últimos 12 meses, {awards} adjudicações e {value} em valor adjudicado, com presença em áreas como {cpv}.\n\nA pergunta incómoda é esta: quantas dessas oportunidades chegaram à mesa da {company} a tempo, com toda a informação reunida? A maior parte das empresas perde concursos não por falta de capacidade, mas por descobrir tarde ou por não conhecer bem quem compra e quem ganha.\n\nÉ exatamente isso que resolvemos. A Adjudata reúne os dados públicos de contratação (BASE) num só lugar: encontra oportunidades, mostra quem compra e quem ganha, e avisa-o antes de o prazo apertar. Menos tempo a procurar, mais tempo a ganhar.\n\nVale 15 minutos do seu tempo? Responda a este email com um simples "sim" e mostro-lhe ao vivo, aplicado à {company}.\n\nCom os melhores cumprimentos,\nEquipa Adjudata\n\nPode ver mais em https://adjudata.pt\n\n(Contacto ao abrigo do interesse legítimo em contexto B2B. Se não quiser receber mais mensagens nossas, responda a este email a pedir para sair.)'
    1,
    2,
    true
  )
  on conflict (organization_id, name, version) do update
    set subject = excluded.subject, body = excluded.body, active = true, updated_at = now()
  returning id into t1;

  if t1 is null then
    select id into t1 from public.email_templates
      where organization_id = v_org and name = 'Autopilot — Primeiro contacto' and version = 2;
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Template 2 — Follow-up 1 (version 2)
  -- -------------------------------------------------------------------------
  insert into public.email_templates (organization_id, name, subject, body, version, active)
  values (
    v_org,
    'Autopilot — Follow-up 1',
    'Re: {company} — o dado que mudou a conversa',
    E'Bom dia,\n\nRetomo o contacto que lhe fiz há uns dias — sei que a caixa de entrada de quem trabalha em contratação pública é implacável.\n\nDeixo só um dado concreto para não perder o seu tempo: nos últimos 12 meses, a {company} somou {participation_12m} participações e {awards} adjudicações. Boa parte das empresas com este perfil não sabe quantas oportunidades relevantes deixou passar por não as ver a tempo.\n\nO que fazemos é simples: damos-lhe essa visibilidade antes dos outros. As empresas que usam a Adjudata chegam às oportunidades mais cedo e entram na conversa com o comprador com contexto que a concorrência não tem.\n\nPodemos ver, em 15 minutos, o que isto valeria para a {company}? Basta responder "pode ser" e combinamos.\n\nCom os melhores cumprimentos,\nEquipa Adjudata\n\n(Se preferir não receber mais mensagens, é só responder a pedir para sair.)'
    1,
    2,
    true
  )
  on conflict (organization_id, name, version) do update
    set subject = excluded.subject, body = excluded.body, active = true, updated_at = now()
  returning id into t2;

  if t2 is null then
    select id into t2 from public.email_templates
      where organization_id = v_org and name = 'Autopilot — Follow-up 1' and version = 2;
  end if;

  -- -------------------------------------------------------------------------
  -- 3. Template 3 — Follow-up 2 (version 2) — fecho, deixa a porta aberta
  -- -------------------------------------------------------------------------
  insert into public.email_templates (organization_id, name, subject, body, version, active)
  values (
    v_org,
    'Autopilot — Follow-up 2',
    'Fecho o assunto, {company}?',
    E'Bom dia,\n\nNão quero ser mais um a encher-lhe a caixa. Este é o meu último email sobre o tema — prometo.\n\nSó deixo isto registado: a {company} tem atividade real em contratação pública ({participation_12m} participações e {awards} adjudicações nos últimos 12 meses). Esse trabalho merece chegar às oportunidades certas a tempo, e é isso que a Adjudata ajuda a fazer.\n\nSe não for o momento, sem problema nenhum — a porta fica aberta. Se em qualquer altura quiser ver como funciona, responda a este email ou visite https://adjudata.pt e começa grátis, sem compromisso.\n\nObrigado pelo seu tempo e bom trabalho.\n\nCom os melhores cumprimentos,\nEquipa Adjudata\n\n(Se preferir não receber mais mensagens nossas, responda a pedir para sair.)'
    1,
    2,
    true
  )
  on conflict (organization_id, name, version) do update
    set subject = excluded.subject, body = excluded.body, active = true, updated_at = now()
  returning id into t3;

  if t3 is null then
    select id into t3 from public.email_templates
      where organization_id = v_org and name = 'Autopilot — Follow-up 2' and version = 2;
  end if;

  -- -------------------------------------------------------------------------
  -- 4. Reapontar os passos da campanha para os novos templates
  -- -------------------------------------------------------------------------
  select id into v_campaign from public.outreach_campaigns
    where organization_id = v_org and name = 'Prospeção — Contratação Pública (base)';

  if v_campaign is not null then
    update public.outreach_steps set template_id = t1 where campaign_id = v_campaign and position = 1;
    update public.outreach_steps set template_id = t2 where campaign_id = v_campaign and position = 2;
    update public.outreach_steps set template_id = t3 where campaign_id = v_campaign and position = 3;
  end if;
end $$;

-- ===========================================================================
-- Verificação
-- ===========================================================================
select
  (select count(*) from public.email_templates where version = 2) as templates_v2,
  (select count(*) from public.outreach_steps s
     join public.email_templates t on t.id = s.template_id
     where t.version = 2) as passos_apontam_v2;
