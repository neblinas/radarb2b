function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export const legalOperator = {
  name: "Radar B2B",
  legalForm:
    env("NEXT_PUBLIC_LEGAL_ENTITY_NAME", "NEXT_PUBLIC_LEGAL_NAME") ||
    "designação comercial provisória",
  nif: env("NEXT_PUBLIC_LEGAL_ENTITY_NIF", "NEXT_PUBLIC_LEGAL_NIF"),
  country: "Portugal",
  address: env("NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS", "NEXT_PUBLIC_LEGAL_ADDRESS"),
  supportEmail: env("NEXT_PUBLIC_SUPPORT_EMAIL"),
  privacyEmail: env("NEXT_PUBLIC_PRIVACY_EMAIL"),
  disputeEmail: env("NEXT_PUBLIC_DISPUTE_EMAIL"),
  dpo: env("NEXT_PUBLIC_DPO_CONTACT", "NEXT_PUBLIC_DPO_EMAIL"),
  registry: env("NEXT_PUBLIC_LEGAL_REGISTRY"),
  siteUrl:
    env("NEXT_PUBLIC_SITE_URL") || "https://radarb2b-iota.vercel.app",
  lastUpdated: "17 de setembro de 2026",
} as const;

// Entidades externas que tratam dados por conta do Radar B2B, com base legal e finalidade.
// Mantidas em código para serem mostradas na política de privacidade (requisito RGPD art. 13.º).
export const dataProcessors = [
  {
    name: "Supabase",
    role: "Base de dados, autenticação e alojamento de dados",
    location: "União Europeia (região configurada)",
  },
  {
    name: "Stripe",
    role: "Processamento de pagamentos e faturação",
    location: "Irlanda / Estados Unidos (cláusulas contratuais-tipo)",
  },
  {
    name: "Vercel",
    role: "Alojamento e entrega da aplicação web",
    location: "União Europeia / Estados Unidos (cláusulas contratuais-tipo)",
  },
  {
    name: "Sentry",
    role: "Monitorização de erros e diagnóstico técnico",
    location: "União Europeia / Estados Unidos (cláusulas contratuais-tipo)",
  },
] as const;

// Prazo de conservação por categoria de dados (requisito RGPD art. 13.º/5.º).
export const retentionPeriods = [
  { data: "Dados de conta", period: "Enquanto a conta estiver ativa e até 12 meses após o seu encerramento" },
  { data: "Registos de utilização e segurança", period: "Até 12 meses, salvo obrigação legal de conservação superior" },
  { data: "Faturação e dados fiscais", period: "10 anos, conforme obrigações fiscais e contabilísticas" },
  { data: "Pedidos de suporte e tickets", period: "Até 24 meses após a resolução do pedido" },
  { data: "Preferências de cookies", period: "Até 12 meses ou até o utilizador apagar as preferências" },
] as const;

export const pendingLegalFields = [
  "Designação legal definitiva da entidade",
  "NIF / número de identificação fiscal",
  "Morada da sede para divulgação pública",
  "Email geral de suporte",
  "Email de privacidade/RGPD",
  "Email para resolução de litígios",
  "Responsável de privacidade e contacto",
  "DPO, se aplicável",
  "Conservatória ou registo comercial, se aplicável",
  "Domínio principal e emails empresariais",
] as const;

export function isLegalIdentityComplete() {
  return Boolean(
    legalOperator.nif &&
      legalOperator.address &&
      legalOperator.supportEmail &&
      legalOperator.privacyEmail,
  );
}

