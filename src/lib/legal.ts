export const legalOperator = {
  name: "Radar B2B",
  legalForm: "designação comercial provisória",
  nif: null,
  country: "Portugal",
  address: null,
  supportEmail: null,
  privacyEmail: null,
  dpo: null,
  registry: null,
} as const;

export const pendingLegalFields = [
  "Email geral de suporte",
  "Email de privacidade/RGPD",
  "Morada de sede para divulgação pública",
  "Responsável de privacidade e contacto",
  "DPO, se aplicável",
  "Conservatória ou registo comercial, se aplicável",
  "Domínio principal e emails empresariais",
] as const;
