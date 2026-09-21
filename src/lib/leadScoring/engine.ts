/**
 * Adjudata — Prospeção B2B: Lead Scoring Engine (FASE 5). Motor determinístico.
 *
 * Calcula um score comercial 0-100 e a respetiva explicação a partir de dados
 * OBJETIVOS já existentes na Adjudata. Não usa IA generativa para decidir o
 * score nem para escrever a explicação: a explicação é montada a partir de
 * templates + dados reais.
 *
 * Regras:
 *   * Mesmo input + mesma configuração ⇒ mesmo score (determinístico).
 *   * Cada componente é devolvido individualmente (auditável e guardável).
 *   * Prospects com opt-out NUNCA são elegíveis para contacto.
 *
 * As mesmas regras estão espelhadas no backend (função `lead_score_compute` na
 * migração `20261001090000_lead_scoring.sql`). Este módulo é puro (sem I/O) e
 * serve o back-office, os testes e pré-visualizações.
 */

import {
  LEAD_SCORING_DEFAULT_CONFIG,
  LEAD_SCORE_COMPONENTS,
  type LeadScoreComponent,
  type LeadScoringConfig,
  type ScoreBandKey,
  scoreBand,
} from "./config";

/** Dimensão estimada (espelha `company_lead_stats.inferred_size`). */
export type LeadSize = "micro" | "pequeno" | "medio" | "grande";

/** Tipo de email empresarial. */
export type LeadEmailType = "geral" | "comercial" | "suporte" | "outro";

/**
 * Input normalizado do motor. Todos os campos são opcionais exceto `name`.
 * Proveniência: `company_prospect_scores` (Radar), `prospect_companies` e
 * contactos de enriquecimento (`company_enrichment_contacts`).
 */
export type LeadScoringInput = {
  prospectId?: string | null;
  companyId?: string | null;
  name: string;
  nif?: string | null;

  // Empresa / ramo
  cae?: string | null;
  district?: string | null;
  estimatedSize?: LeadSize | null;
  website?: string | null;
  email?: string | null;
  emailType?: LeadEmailType | null;
  phone?: string | null;
  cpvCodes?: string[];
  categories?: string[];

  // Contacto validado (contactos de enriquecimento)
  hasGenericEmail?: boolean;
  hasContact?: boolean;
  contactValidated?: boolean;
  contactConfidence?: number | null;

  // Oportunidades e mercado
  matchingOpportunities?: number | null;
  estimatedOpportunityValue?: number | null;

  // Histórico conhecido em contratação pública
  participationCount?: number | null;
  participation12m?: number | null;
  awardCount?: number | null;
  totalAwardValue?: number | null;
  competitorCount?: number | null;
  lastParticipation?: string | null;

  // Frescura / proveniência
  lastVerifiedAt?: string | null;

  // Elegibilidade
  optOut?: boolean | null;
  commercialStatus?: string | null;
};

/** Resultado do cálculo para um lead. */
export type LeadScoreResult = {
  score: number;
  band: ScoreBandKey;
  bandLabel: string;
  /** Componentes individuais (0-100). */
  components: Record<LeadScoreComponent, number>;
  /** Contribuição ponderada de cada componente (em pontos do score final). */
  contributions: Record<LeadScoreComponent, number>;
  /** Explicação gerada a partir de templates + dados objetivos. */
  reasons: string[];
  /** Elegível para contacto? (opt-out nunca é elegível.) */
  eligible: boolean;
  /** Motivo da não-elegibilidade, quando aplicável. */
  blockedReason: string | null;
  /** Versão da configuração usada. */
  configVersion: string;
};

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/** Interpolação linear por troços. Abaixo do 1º ponto → 1º score. Acima do último → último. */
export function piecewiseScore(value: number, breakpoints: { at: number; score: number }[]): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const points = [...breakpoints].sort((a, b) => a.at - b.at);
  if (value <= points[0].at) return points[0].score;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (value <= current.at) {
      const span = current.at - previous.at;
      if (span <= 0) return current.score;
      const ratio = (value - previous.at) / span;
      return Math.round(previous.score + ratio * (current.score - previous.score));
    }
  }
  return points[points.length - 1].score;
}

function clamp(value: number, max = 100): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

function daysSince(dateIso: string | null | undefined, now: Date): number | null {
  if (!dateIso) return null;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return null;
  return (now.getTime() - date.getTime()) / 86_400_000;
}

/** Normaliza um valor para 0-1 com teto. */
function ratio(value: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return Math.max(0, Math.min(1, value / ceiling));
}

// ---------------------------------------------------------------------------
// Sub-scores (cada um 0-100)
// ---------------------------------------------------------------------------

/** opportunity_fit — número de oportunidades compatíveis (com bónus de recência). */
export function scoreOpportunityFit(input: LeadScoringInput, config: LeadScoringConfig, now: Date): number {
  const opportunities = Math.max(0, input.matchingOpportunities ?? input.participation12m ?? 0);
  const base = piecewiseScore(opportunities, config.opportunityFit.breakpoints);
  const age = daysSince(input.lastParticipation, now);
  let bonus = 0;
  if (age !== null) {
    if (age <= 90) bonus = config.opportunityFit.recencyBonus.within90;
    else if (age <= 180) bonus = config.opportunityFit.recencyBonus.within180;
  }
  return clamp(base + bonus, config.opportunityFit.max);
}

/** market_value — valor agregado (oportunidade estimada ou valor adjudicado). */
export function scoreMarketValue(input: LeadScoringInput, config: LeadScoringConfig): number {
  const value = Math.max(0, input.estimatedOpportunityValue ?? input.totalAwardValue ?? 0);
  return clamp(piecewiseScore(value, config.marketValue.breakpoints), config.marketValue.max);
}

/** contact_quality — existência, tipo e validade do contacto empresarial. */
export function scoreContactQuality(input: LeadScoringInput, config: LeadScoringConfig): number {
  const c = config.contactQuality;
  let score = 0;

  const generic = input.hasGenericEmail === true || input.emailType === "geral";
  if (generic) score += c.genericEmail;
  else if (input.emailType === "comercial") score += c.commercialEmail;
  else if (input.email) score += Math.max(0, c.commercialEmail - c.namedEmailPenalty);

  if (input.phone) score += c.phone;
  if (input.website) score += c.website;
  if (input.contactValidated === true || input.hasContact === true) score += c.validatedContactBonus;
  if (input.phone && input.email) score += c.validationBothBonus;

  if (typeof input.contactConfidence === "number" && input.contactConfidence > 0) {
    score += Math.round(input.contactConfidence * c.confidenceWeight);
  }
  return clamp(score, c.max);
}

/** company_fit — ramo/CPV, CAE compatível, website, dimensão e localização. */
export function scoreCompanyFit(input: LeadScoringInput, config: LeadScoringConfig): number {
  const f = config.companyFit;
  let score = 0;
  if ((input.cpvCodes?.length ?? 0) > 0 || (input.categories?.length ?? 0) > 0) score += f.cpvPresence;
  if (input.cae) score += f.caeCompatible;
  if (input.website) score += f.websitePresence;
  if (input.estimatedSize && input.estimatedSize in f.sizePoints) score += f.sizePoints[input.estimatedSize];
  if (input.district) score += f.districtPresence;
  return clamp(score, f.max);
}

/**
 * public_procurement_gap — oportunidade comercial quando a empresa ENCAIXA no
 * ramo mas tem BAIXA participação pública conhecida. Quanto maior o encaixe e
 * menor a participação, maior a oportunidade de introduzir a Adjudata.
 */
export function scorePublicProcurementGap(input: LeadScoringInput, config: LeadScoringConfig): number {
  const g = config.publicProcurementGap;
  const hasSectorFit = (input.cpvCodes?.length ?? 0) > 0 || (input.categories?.length ?? 0) > 0 || !!input.cae;
  const fitFactor = hasSectorFit ? 1 : g.fitFloor;
  const participation = Math.max(0, input.participationCount ?? 0);
  const participationFactor = 1 - ratio(participation, g.participationFullPenalty);
  return clamp(fitFactor * participationFactor * g.max, g.max);
}

/** data_confidence — frescura (verificação/participação) e proveniência dos dados. */
export function scoreDataConfidence(input: LeadScoringInput, config: LeadScoringConfig, now: Date): number {
  const d = config.dataConfidence;
  const age = daysSince(input.lastVerifiedAt ?? input.lastParticipation, now);
  let score: number;
  if (age === null) score = d.freshness.none;
  else if (age <= 30) score = d.freshness.within30;
  else if (age <= 90) score = d.freshness.within90;
  else if (age <= 180) score = d.freshness.within180;
  else score = d.freshness.older;

  if (input.website) score += d.provenance.website;
  if (input.hasContact === true || input.contactValidated === true) score += d.provenance.contactSource;
  return clamp(score, d.max);
}

// ---------------------------------------------------------------------------
// Explicação (templates + dados objetivos; sem LLM)
// ---------------------------------------------------------------------------

/**
 * Gera a explicação legível do score a partir de templates e dados reais.
 * Só produz frases quando há dados que as sustentam.
 */
export function buildExplanation(
  input: LeadScoringInput,
  components: Record<LeadScoreComponent, number>,
): string[] {
  const reasons: string[] = [];
  const categories = input.categories ?? [];
  const opportunities = Math.max(0, input.matchingOpportunities ?? 0);
  const value = Math.max(0, input.estimatedOpportunityValue ?? input.totalAwardValue ?? 0);

  if (components.company_fit >= 60 && categories.length) {
    reasons.push(`Forte correspondência com CPVs (${categories.slice(0, 3).join(", ")})`);
  } else if (categories.length) {
    reasons.push(`Correspondência parcial com o ramo ${categories.slice(0, 3).join(", ")}`);
  }

  if (opportunities > 0) {
    reasons.push(`${opportunities} oportunidade${opportunities === 1 ? "" : "s"} compatíve${opportunities === 1 ? "l" : "is"}`);
  } else if ((input.participation12m ?? 0) > 0) {
    reasons.push(`${input.participation12m} participações nos últimos 12 meses`);
  }

  if (value > 0) {
    reasons.push(`${formatEuro(value)} de valor agregado`);
  }

  const generic = input.hasGenericEmail === true || input.emailType === "geral";
  if (generic && (input.contactValidated === true || input.hasContact === true)) {
    reasons.push("Contacto empresarial validado (email institucional)");
  } else if (generic) {
    reasons.push("Email empresarial genérico disponível");
  } else if (input.phone) {
    reasons.push("Telefone empresarial disponível");
  } else if (!input.email) {
    reasons.push("Sem contacto empresarial disponível");
  }

  if (components.public_procurement_gap >= 60) {
    reasons.push("Baixa participação pública conhecida (oportunidade de entrada)");
  } else if ((input.participationCount ?? 0) >= 5) {
    reasons.push(`Participação ativa conhecida em contratação pública (${input.participationCount} registos)`);
  }

  if (input.estimatedSize === "grande" || input.estimatedSize === "medio") {
    reasons.push(`Dimensão empresarial ${input.estimatedSize === "grande" ? "grande" : "média"}`);
  }

  if (input.website) reasons.push("Website oficial identificado");

  if (components.data_confidence <= 30) {
    reasons.push("Dados pouco recentes — requer verificação");
  }

  return reasons;
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

/**
 * Determina a elegibilidade para contacto. Opt-out nunca é elegível.
 */
export function isEligibleForContact(
  input: Pick<LeadScoringInput, "optOut" | "commercialStatus">,
  config: LeadScoringConfig = LEAD_SCORING_DEFAULT_CONFIG,
): { eligible: boolean; blockedReason: string | null } {
  if (config.eligibility.blockOnOptOut && (input.optOut === true || input.commercialStatus === "OPTED_OUT")) {
    return { eligible: false, blockedReason: "Opt-out — não pode ser contactado" };
  }
  return { eligible: true, blockedReason: null };
}

/**
 * Calcula o score completo (0-100), componentes individuais, portão,
 * explicação e elegibilidade. Determinístico.
 */
export function computeLeadScore(
  input: LeadScoringInput,
  config: LeadScoringConfig = LEAD_SCORING_DEFAULT_CONFIG,
  now: Date = new Date(),
): LeadScoreResult {
  const components: Record<LeadScoreComponent, number> = {
    opportunity_fit: scoreOpportunityFit(input, config, now),
    market_value: scoreMarketValue(input, config),
    contact_quality: scoreContactQuality(input, config),
    company_fit: scoreCompanyFit(input, config),
    public_procurement_gap: scorePublicProcurementGap(input, config),
    data_confidence: scoreDataConfidence(input, config, now),
  };

  const contributions = {} as Record<LeadScoreComponent, number>;
  let total = 0;
  for (const key of LEAD_SCORE_COMPONENTS) {
    const contribution = components[key] * config.weights[key];
    contributions[key] = Math.round(contribution * 100) / 100;
    total += contribution;
  }

  const score = Math.max(0, Math.min(100, Math.round(total)));
  const band = scoreBand(score, config);
  const { eligible, blockedReason } = isEligibleForContact(input, config);

  return {
    score,
    band: band.key,
    bandLabel: band.label,
    components,
    contributions,
    reasons: buildExplanation(input, components),
    eligible,
    blockedReason,
    configVersion: config.version,
  };
}

/** Filtro aplicável sobre os resultados de scoring. */
export type LeadScoringFilters = {
  minScore?: number | null;
  maxScore?: number | null;
  band?: ScoreBandKey | null;
  commercialStatus?: string | null;
  cae?: string | null;
  cpv?: string | null;
  district?: string | null;
  contactAvailable?: boolean;
  genericEmail?: boolean;
  minOpportunities?: number | null;
  minValue?: number | null;
  /** Incluir leads com opt-out na listagem (nunca elegíveis para contacto). */
  includeOptedOut?: boolean;
  /** Limite de amostra devolvida pelo motor (não altera o score). */
  sampleLimit?: number | null;
};

/** Aplica filtros puros a um lead de scoring (usado na UI e nos testes). */
export function matchesFilters(
  row: { input: LeadScoringInput; result: LeadScoreResult },
  filters: LeadScoringFilters,
): boolean {
  const { input, result } = row;
  if (!filters.includeOptedOut && (input.optOut === true || input.commercialStatus === "OPTED_OUT")) return false;
  if (filters.minScore != null && result.score < filters.minScore) return false;
  if (filters.maxScore != null && result.score > filters.maxScore) return false;
  if (filters.band && result.band !== filters.band) return false;
  if (filters.commercialStatus && input.commercialStatus !== filters.commercialStatus) return false;
  if (filters.cae && input.cae !== filters.cae) return false;
  if (filters.cpv && !(input.cpvCodes ?? []).some((code) => code.startsWith(filters.cpv as string))) return false;
  if (filters.district && (input.district ?? "").toLowerCase() !== filters.district.toLowerCase()) return false;
  const hasContact = !!(input.email || input.phone);
  if (filters.contactAvailable && !hasContact) return false;
  const hasGenericEmail = input.hasGenericEmail === true || input.emailType === "geral";
  if (filters.genericEmail && !hasGenericEmail) return false;
  if (filters.minOpportunities != null && (input.matchingOpportunities ?? 0) < filters.minOpportunities) return false;
  const value = input.estimatedOpportunityValue ?? input.totalAwardValue ?? 0;
  if (filters.minValue != null && value < filters.minValue) return false;
  return true;
}

export { LEAD_SCORE_COMPONENTS };
export type { LeadScoreComponent, LeadScoringConfig, ScoreBandKey };
