// Conteúdo do Manual do Comercial — Adjudata.
// Gerado a partir do "PROMPT_MANUAL_COMERCIAL.md" e revisto.
// Estrutura em dados para permitir índice, acordeões de FAQ e tabelas.

export const MANUAL_VERSION = "1.0";
export const MANUAL_DATE = "19 de setembro de 2026";

export type TermRow = { term: string; meaning: string };

export type Section = {
  id: string;
  number: number;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  steps?: string[];
  table?: { headers: string[]; rows: TermRow[] };
  extra?: { type: "table"; headers: string[]; rows: string[][] };
  callout?: { tone: "warning" | "info"; text: string };
  summary: string;
  pitfalls?: string[];
};

export const sections: Section[] = [
  {
    id: "bem-vindo",
    number: 1,
    title: "Bem-vindo ao Adjudata",
    paragraphs: [
      "O Adjudata (adjudata.pt) é uma plataforma de inteligência comercial para o mercado da contratação pública portuguesa. A partir de dados públicos (BASE — a base de dados dos contratos públicos em Portugal), o Adjudata ajuda empresas a encontrar oportunidades de negócio com o Estado e a acompanhá-las ao longo do tempo: procedimentos concursais, entidades compradoras, concorrência, valores e padrões de mercado.",
      "O Adjudata vende-se através de planos de subscrição (Free, Starter, Pro) à app principal, e conta com um programa de comissões para comerciais independentes — és tu quem leva o produto ao mercado.",
      "O teu papel como comercial resume-se a três frentes, todas geridas a partir do back-office:",
    ],
    bullets: [
      "**Encontrar oportunidades de negócio** — através da fila de prospeção, que já te traz empresas com atividade real em contratação pública, ordenadas por potencial (score).",
      "**Contactar e converter** — usando o correio comercial integrado, o registo de atividades e o acompanhamento de leads.",
      "**Gerir a tua carteira e os teus ganhos** — consultando os teus clientes atribuídos e as tuas comissões diretamente no back-office.",
    ],
    summary:
      "O Adjudata é uma ferramenta de dados sobre contratação pública; o back-office comercial é a tua ferramenta de trabalho diário para prospetar, vender e acompanhar ganhos — tudo num só sítio.",
  },
  {
    id: "primeiros-passos",
    number: 2,
    title: "Primeiros passos",
    paragraphs: [
      "**Como acedes.** O acesso dos comerciais faz-se em /acesso-comercial, com o teu email profissional e palavra-passe. As credenciais são criadas quando a organização te convida como colaborador — não há registo público para comerciais.",
      "Duas páginas públicas que vale a pena conheceres, para partilhar com candidatos ou consultar tu próprio:",
    ],
    bullets: [
      "**/programa-comercial** — condições e comissões do programa comercial, em versão pública.",
      "**/recrutamento** — como um novo comercial se pode candidatar.",
    ],
    steps: [
      "Faz login em /acesso-comercial.",
      "Vai a Os meus dados (/perfil) e confirma nome e telefone.",
      "Abre Os meus emails (/backoffice/emails) → separador Assinatura e preenche o teu nome a apresentar (e, se quiseres, um contacto de seguimento).",
      "Vai a Pesquisar empresas / Prospecção (/backoffice/prospeccao) e explora a fila de prospects disponíveis.",
      "Abre a ficha de um prospect com score alto e lê os indicadores explicáveis.",
      "Experimenta Assumir um prospect (isto atribui-o a ti).",
      "Confirma o website do prospect e procura contactos públicos.",
      "Se houver um contacto de email confirmado, experimenta abrir o compositor (não precisas de enviar já).",
      "Consulta Ganhos da equipa (/backoffice/comissoes) para veres o formato em que os teus ganhos vão aparecer.",
      "Lê a secção 7 deste manual (Comunicar com clientes e prospects) antes do teu primeiro contacto real.",
    ],
    summary:
      "O acesso é sempre por /acesso-comercial; o ponto de partida diário é a Visão geral; antes do primeiro contacto, garante que a tua assinatura de email está preenchida.",
  },
  {
    id: "conceitos",
    number: 3,
    title: "Conceitos essenciais",
    paragraphs: [
      "Glossário rápido para quem está a começar — usa como referência sempre que apareça um termo que não reconheças.",
    ],
    table: {
      headers: ["Termo", "O que significa"],
      rows: [
        { term: "Procedimento", meaning: "Um concurso ou processo de contratação pública publicado no BASE (ex.: concurso público, ajuste direto, consulta prévia)." },
        { term: "BASE", meaning: "A base de dados oficial portuguesa de contratos públicos — a fonte de dados do Adjudata." },
        { term: "CPV", meaning: "Vocabulário Comum para os Contratos Públicos — código europeu que classifica o objeto de um contrato (ex.: obras, serviços de TI, equipamento médico)." },
        { term: "NIF", meaning: "Número de Identificação Fiscal — identifica empresas e entidades nos procedimentos." },
        { term: "Score", meaning: "Pontuação de 0 a 100 atribuída a um prospect, que estima o seu potencial como cliente com base na atividade real em contratação pública." },
        { term: "Prospect", meaning: "Uma empresa identificada pelo Adjudata como potencial cliente, ainda não convertida." },
        { term: "Lead", meaning: "Um contacto comercial em progresso, com estado próprio no pipeline (ver secção 11)." },
        { term: "Comissão", meaning: "O valor que ganhas por uma venda ou renovação, de acordo com as regras do programa comercial." },
        { term: "Plano", meaning: "A subscrição que o cliente compra no Adjudata (Free, Starter ou Pro)." },
        { term: "Pool disponível", meaning: "Conjunto de prospects que ainda não foram assumidos por nenhum comercial." },
        { term: "Assumir", meaning: "Ação de atribuíres um prospect a ti próprio, retirando-o do pool disponível." },
        { term: "Venda direta", meaning: "Venda feita diretamente por ti a um cliente novo (distingue-se de comissões de equipa)." },
        { term: "Comissão de equipa", meaning: "Comissão que ganhas quando um colaborador que recrutaste ou geres realiza uma venda." },
      ],
    },
    summary:
      "Se encontrares uma sigla ou termo que não reconheces em qualquer parte deste manual, é muito provável que esteja aqui ou na secção 18 (Glossário final).",
  },
  {
    id: "papeis",
    number: 4,
    title: "Os teus papéis e permissões",
    paragraphs: [
      "O teu acesso ao back-office depende do papel (role) que te foi atribuído. Os papéis são definidos no backend pela organização — não os podes alterar tu próprio.",
    ],
    extra: {
      type: "table",
      headers: ["Papel", "O que pode fazer", "O que NÃO pode fazer"],
      rows: [
        ["admin", "Acesso total às operações comerciais e à configuração de colaboradores; gere planos, preços e roles.", "— (acesso total)"],
        ["commercial_manager (gestor comercial)", "Gere clientes, oportunidades e colaboradores comerciais dentro da organização; acede a Gestão de comissões para atribuir, aprovar, pagar ou cancelar.", "Não configura definições globais da plataforma reservadas ao admin."],
        ["commercial (comercial)", "Consulta clientes autorizados, gere as oportunidades que lhe estão atribuídas, os seus próprios ganhos e os seus próprios emails; prospeta, assume prospects, envia emails, regista atividades.", "Sem acesso a planos, preços, roles ou configuração; não vê comissões de outros comerciais; não atribui clientes a terceiros."],
      ],
    },
    summary:
      "O teu papel determina o que vês no menu lateral — se sentires que falta alguma opção que precisas, confirma com o teu gestor comercial se é uma questão de permissão antes de abrir um ticket.",
    pitfalls: [
      "Não partilhes o teu login com colegas para «verem o que falta» — cada papel existe por uma razão e todas as ações ficam registadas (ver secção 15, Boas práticas).",
    ],
  },
  {
    id: "navegacao",
    number: 5,
    title: "Navegação e mapa do back-office",
    paragraphs: [
      "Tabela de referência com todos os itens do menu lateral do back-office.",
    ],
    extra: {
      type: "table",
      headers: ["#", "Menu", "Caminho", "O que faz"],
      rows: [
        ["1", "Visão geral", "/backoffice", "Painel inicial com atalhos para contas, planos, verificação e domínios."],
        ["2", "Os meus dados", "/perfil", "Editar nome, telefone e email próprio (alterar email exige confirmação por correio)."],
        ["3", "Clientes e colaboradores", "/backoffice/contas", "Lista de contas/perfis; abre a ficha individual."],
        ["4", "Novo colaborador", "/backoffice/colaboradores/novo", "Convidar um colaborador (admin/gestor)."],
        ["5", "Planos e utilização", "/backoffice/planos", "Subscrições e quotas dos clientes."],
        ["6", "Ganhos da equipa", "/backoffice/comissoes", "Consultas os teus ganhos (comissões)."],
        ["7", "Os meus clientes", "/backoffice/clientes", "Clientes atribuídos a ti e comissões associadas; botão para enviar email ao cliente."],
        ["8", "Gestão de comissões", "/backoffice/comissoes/gestao", "Admin/gestor: atribuir clientes a comerciais, aprovar, marcar como paga ou cancelar comissões."],
        ["9", "Oportunidades", "/backoffice/oportunidades", "Pipeline de oportunidades — módulo em preparação."],
        ["10", "Leads comerciais", "/backoffice/leads", "Pipeline de leads: criar, pesquisar, filtrar por estado, abrir ficha de detalhe."],
        ["11", "Pesquisar empresas / Prospecção", "/backoffice/prospeccao", "Fila de empresas com score de potencial, filtros e ficha de prospect."],
        ["12", "Dashboard de prospeção", "/backoffice/prospeccao/dashboard", "Métricas de prospeção, âmbito Equipa vs. Só as minhas."],
        ["13", "Os meus emails", "/backoffice/emails", "Correio comercial — enviar emails, ver histórico, editar assinatura."],
        ["14", "Tickets de suporte", "/backoffice/tickets", "Triagem e acompanhamento de pedidos de suporte."],
        ["15", "Atividade", "/backoffice/atividade", "Auditoria — módulo em preparação."],
      ],
    },
    callout: {
      tone: "info",
      text: "Sobre os módulos em preparação (Oportunidades e Atividade): ainda não estão disponíveis para uso. Entretanto, regista oportunidades em Leads comerciais e trata qualquer necessidade de auditoria através de um ticket em Tickets de suporte.",
    },
    summary:
      "Memoriza sobretudo cinco menus — Prospecção, Leads, Os meus emails, Os meus clientes e Ganhos da equipa — porque é onde passas a maior parte do tempo.",
  },
  {
    id: "prospeccao",
    number: 6,
    title: "Prospeção passo a passo",
    paragraphs: [
      "Este é o fluxo principal de trabalho de um comercial, do zero até ao primeiro contacto.",
    ],
    steps: [
      "Abre Pesquisar empresas / Prospecção (/backoffice/prospeccao). Vês uma fila de empresas com score de potencial de 0 a 100.",
      "Filtra por pesquisa (nome/NIF), score mínimo, estado, ramo de atividade e atribuição, para focares no que faz sentido para ti.",
      "Escolhe um prospect com score alto (idealmente «Quente» ou «Muito quente») e abre a ficha (/backoffice/prospeccao/[companyId]).",
      "Lê os indicadores explicáveis — «Porque é um bom prospect»: atividade recente, frequência, valor adjudicado, concorrência, diversidade CPV e recência — e as métricas (participações, últimos 12 meses, adjudicações, valor adjudicado).",
      "Clica em Assumir para atribuíres o prospect a ti. A partir daqui, deixa de estar disponível para outros comerciais.",
      "Confirma o website público da empresa (há um campo de URL de confirmação).",
      "Procura contactos públicos institucionais — o sistema tenta encontrá-los automaticamente a partir do website confirmado.",
      "Confirma (ou remove) cada contacto encontrado. Só os contactos de email confirmados desbloqueiam o botão «Enviar email», que abre o compositor já pré-preenchido.",
      "Regista uma atividade sempre que fizeres uma chamada, envies um email ou tenhas uma reunião — mantém o histórico atualizado.",
      "Define a próxima ação (data e hora) — é o que te lembra de dar seguimento e o que alimenta as métricas do dashboard (secção 12).",
      "Ao longo do processo, atualiza o estado do prospect/lead conforme avanças (ver os estados na secção 11).",
    ],
    summary:
      "O fluxo é sempre Assumir → Confirmar website → Procurar contactos → Confirmar contacto → Contactar (email/chamada) → Registar atividade → Definir próxima ação.",
    pitfalls: [
      "Assumir muitos prospects de uma vez sem capacidade para lhes dar seguimento — um prospect só pertence a um comercial de cada vez, por isso estás a «bloquear» oportunidades para a equipa.",
      "Contactar uma empresa através de um canal que não seja um contacto público confirmado na plataforma.",
      "Esquecer de definir a próxima ação — é isso que evita que um prospect fique esquecido.",
    ],
  },
  {
    id: "email",
    number: 7,
    title: "Comunicar com clientes e prospects (email)",
    paragraphs: [
      "O correio comercial é a forma oficial de contactares clientes e prospects por email a partir do Adjudata. Está em Os meus emails (/backoffice/emails).",
      "**Como funciona o envio.** Remetente único: todos os emails saem de comercial@adjudata.pt, em nome do Adjudata — não é um endereço individual por comercial. A tua individualidade está na assinatura, não no endereço de envio. A assinatura é acrescentada automaticamente a todos os emails e inclui: o teu nome a apresentar, um contacto opcional (email), o domínio adjudata.pt e a nota de rodapé «Por favor não responda a este e-mail.»",
      "**Os três separadores de /backoffice/emails:**",
    ],
    extra: {
      type: "table",
      headers: ["Separador", "Para que serve"],
      rows: [
        ["Novo email", "Campos: Para, CC (opcional), Assunto, Mensagem. Mostra uma pré-visualização da assinatura. Botão «Enviar email»."],
        ["Caixa de saída", "Histórico dos emails enviados: Para, Assunto, Estado, Data. Clicas para abrir o email renderizado. Estados possíveis: Em fila, Enviado, Falhou."],
        ["Assinatura", "Editas o Nome a apresentar, o Contacto (opcional) e a Nota de rodapé. Depois clicas em Guardar."],
      ],
    },
    bullets: [
      "**Atalho 1:** a partir de um contacto confirmado na ficha de um prospect.",
      "**Atalho 2:** a partir do botão Email na lista Os meus clientes.",
    ],
    callout: {
      tone: "warning",
      text: "Não existe caixa de entrada. As respostas enviadas para comercial@adjudata.pt não são recebidas na plataforma. É por isso que todos os emails incluem a nota «não responda». O seguimento das respostas é feito por ti, pelos teus próprios canais (o teu email e telefone habituais) — não pela plataforma. Se preencheres o campo Contacto na tua assinatura, é esse o contacto que o destinatário deve usar para te responder.",
    },
    summary:
      "Envias sempre de comercial@adjudata.pt, mas és tu quem fica identificado na assinatura; guarda o histórico na Caixa de saída e faz o seguimento das respostas pelos teus próprios canais.",
    pitfalls: [
      "Não incluir um contacto de seguimento na assinatura (o destinatário fica sem forma de te responder).",
      "Presumir que uma falta de resposta na Caixa de saída significa que o email não chegou — confirma sempre o estado (Enviado vs. Falhou).",
    ],
  },
  {
    id: "clientes",
    number: 8,
    title: "Os meus clientes",
    paragraphs: [
      "Em Os meus clientes (/backoffice/clientes) vês a lista de clientes que te estão atribuídos, juntamente com as comissões associadas a cada um.",
    ],
    bullets: [
      "Cada linha mostra o cliente e o estado da(s) comissão(ões) ligada(s) a ele.",
      "O botão Email abre o compositor de correio comercial já pré-preenchido para esse cliente (ver secção 7).",
      "É a partir daqui que acompanhas a tua carteira ativa, não apenas os prospects que ainda estás a trabalhar.",
    ],
    summary:
      "Os meus clientes é a tua carteira convertida; Pesquisar empresas / Prospecção é onde ainda estás a construir essa carteira.",
  },
  {
    id: "comissoes",
    number: 9,
    title: "Ganhos e comissões",
    paragraphs: [
      "Consultas os teus ganhos em Ganhos da equipa (/backoffice/comissoes). As regras do programa comercial são as seguintes:",
    ],
    extra: {
      type: "table",
      headers: ["Regra", "Percentagem"],
      rows: [
        ["1.ª mensalidade de venda direta (assinatura mensal)", "100% do valor de uma mensalidade"],
        ["Mensalidades seguintes (venda direta)", "10%"],
        ["Subscrição anual (venda direta)", "20%"],
        ["Bónus de retenção", "3%"],
        ["Equipa — 2.ª mensalidade", "50%"],
        ["Equipa — anual", "5%"],
        ["Recrutamento (recruiter)", "5%"],
      ],
    },
    bullets: [
      "Existem também níveis (por exemplo, nível 2) aplicáveis a comissões de equipa, consoante a estrutura da tua organização.",
      "**Venda direta mensal:** vendes o plano Starter (29 €/mês) a um cliente novo. Na 1.ª mensalidade ganhas 100% de 29 € = 29 €. Na 2.ª mensalidade em diante, ganhas 10% de 29 € = 2,90 €/mês, enquanto o cliente se mantiver ativo.",
      "**Venda direta anual:** vendes o plano Pro anual (690 €/ano). Ganhas 20% de 690 € = 138 €.",
      "**Bónus de retenção:** um cliente teu mantém-se ativo além de um determinado período — ganhas um bónus adicional de 3% sobre o valor relevante.",
      "**Comissão de equipa (2.ª mensalidade):** um colaborador que geres vende o plano Starter (29 €/mês) e o cliente paga a 2.ª mensalidade — ganhas 50% de 29 € = 14,50 €.",
      "**Comissão de equipa (anual):** o mesmo colaborador vende uma subscrição anual de 690 € — ganhas 5% de 690 € = 34,50 €.",
      "**Recrutamento:** recrutaste um novo comercial que fecha uma venda — ganhas 5% sobre essa venda, como comissão de recrutador.",
      "**Estados da comissão:** Pendente (registada, ainda não validada), Aprovada (validada pelo gestor/admin, aguarda pagamento), Paga (já recebeste), Cancelada (não vai ser paga).",
    ],
    summary:
      "A tua comissão depende do tipo de venda (direta ou de equipa), da periodicidade (mensal ou anual) e do estado em que se encontra — acompanha tudo em Ganhos da equipa.",
    pitfalls: [
      "Presumir que uma comissão «Pendente» já está garantida — só está confirmada quando passa a Aprovada e paga quando chega a Paga.",
    ],
  },
  {
    id: "gestao-comissoes",
    number: 10,
    title: "Gestão de comissões (admin/gestor)",
    paragraphs: [
      "Esta secção aplica-se a quem tem papel de admin ou commercial_manager. Em Gestão de comissões (/backoffice/comissoes/gestao):",
    ],
    bullets: [
      "Atribuis clientes a comerciais específicos.",
      "Aprovas comissões que estão em estado Pendente.",
      "Marcas como paga uma comissão já aprovada e efetivamente liquidada.",
      "Cancelas uma comissão que não deva ser paga (por exemplo, por incumprimento das condições do programa comercial).",
      "Um comercial comum não tem acesso a este menu — só vê os seus próprios ganhos em Ganhos da equipa.",
    ],
    summary:
      "A Gestão de comissões é o «back-office do back-office» das comissões — só admin e gestor comercial mexem aqui; o comercial apenas consulta os seus próprios ganhos.",
  },
  {
    id: "leads",
    number: 11,
    title: "Leads e pipeline",
    paragraphs: [
      "Em Leads comerciais (/backoffice/leads) geres o teu pipeline de contactos em curso:",
    ],
    bullets: [
      "Criar um novo lead.",
      "Pesquisar e filtrar por estado.",
      "Abrir a ficha de detalhe de um lead (/backoffice/leads/[id]) para veres o histórico completo.",
      "**Estados do lead/prospect:** Novo → Em pesquisa → Pronto para contacto → Contactado → Follow-up → Respondeu → Demonstração → Trial → Negociação → Cliente (Won) ou Perdido → (ou, em qualquer altura) Não contactar / Inativo.",
      "Usa estes estados de forma disciplinada: são eles que alimentam as métricas do teu dashboard (secção 12) e que ajudam o teu gestor comercial a perceber onde precisas de apoio.",
    ],
    summary:
      "Todo o prospect que assumes na prospeção acaba por transitar para um lead no pipeline — é aqui que acompanhas o progresso até «Cliente (Won)».",
  },
  {
    id: "dashboard",
    number: 12,
    title: "Dashboard de prospeção",
    paragraphs: [
      "O Dashboard de prospeção (/backoffice/prospeccao/dashboard) dá-te uma visão de conjunto do teu trabalho:",
    ],
    bullets: [
      "**Métricas:** prospects assumidos, disponíveis, ações vencidas, atividades nos últimos 30 dias, ganhos, perdidos.",
      "**Âmbito:** podes alternar entre Equipa e Só as minhas, consoante o teu papel.",
      "**Prospects mais quentes:** os que têm score mais alto entre os que estão atribuídos.",
      "**Próximas ações:** o que tens agendado, para não perderes prazos.",
      "Usa este painel no início do dia para decidires por onde começar — sobretudo a secção de ações vencidas, que são contactos que já deverias ter feito.",
    ],
    summary:
      "O dashboard é o teu «centro de comando» diário — começa aqui antes de ires diretamente para a fila de prospeção.",
  },
  {
    id: "suporte",
    number: 13,
    title: "Suporte e tickets",
    paragraphs: [
      "Sempre que precisares de ajuda que este manual não resolva, abre um pedido em Tickets de suporte (/backoffice/tickets). É aqui que:",
    ],
    bullets: [
      "Reportas um problema técnico (ex.: um email que ficou preso em «Em fila»).",
      "Pedes esclarecimentos sobre uma comissão que não reconheces.",
      "Sinalizas um erro na atribuição de um prospect ou cliente.",
      "Acompanha o estado do teu ticket na mesma página — evita abrir vários tickets para o mesmo assunto.",
    ],
    summary:
      "Usa os tickets para tudo o que não consigas resolver sozinho depois de leres este manual, especialmente questões de conta, comissões ou erros técnicos.",
  },
  {
    id: "planos",
    number: 14,
    title: "Planos e preços",
    paragraphs: [
      "Estes são os planos que vendes aos clientes do Adjudata. Preços sem IVA; checkout seguro via Stripe.",
    ],
    extra: {
      type: "table",
      headers: ["Plano", "Preço", "Pesquisas/mês", "Oportunidades", "Pesquisas guardadas", "Alertas", "Outras características"],
      rows: [
        ["Free", "0 €", "10", "3", "1", "1", "—"],
        ["Starter", "29 €/mês ou 290 €/ano (poupa ~17%)", "250", "100", "25", "5", "Acesso a entidades e concorrência"],
        ["Pro", "69 €/mês ou 690 €/ano (poupa ~17%)", "Ilimitadas", "500", "100", "20", "Contexto completo de procedimentos"],
      ],
    },
    bullets: [
      "**Para experimentar o Adjudata** e perceber o valor, o Free é um ponto de partida deliberadamente limitado (10 pesquisas/mês, 3 oportunidades, 1 pesquisa guardada, 1 alerta).",
      "**Para quem participa regularmente** em concursos, o Starter é o plano natural — desbloqueia entidades e concorrência e sobe os limites.",
      "**Para empresas que querem intelligence comercial avançada**, o Pro remove os limites de pesquisa e dá o contexto completo de cada procedimento.",
      "O plano anual é sempre a opção mais vantajosa para o cliente (poupança) e para ti (comissão de 20% na venda direta) — mas explica sempre as duas opções com transparência.",
    ],
    summary:
      "Três planos — Free, Starter, Pro — com preços sem IVA e checkout via Stripe; a escolha depende da frequência com que o cliente participa em concursos públicos.",
  },
  {
    id: "boas-praticas",
    number: 15,
    title: "Boas práticas comerciais",
    paragraphs: [
      "**Rotina sugerida.**",
    ],
    bullets: [
      "**Diariamente:** abre o Dashboard de prospeção, trata as ações vencidas, avança pelo menos alguns prospects novos na fila, regista todas as atividades do dia.",
      "**Semanalmente:** revê os leads parados há mais tempo num mesmo estado, confirma que a tua assinatura de email está atualizada, consulta Ganhos da equipa para acompanhar o teu progresso.",
      "**Regras de contacto e RGPD:** contacta apenas contactos públicos confirmados na plataforma; não uses dados de clientes fora dos campos previstos no Adjudata; segue as regras de proteção de dados (RGPD) ao contactar empresas (uso legítimo e proporcional, B2B); não partilhes credenciais de acesso com ninguém, mesmo dentro da equipa.",
      "**Segurança:** o acesso por papel é validado no backend — cada comercial vê apenas o que lhe compete; todas as ações sensíveis (atribuições, aprovações de comissão, envio de emails) são auditadas.",
    ],
    summary:
      "Uma boa rotina diária evita prospects esquecidos; o respeito pelo RGPD e pelos contactos públicos protege-te a ti e à empresa.",
  },
];

// --- FAQ --------------------------------------------------------------------

export type FaqItem = { question: string; answer: string };

export const faq: FaqItem[] = [
  { question: "Porque é que as respostas aos emails não chegam?", answer: "Porque não existe caixa de entrada em comercial@adjudata.pt. As respostas não são recebidas na plataforma — têm de ser seguidas pelos teus próprios canais (email/telefone)." },
  { question: "Como é calculada a minha comissão?", answer: "Depende do tipo de venda: 100% na 1.ª mensalidade (venda direta), 10% nas seguintes, 20% numa venda anual, mais bónus de retenção (3%) e regras específicas para comissões de equipa e recrutamento (ver secção 9)." },
  { question: "Recebo comissão se o cliente cancelar?", answer: "As mensalidades seguintes só geram comissão enquanto o cliente estiver ativo e a pagar; uma comissão pode ficar em estado Cancelada se as condições do programa não forem cumpridas. Para casos concretos, confirma com o teu gestor comercial ou abre um ticket." },
  { question: "Posso ter o meu próprio endereço nome@adjudata.pt?", answer: "Não. Todos os emails saem sempre de comercial@adjudata.pt. A tua identidade fica na assinatura (nome a apresentar e contacto opcional), não no endereço de envio." },
  { question: "Um prospect assumido por outro pode ser meu?", answer: "Não diretamente — um prospect só pertence a um comercial de cada vez. Se achas que está mal atribuído ou parado sem seguimento, fala com o teu gestor comercial ou abre um ticket." },
  { question: "O que acontece se não fizer a próxima ação?", answer: "O prospect/lead fica sem seguimento agendado e aparece como «ação vencida» no Dashboard de prospeção assim que a data passar — o ideal é evitar chegar a esse ponto." },
  { question: "Como sei se um email foi mesmo enviado?", answer: "Consulta a Caixa de saída em Os meus emails — o estado aparece como Em fila, Enviado ou Falhou." },
  { question: "O que faço se um email aparecer como «Falhou»?", answer: "Confirma se o endereço de destino está correto e tenta reenviar a partir de um novo email. Se persistir, abre um ticket em Tickets de suporte." },
  { question: "Posso editar a assinatura a qualquer momento?", answer: "Sim, em Os meus emails → separador Assinatura, a qualquer momento — as alterações aplicam-se aos próximos emails enviados." },
  { question: "Como encontro contactos de uma empresa prospect?", answer: "Na ficha do prospect, confirma primeiro o website público e depois usa «procurar contactos públicos» — o sistema tenta identificar contactos institucionais." },
  { question: "Um contacto encontrado automaticamente está sempre certo?", answer: "Não necessariamente — por isso tens de o confirmar (ou remover) manualmente antes de o poderes usar para enviar email." },
  { question: "O que significa o score de um prospect?", answer: "Uma pontuação de 0 a 100 que estima o potencial do prospect com base em atividade real em contratação pública (faixas de calor: ≥80 Muito quente, ≥60 Quente, ≥40 Médio, abaixo Baixo)." },
  { question: "O que é o «pool disponível»?", answer: "São os prospects que ainda não foram assumidos por nenhum comercial — estão livres para qualquer um assumir." },
  { question: "Quantos prospects devo assumir de cada vez?", answer: "Assume apenas os que consegues efetivamente trabalhar — assumir em excesso bloqueia oportunidades para o resto da equipa sem lhes dares seguimento." },
  { question: "Como vejo os meus clientes já convertidos?", answer: "Em Os meus clientes (/backoffice/clientes), com as comissões associadas e um botão de email direto." },
  { question: "Posso contactar um cliente que não seja meu?", answer: "Só consultas clientes autorizados — geralmente os que te estão atribuídos. Para outros casos, fala com o teu gestor comercial." },
  { question: "O que é uma comissão de equipa?", answer: "É a comissão que ganhas quando um colaborador que recrutaste ou geres realiza uma venda (ex.: 50% na 2.ª mensalidade, 5% numa venda anual)." },
  { question: "Há diferença entre comissão de venda direta e comissão de equipa?", answer: "Sim — a venda direta é sobre clientes que tu próprio converteste; a comissão de equipa é sobre vendas feitas por colaboradores que geres ou recrutaste." },
  { question: "O que são «níveis» nas comissões de equipa?", answer: "São escalões (por exemplo, nível 2) que podem alterar a percentagem aplicável, consoante a estrutura da tua organização — confirma os detalhes com o teu gestor." },
  { question: "Quando devo marcar um lead como «Perdido»?", answer: "Quando o prospect explicitamente recusa avançar ou deixa de responder de forma definitiva, para libertares tempo para outros contactos." },
  { question: "Posso reverter um lead marcado como «Não contactar»?", answer: "Fala com o teu gestor comercial ou abre um ticket — normalmente este estado destina-se a pedidos explícitos de não contacto e deve ser respeitado." },
  { question: "O que vejo no Dashboard de prospeção?", answer: "Prospects assumidos, disponíveis, ações vencidas, atividades dos últimos 30 dias, ganhos, perdidos, prospects mais quentes e próximas ações — em âmbito de Equipa ou Só as minhas." },
  { question: "Que planos posso vender?", answer: "Free, Starter e Pro — com preços mensais ou anuais (ver secção 14)." },
  { question: "Os preços têm IVA incluído?", answer: "Não, os preços apresentados são sem IVA." },
  { question: "Como é feito o checkout do cliente?", answer: "De forma segura, através do Stripe." },
  { question: "Onde peço ajuda para algo que não está neste manual?", answer: "Em Tickets de suporte (/backoffice/tickets)." },
  { question: "Esqueci-me da palavra-passe — o que faço?", answer: "Usa a opção de recuperação disponível em /acesso-comercial; se não a encontrares ou não funcionar, abre um ticket de suporte." },
  { question: "As minhas ações no back-office ficam registadas?", answer: "Sim — todas as ações sensíveis são auditadas, por razões de segurança e conformidade." },
];

// --- Resolução de problemas -------------------------------------------------

export type TroubleRow = { problem: string; cause: string; action: string };

export const troubleshooting: TroubleRow[] = [
  { problem: "Não consigo enviar email", cause: "Falta preencher Para/Assunto/Mensagem, ou o contacto não está confirmado", action: "Confirma que todos os campos obrigatórios estão preenchidos e que o contacto tem email confirmado na ficha do prospect." },
  { problem: "Email aparece como «Falhou» na Caixa de saída", cause: "Endereço de destino inválido ou problema temporário de entrega", action: "Confirma o endereço, tenta reenviar; se persistir, abre um ticket." },
  { problem: "Email fica muito tempo «Em fila»", cause: "Processamento em curso ou atraso pontual", action: "Aguarda alguns minutos; se não mudar de estado, abre um ticket." },
  { problem: "Não vejo um menu que esperava", cause: "Permissão associada ao teu papel (role)", action: "Confirma com o teu gestor comercial se deverias ter acesso; não é um erro, é uma questão de permissões." },
  { problem: "Esqueci a palavra-passe", cause: "—", action: "Usa a recuperação em /acesso-comercial; se falhar, abre um ticket." },
  { problem: "Não consigo assumir um prospect", cause: "Já foi assumido por outro comercial", action: "Escolhe outro prospect do pool disponível; se achas que está parado sem seguimento, fala com o gestor." },
  { problem: "Não aparece o botão «Enviar email» na ficha do prospect", cause: "Não há ainda nenhum contacto de email confirmado", action: "Confirma o website e procura/confirma contactos públicos primeiro." },
  { problem: "Uma comissão que esperava não aparece", cause: "Pode ainda estar Pendente, ou associada a outro comercial", action: "Consulta o estado em Ganhos da equipa; se a dúvida persistir, abre um ticket com os detalhes da venda." },
  { problem: "Um cliente não aparece em «Os meus clientes»", cause: "O cliente pode não estar atribuído a ti", action: "Confirma a atribuição com o teu gestor comercial." },
  { problem: "Não sei que próxima ação definir num prospect parado", cause: "Falta de contexto recente", action: "Consulta o histórico de atividades na ficha do prospect antes de decidires o próximo passo." },
];

// --- Glossário final --------------------------------------------------------

export const glossary: TermRow[] = [
  { term: "Adjudata", meaning: "A plataforma (adjudata.pt) e o negócio como um todo." },
  { term: "BASE", meaning: "Base de dados oficial dos contratos públicos em Portugal, fonte dos dados do Adjudata." },
  { term: "CPV", meaning: "Vocabulário Comum para os Contratos Públicos — classifica o objeto de um contrato." },
  { term: "NIF", meaning: "Número de Identificação Fiscal." },
  { term: "Procedimento", meaning: "Processo de contratação pública publicado no BASE." },
  { term: "Score", meaning: "Pontuação 0–100 do potencial de um prospect." },
  { term: "Faixas de calor", meaning: "≥80 «Muito quente», ≥60 «Quente», ≥40 «Médio», abaixo de 40 «Baixo»." },
  { term: "Prospect", meaning: "Empresa identificada como potencial cliente, ainda não convertida." },
  { term: "Pool disponível", meaning: "Prospects ainda não assumidos por nenhum comercial." },
  { term: "Assumir", meaning: "Atribuir um prospect a ti próprio." },
  { term: "Lead", meaning: "Contacto comercial em progresso, com estado no pipeline." },
  { term: "Estados do lead/prospect", meaning: "Novo, Em pesquisa, Pronto para contacto, Contactado, Follow-up, Respondeu, Demonstração, Trial, Negociação, Cliente (Won), Perdido, Não contactar, Inativo." },
  { term: "Comissão", meaning: "Valor ganho por uma venda ou renovação." },
  { term: "Estados da comissão", meaning: "Pendente, Aprovada, Paga, Cancelada." },
  { term: "Venda direta", meaning: "Venda feita diretamente por ti a um cliente novo." },
  { term: "Comissão de equipa", meaning: "Comissão sobre vendas de colaboradores que recrutaste ou geres." },
  { term: "Plano", meaning: "Subscrição do cliente: Free, Starter ou Pro." },
  { term: "Correio comercial", meaning: "Funcionalidade de envio de email a partir de comercial@adjudata.pt." },
  { term: "Assinatura", meaning: "Nome a apresentar, contacto opcional e nota de rodapé, acrescentados automaticamente a cada email." },
  { term: "admin", meaning: "Papel com acesso total às operações comerciais e configuração." },
  { term: "commercial_manager", meaning: "Papel de gestor comercial — gere clientes, oportunidades e colaboradores." },
  { term: "commercial", meaning: "Papel de comercial — consulta, prospeta, vende e acompanha os seus próprios ganhos." },
];

// --- Contactos e recursos ---------------------------------------------------

export const resources: string[] = [
  "**Dúvidas técnicas ou de conta:** abre um pedido em Tickets de suporte (/backoffice/tickets).",
  "**Dúvidas sobre comissões, atribuições ou permissões:** fala primeiro com o teu gestor comercial (commercial_manager); se não conseguires resolver, abre um ticket.",
  "**Condições do programa comercial (versão pública):** /programa-comercial.",
  "**Recrutamento de novos comerciais:** /recrutamento.",
  "**Este manual:** é o teu primeiro recurso — antes de perguntares a alguém, confirma se a resposta já não está aqui (as secções de FAQ e Resolução de problemas cobrem a maioria das dúvidas do dia a dia).",
];

// --- Cartão de bolso --------------------------------------------------------

export const pocket = {
  steps: [
    "Login em /acesso-comercial.",
    "Preenche a Assinatura em Os meus emails antes do primeiro contacto.",
    "Explora a fila em Pesquisar empresas / Prospecção.",
    "Escolhe prospects com score alto (Quente/Muito quente).",
    "Assume o prospect.",
    "Confirma o website e procura contactos públicos.",
    "Confirma o contacto de email antes de enviar.",
    "Envia o email a partir do contacto confirmado ou de Os meus clientes.",
    "Regista sempre a atividade.",
    "Define sempre a próxima ação.",
  ],
  commissionRules: [
    "1.ª mensalidade venda direta: 100%",
    "Mensalidades seguintes: 10%",
    "Venda anual direta: 20%",
    "Bónus de retenção: 3%",
    "Equipa (2.ª mensalidade): 50%",
    "Equipa (anual): 5%",
    "Recrutamento: 5%",
  ],
  emailLimits: [
    "Remetente único: comercial@adjudata.pt",
    "Não há caixa de entrada — respostas não chegam à plataforma",
    "O seguimento é sempre feito pelos teus próprios canais",
  ],
  mistakes: [
    "Assumir mais prospects do que consegues trabalhar.",
    "Contactar fora dos contactos públicos confirmados.",
    "Não definir a próxima ação num prospect/lead.",
    "Presumir que uma comissão «Pendente» já está garantida.",
    "Esquecer de atualizar a assinatura de email com um contacto de seguimento.",
  ],
};
