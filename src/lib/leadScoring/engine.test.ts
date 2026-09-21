/**
 * Testes do Lead Scoring Engine (FASE 5).
 *
 * Cobrem: determinismo, cada sub-score, explicabilidade, portões, filtros e a
 * regra crítica de que opt-out nunca é elegível para contacto.
 */

import { describe, expect, it } from "vitest";
import {
  LEAD_SCORE_COMPONENTS,
  LEAD_SCORING_DEFAULT_CONFIG,
  assertConfigValid,
  bandLabel,
  scoreBand,
} from "./config";
import {
  type LeadScoringInput,
  buildExplanation,
  computeLeadScore,
  isEligibleForContact,
  matchesFilters,
  piecewiseScore,
  scoreCompanyFit,
  scoreContactQuality,
  scoreDataConfidence,
  scoreMarketValue,
  scoreOpportunityFit,
  scorePublicProcurementGap,
} from "./engine";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const cfg = LEAD_SCORING_DEFAULT_CONFIG;

function input(overrides: Partial<LeadScoringInput> = {}): LeadScoringInput {
  return { name: "Empresa Exemplo, Lda.", ...overrides };
}

describe("config", () => {
  it("pesos somam 1.0 e a configuração por omissão é válida", () => {
    const sum = LEAD_SCORE_COMPONENTS.reduce((acc, k) => acc + cfg.weights[k], 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(() => assertConfigValid(cfg)).not.toThrow();
  });

  it("rejeita pesos que não somam 1", () => {
    const broken = { ...cfg, weights: { ...cfg.weights, opportunity_fit: 0.5 } };
    expect(() => assertConfigValid(broken)).toThrow(/somar 1.0/);
  });

  it("mapeia scores para os portões corretos", () => {
    expect(scoreBand(0, cfg).key).toBe("LOW");
    expect(scoreBand(39, cfg).key).toBe("LOW");
    expect(scoreBand(40, cfg).key).toBe("MEDIUM");
    expect(scoreBand(59, cfg).key).toBe("MEDIUM");
    expect(scoreBand(60, cfg).key).toBe("HIGH");
    expect(scoreBand(79, cfg).key).toBe("HIGH");
    expect(scoreBand(80, cfg).key).toBe("VERY_HIGH");
    expect(scoreBand(100, cfg).key).toBe("VERY_HIGH");
    expect(bandLabel("VERY_HIGH", cfg)).toBe("Muito alta");
  });
});

describe("piecewiseScore", () => {
  const bp = cfg.opportunityFit.breakpoints;
  it("devolve 0 abaixo do primeiro ponto", () => {
    expect(piecewiseScore(0, bp)).toBe(0);
    expect(piecewiseScore(-5, bp)).toBe(0);
  });
  it("interpola linearmente entre pontos", () => {
    expect(piecewiseScore(2, bp)).toBe(38); // entre (1,25) e (3,50)
  });
  it("satura no último ponto", () => {
    expect(piecewiseScore(1_000, bp)).toBe(100);
  });
});

describe("sub-scores", () => {
  it("opportunity_fit aumenta com oportunidades e recência", () => {
    const semOportunidades = scoreOpportunityFit(input(), cfg, NOW);
    const comOportunidades = scoreOpportunityFit(input({ matchingOpportunities: 8 }), cfg, NOW);
    const recente = scoreOpportunityFit(input({ matchingOpportunities: 8, lastParticipation: "2026-09-15" }), cfg, NOW);
    expect(semOportunidades).toBe(0);
    expect(comOportunidades).toBeGreaterThan(semOportunidades);
    expect(recente).toBeGreaterThan(comOportunidades);
  });

  it("market_value cresce com o valor e satura", () => {
    expect(scoreMarketValue(input({ estimatedOpportunityValue: 0 }), cfg)).toBe(0);
    expect(scoreMarketValue(input({ estimatedOpportunityValue: 2_000_000 }), cfg)).toBe(100);
    const meio = scoreMarketValue(input({ estimatedOpportunityValue: 150_000 }), cfg);
    expect(meio).toBe(50);
  });

  it("contact_quality valoriza email empresarial validado", () => {
    expect(scoreContactQuality(input(), cfg)).toBe(0);
    const generico = scoreContactQuality(input({ hasGenericEmail: true }), cfg);
    const validado = scoreContactQuality(
      input({ hasGenericEmail: true, contactValidated: true, phone: "210000000", website: "https://x.pt" }),
      cfg,
    );
    expect(generico).toBeGreaterThan(0);
    expect(validado).toBeGreaterThan(generico);
    expect(validado).toBeLessThanOrEqual(100);
  });

  it("company_fit soma CPV, CAE, website, dimensão e distrito", () => {
    expect(scoreCompanyFit(input(), cfg)).toBe(0);
    const completo = scoreCompanyFit(
      input({ cpvCodes: ["45000000"], cae: "41200", website: "https://x.pt", estimatedSize: "grande", district: "Lisboa" }),
      cfg,
    );
    expect(completo).toBe(100);
  });

  it("public_procurement_gap é alto quando encaixa no ramo mas participa pouco", () => {
    const gapAlto = scorePublicProcurementGap(input({ cpvCodes: ["45000000"], participationCount: 0 }), cfg);
    const gapNulo = scorePublicProcurementGap(input({ cpvCodes: ["45000000"], participationCount: 10 }), cfg);
    expect(gapAlto).toBe(100);
    expect(gapNulo).toBe(0);
  });

  it("data_confidence reflete frescura e proveniência", () => {
    const recente = scoreDataConfidence(input({ lastVerifiedAt: "2026-09-20", website: "https://x.pt", hasContact: true }), cfg, NOW);
    const antigo = scoreDataConfidence(input({ lastVerifiedAt: "2024-01-01" }), cfg, NOW);
    const sem = scoreDataConfidence(input(), cfg, NOW);
    expect(recente).toBeGreaterThan(antigo);
    expect(antigo).toBeGreaterThan(sem);
  });
});

describe("computeLeadScore", () => {
  it("é determinístico: mesmo input ⇒ mesmo score", () => {
    const lead = input({ matchingOpportunities: 4, estimatedOpportunityValue: 200_000, hasGenericEmail: true, cpvCodes: ["45000000"] });
    const a = computeLeadScore(lead, cfg, NOW);
    const b = computeLeadScore(lead, cfg, NOW);
    expect(a).toEqual(b);
  });

  it("devolve todos os componentes e contribuições ponderadas a somar ao score", () => {
    const lead = input({
      matchingOpportunities: 6,
      estimatedOpportunityValue: 300_000,
      hasGenericEmail: true,
      contactValidated: true,
      phone: "210000000",
      website: "https://x.pt",
      cpvCodes: ["45000000"],
      cae: "41200",
      district: "Lisboa",
      estimatedSize: "medio",
      participationCount: 1,
      lastParticipation: "2026-09-01",
      lastVerifiedAt: "2026-09-15",
    });
    const result = computeLeadScore(lead, cfg, NOW);
    for (const key of LEAD_SCORE_COMPONENTS) {
      expect(result.components[key]).toBeGreaterThanOrEqual(0);
      expect(result.components[key]).toBeLessThanOrEqual(100);
    }
    const soma = LEAD_SCORE_COMPONENTS.reduce((acc, k) => acc + result.contributions[k], 0);
    expect(Math.round(soma)).toBe(result.score);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.configVersion).toBe("1.0.0");
  });

  it("produz um lead de alta pontuação com sinais fortes", () => {
    const lead = input({
      matchingOpportunities: 12,
      estimatedOpportunityValue: 900_000,
      hasGenericEmail: true,
      contactValidated: true,
      phone: "210000000",
      website: "https://x.pt",
      cpvCodes: ["45000000", "45200000"],
      cae: "41200",
      district: "Porto",
      estimatedSize: "grande",
      participationCount: 0,
      lastParticipation: "2026-09-20",
      lastVerifiedAt: "2026-09-20",
    });
    const result = computeLeadScore(lead, cfg, NOW);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.band).toBe("VERY_HIGH");
    expect(result.reasons.length).toBeGreaterThan(2);
  });

  it("produz um lead de baixa pontuação sem sinais", () => {
    const result = computeLeadScore(input(), cfg, NOW);
    expect(result.score).toBeLessThan(40);
    expect(result.band).toBe("LOW");
  });
});

describe("explicabilidade", () => {
  it("gera razões a partir de dados objetivos", () => {
    const lead = input({
      matchingOpportunities: 16,
      estimatedOpportunityValue: 420_000,
      hasGenericEmail: true,
      contactValidated: true,
      website: "https://x.pt",
      cpvCodes: ["45000000"],
      participationCount: 0,
    });
    const components = computeLeadScore(lead, cfg, NOW).components;
    const reasons = buildExplanation(lead, components);
    expect(reasons.some((r) => r.includes("16 oportunidades"))).toBe(true);
    expect(reasons.some((r) => r.includes("valor agregado"))).toBe(true);
    expect(reasons.some((r) => r.toLowerCase().includes("baixa participação"))).toBe(true);
  });

  it("não inventa razões quando não há dados", () => {
    const reasons = buildExplanation(input(), computeLeadScore(input(), cfg, NOW).components);
    expect(reasons).toContain("Sem contacto empresarial disponível");
  });
});

describe("elegibilidade e opt-out", () => {
  it("opt-out nunca é elegível para contacto (independentemente do score)", () => {
    const lead = input({ matchingOpportunities: 20, estimatedOpportunityValue: 2_000_000, optOut: true });
    const result = computeLeadScore(lead, cfg, NOW);
    expect(result.eligible).toBe(false);
    expect(result.blockedReason).toMatch(/Opt-out/);
    expect(result.score).toBeGreaterThan(0); // o score continua a ser calculado
  });

  it("commercial_status OPTED_OUT também bloqueia contacto", () => {
    const { eligible, blockedReason } = isEligibleForContact({ commercialStatus: "OPTED_OUT" }, cfg);
    expect(eligible).toBe(false);
    expect(blockedReason).toMatch(/Opt-out/);
  });

  it("prospect sem opt-out é elegível", () => {
    const { eligible, blockedReason } = isEligibleForContact({ commercialStatus: "NEW" }, cfg);
    expect(eligible).toBe(true);
    expect(blockedReason).toBeNull();
  });
});

describe("matchesFilters", () => {
  const strong = computeLeadScore(
    input({
      matchingOpportunities: 8,
      estimatedOpportunityValue: 300_000,
      hasGenericEmail: true,
      email: "geral@empresa.pt",
      district: "Lisboa",
      cae: "41200",
      cpvCodes: ["45000000"],
    }),
    cfg,
    NOW,
  );
  const strongInput = input({
    matchingOpportunities: 8,
    estimatedOpportunityValue: 300_000,
    hasGenericEmail: true,
    email: "geral@empresa.pt",
    district: "Lisboa",
    cae: "41200",
    cpvCodes: ["45000000"],
  });

  it("filtra por portão e score mínimo", () => {
    expect(matchesFilters({ input: strongInput, result: strong }, { minScore: strong.score })).toBe(true);
    expect(matchesFilters({ input: strongInput, result: strong }, { minScore: strong.score + 5 })).toBe(false);
    expect(matchesFilters({ input: strongInput, result: strong }, { band: strong.band })).toBe(true);
  });

  it("filtra por CAE, CPV, distrito, contacto e email genérico", () => {
    expect(matchesFilters({ input: strongInput, result: strong }, { cae: "41200" })).toBe(true);
    expect(matchesFilters({ input: strongInput, result: strong }, { cae: "99999" })).toBe(false);
    expect(matchesFilters({ input: strongInput, result: strong }, { cpv: "45" })).toBe(true);
    expect(matchesFilters({ input: strongInput, result: strong }, { cpv: "99" })).toBe(false);
    expect(matchesFilters({ input: strongInput, result: strong }, { district: "lisboa" })).toBe(true);
    expect(matchesFilters({ input: strongInput, result: strong }, { contactAvailable: true })).toBe(true);
    expect(matchesFilters({ input: strongInput, result: strong }, { genericEmail: true })).toBe(true);
  });

  it("filtra por nº de oportunidades e valor mínimo", () => {
    expect(matchesFilters({ input: strongInput, result: strong }, { minOpportunities: 10 })).toBe(false);
    expect(matchesFilters({ input: strongInput, result: strong }, { minOpportunities: 5 })).toBe(true);
    expect(matchesFilters({ input: strongInput, result: strong }, { minValue: 500_000 })).toBe(false);
    expect(matchesFilters({ input: strongInput, result: strong }, { minValue: 100_000 })).toBe(true);
  });

  it("exclui opt-out por omissão", () => {
    const optedOut = input({ optOut: true, email: "x@y.pt" });
    const result = computeLeadScore(optedOut, cfg, NOW);
    expect(matchesFilters({ input: optedOut, result }, {})).toBe(false);
    expect(matchesFilters({ input: optedOut, result }, { includeOptedOut: true })).toBe(true);
  });
});
