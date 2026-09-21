/**
 * Adjudata — Prospeção B2B: Lead Scoring Engine (FASE 5).
 *
 * CONFIGURAÇÃO CENTRAL do score (0-100). Este ficheiro é a ÚNICA fonte de
 * verdade em TypeScript para pesos, sub-scores, portões (bands) e templates de
 * explicação. Nenhum valor de scoring deve ser hardcoded noutro ficheiro.
 *
 * O motor determinístico em `src/lib/leadScoring/engine.ts` consome esta
 * configuração. Do lado do backend, a tabela `public.lead_scoring_config`
 * guarda a configuração ATIVA (autoridade em runtime) — a migração
 * `20261001090000_lead_scoring.sql` é semeada com exatamente estes valores por
 * omissão. Alterar pesos = alterar config (DB) e/ou este ficheiro, nunca
 * espalhar constantes pelo código.
 *
 * Princípios (AGENTS.md):
 *   * Determinístico: mesmo input + mesma config ⇒ mesmo score.
 *   * Auditável: cada componente é guardado individualmente e a explicação é
 *     gerada a partir de dados objetivos (templates), nunca por LLM.
 *   * Opt-out nunca é elegível para contacto.
 */

/** Identificadores dos componentes do score. */
export const LEAD_SCORE_COMPONENTS = [
  "opportunity_fit", // número de oportunidades compatíveis (procura)
  "market_value", // valor agregado das oportunidades/negócio
  "contact_quality", // qualidade e validade do contacto empresarial
  "company_fit", // ramo/CPV, CAE, dimensão, website, localização
  "public_procurement_gap", // baixa participação pública conhecida (oportunidade)
  "data_confidence", // frescura e proveniência dos dados
] as const;

export type LeadScoreComponent = (typeof LEAD_SCORE_COMPONENTS)[number];

/** Pesos por componente. Devem somar 1.0 (validado por `assertConfigValid`). */
export type LeadScoreWeights = Record<LeadScoreComponent, number>;

/** Ponto de uma função de scoring por troços (piecewise linear). */
export type Breakpoint = { at: number; score: number };

/** Portão (banda) de classificação do score final. */
export type ScoreBandKey = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type ScoreBand = {
  key: ScoreBandKey;
  /** Limite inferior (inclusive). */
  min: number;
  /** Limite superior (inclusive). */
  max: number;
  /** Rótulo legível em português. */
  label: string;
};

/** Configuração completa do motor de scoring. */
export type LeadScoringConfig = {
  /** Versão semântica da configuração (para auditoria/reprodutibilidade). */
  version: string;
  weights: LeadScoreWeights;
  opportunityFit: {
    breakpoints: Breakpoint[];
    /** Bónus por recência da última participação conhecida. */
    recencyBonus: { within90: number; within180: number };
    max: number;
  };
  marketValue: {
    breakpoints: Breakpoint[];
    max: number;
  };
  contactQuality: {
    max: number;
    genericEmail: number;
    commercialEmail: number;
    phone: number;
    website: number;
    validatedContactBonus: number;
    namedEmailPenalty: number;
    /** Bónus quando há email E telefone (canal duplo). */
    validationBothBonus: number;
    /** Peso (0-1) da confiança do contacto no sub-score. */
    confidenceWeight: number;
  };
  companyFit: {
    max: number;
    cpvPresence: number;
    caeCompatible: number;
    websitePresence: number;
    sizePoints: { micro: number; pequeno: number; medio: number; grande: number };
    districtPresence: number;
  };
  publicProcurementGap: {
    max: number;
    /** Fator de "fit" mínimo (0-1) aplicado mesmo sem sinais abundantes. */
    fitFloor: number;
    /** Nº de participações a partir do qual o gap → 0 (já é ativo em CP). */
    participationFullPenalty: number;
  };
  dataConfidence: {
    max: number;
    freshness: { within30: number; within90: number; within180: number; older: number; none: number };
    provenance: { website: number; contactSource: number };
  };
  bands: ScoreBand[];
  /** Regras de elegibilidade para contacto. */
  eligibility: {
    /** Prospects com opt-out nunca são elegíveis para contacto. */
    blockOnOptOut: boolean;
  };
};

/**
 * Configuração por omissão (canonical). Pesos somam 1.0.
 * Este objeto é a semente da tabela `public.lead_scoring_config`.
 */
export const LEAD_SCORING_DEFAULT_CONFIG: LeadScoringConfig = {
  version: "1.0.0",
  weights: {
    opportunity_fit: 0.25,
    market_value: 0.2,
    contact_quality: 0.2,
    company_fit: 0.15,
    public_procurement_gap: 0.1,
    data_confidence: 0.1,
  },
  opportunityFit: {
    breakpoints: [
      { at: 0, score: 0 },
      { at: 1, score: 25 },
      { at: 3, score: 50 },
      { at: 6, score: 75 },
      { at: 10, score: 100 },
    ],
    recencyBonus: { within90: 10, within180: 5 },
    max: 100,
  },
  marketValue: {
    breakpoints: [
      { at: 0, score: 0 },
      { at: 50000, score: 25 },
      { at: 150000, score: 50 },
      { at: 400000, score: 75 },
      { at: 1000000, score: 100 },
    ],
    max: 100,
  },
  contactQuality: {
    max: 100,
    genericEmail: 60,
    commercialEmail: 65,
    phone: 40,
    website: 15,
    validatedContactBonus: 25,
    namedEmailPenalty: 15,
    validationBothBonus: 10,
    confidenceWeight: 0.2,
  },
  companyFit: {
    max: 100,
    cpvPresence: 35,
    caeCompatible: 20,
    websitePresence: 15,
    sizePoints: { micro: 5, pequeno: 10, medio: 15, grande: 20 },
    districtPresence: 10,
  },
  publicProcurementGap: {
    max: 100,
    fitFloor: 0.4,
    participationFullPenalty: 5,
  },
  dataConfidence: {
    max: 100,
    freshness: { within30: 60, within90: 40, within180: 25, older: 10, none: 5 },
    provenance: { website: 20, contactSource: 20 },
  },
  bands: [
    { key: "LOW", min: 0, max: 39, label: "Baixa" },
    { key: "MEDIUM", min: 40, max: 59, label: "Média" },
    { key: "HIGH", min: 60, max: 79, label: "Alta" },
    { key: "VERY_HIGH", min: 80, max: 100, label: "Muito alta" },
  ],
  eligibility: {
    blockOnOptOut: true,
  },
};

/**
 * Valida a coerência da configuração. Lança erro descritivo em configurações
 * inválidas (pesos que não somam 1, portões desalinhados, etc.). Pura.
 */
export function assertConfigValid(config: LeadScoringConfig): void {
  const sum = LEAD_SCORE_COMPONENTS.reduce((acc, key) => acc + (config.weights[key] ?? 0), 0);
  if (Math.abs(sum - 1) > 1e-6) {
    throw new Error(`Pesos do Lead Scoring devem somar 1.0 (soma atual: ${sum.toFixed(4)}).`);
  }
  for (const key of LEAD_SCORE_COMPONENTS) {
    const weight = config.weights[key];
    if (typeof weight !== "number" || weight < 0 || weight > 1) {
      throw new Error(`Peso inválido para "${key}": ${weight}.`);
    }
  }
  if (!config.bands.length) throw new Error("É necessário pelo menos um portão (band).");
  let cursor = 0;
  for (const band of [...config.bands].sort((a, b) => a.min - b.min)) {
    if (band.min !== cursor) throw new Error(`Portões não contíguos em ${band.min} (esperado ${cursor}).`);
    if (band.max < band.min) throw new Error(`Portão inválido ${band.key}: max < min.`);
    cursor = band.max + 1;
  }
  if (config.bands[config.bands.length - 1].max !== 100) {
    throw new Error("O último portão deve terminar em 100.");
  }
}

/**
 * Devolve o portão (band) para um score 0-100. Pura e determinística.
 */
export function scoreBand(score: number, config: LeadScoringConfig = LEAD_SCORING_DEFAULT_CONFIG): ScoreBand {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return config.bands.find((band) => clamped >= band.min && clamped <= band.max) ?? config.bands[0];
}

/** Rótulo legível do portão a partir da chave. */
export function bandLabel(key: ScoreBandKey, config: LeadScoringConfig = LEAD_SCORING_DEFAULT_CONFIG): string {
  return config.bands.find((band) => band.key === key)?.label ?? key;
}
