import { brand as brandIdentity } from "@/lib/brand";

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

// Marca de produto usada em toda a interface.
export const brand = brandIdentity.name;

// Identificação legal do operador. Como ENI, o titular é uma pessoa singular,
// pelo que o nome comercial e a denominação legal coincidem com a pessoa.
export const legalOperator = {
  // Nome comercial apresentado na interface.
  brand,
  // Nome legal do titular (pessoa singular, ENI).
  legalName:
    env("NEXT_PUBLIC_LEGAL_ENTITY_NAME", "NEXT_PUBLIC_LEGAL_NAME") || null,
  // Qualidade jurídica do operador (ex.: "Empresário em nome individual").
  legalForm:
    env("NEXT_PUBLIC_LEGAL_FORM") || "Empresário em nome individual",
  nif: env("NEXT_PUBLIC_LEGAL_ENTITY_NIF", "NEXT_PUBLIC_LEGAL_NIF"),
  country: "Portugal",
  // Sede. Divulgada de forma concentrada (informação legal, termos, privacidade).
  address: env("NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS", "NEXT_PUBLIC_LEGAL_ADDRESS"),
  supportEmail: env("NEXT_PUBLIC_SUPPORT_EMAIL"),
  privacyEmail: env("NEXT_PUBLIC_PRIVACY_EMAIL"),
  disputeEmail: env("NEXT_PUBLIC_DISPUTE_EMAIL"),
  dpo: env("NEXT_PUBLIC_DPO_CONTACT", "NEXT_PUBLIC_DPO_EMAIL"),
  registry: env("NEXT_PUBLIC_LEGAL_REGISTRY"),
  siteUrl: env("NEXT_PUBLIC_SITE_URL") || "https://adjudata.pt",
  lastUpdated: "17 de setembro de 2026",
} as const;

// Entidades externas que tratam dados por conta do Adjudata, com base legal e finalidade.
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
  "Email geral de suporte (profissional)",
  "Email de privacidade/RGPD (profissional)",
  "Email para resolução de litígios (pode reutilizar o de suporte)",
  "DPO, se aplicável",
] as const;

export function isLegalIdentityComplete() {
  return Boolean(
    legalOperator.legalName &&
      legalOperator.nif &&
      legalOperator.address &&
      legalOperator.supportEmail &&
      legalOperator.privacyEmail,
  );
}

