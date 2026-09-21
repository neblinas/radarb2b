import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from "@/lib/supabase";
import {
  addCaeCpvMapping,
  bucketCandidate,
  candidateBucketLabel,
  distributionTotal,
  isActionableCandidate,
  listProspectDiscoveryRuns,
  runProspectDiscovery,
  type DiscoveryCandidate,
} from "./prospectDiscovery";

function candidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    company_id: "c1",
    name: "Empresa X",
    nif: "123456789",
    total_score: 62,
    participation_count: 5,
    participation_12m: 3,
    award_count: 2,
    total_award_value: 250000,
    last_participation: "2026-08-01",
    cpv_codes: ["72000000"],
    categories: ["SOFTWARE"],
    district: "Lisboa",
    cae_compatible: null,
    competitor_count: 2,
    reasons: ["Setor relevante em contratação pública (SOFTWARE)"],
    inferred_size: "medio",
    is_duplicate: false,
    is_opt_out: false,
    ...overrides,
  };
}

describe("prospectDiscovery — classificação de candidatos", () => {
  it("considera novo quando há sinal, sem duplicado nem opt-out", () => {
    expect(bucketCandidate(candidate())).toBe("new");
    expect(isActionableCandidate(candidate())).toBe(true);
  });

  it("classifica duplicado antes de opt-out e sinal", () => {
    expect(bucketCandidate(candidate({ is_duplicate: true, is_opt_out: true }))).toBe("duplicate");
    expect(isActionableCandidate(candidate({ is_duplicate: true }))).toBe(false);
  });

  it("classifica opt-out", () => {
    expect(bucketCandidate(candidate({ is_opt_out: true }))).toBe("opt_out");
    expect(isActionableCandidate(candidate({ is_opt_out: true }))).toBe(false);
  });

  it("classifica sem sinal suficiente quando não há motivos", () => {
    expect(bucketCandidate(candidate({ reasons: [] }))).toBe("low_signal");
    expect(isActionableCandidate(candidate({ reasons: [] }))).toBe(false);
  });

  it("tem rótulo legível para cada bucket", () => {
    for (const bucket of ["new", "duplicate", "opt_out", "low_signal"] as const) {
      expect(candidateBucketLabel[bucket]).toBeTruthy();
    }
  });
});

describe("prospectDiscovery — distribuição de scores", () => {
  it("soma todos os portões", () => {
    expect(distributionTotal({ lt40: 3, "40_59": 5, "60_79": 2, gte80: 1 })).toBe(11);
  });
});

describe("prospectDiscovery — I/O", () => {
  it("runProspectDiscovery passa os critérios esperados", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        run_id: "r1",
        companies_analyzed: 10,
        candidates_generated: 4,
        new_prospects: 4,
        skipped_duplicates: 2,
        skipped_opt_out: 1,
        skipped_low_signal: 0,
        score_distribution: { lt40: 0, "40_59": 1, "60_79": 2, gte80: 1 },
        candidates: [candidate()],
      },
      error: null,
    } as never);

    const result = await runProspectDiscovery({ minScore: 50, radarCategory: "SOFTWARE", sampleLimit: 10 });

    expect(result.new_prospects).toBe(4);
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("run_prospect_discovery", {
      p_min_score: 50,
      p_radar_category: "SOFTWARE",
      p_district: null,
      p_min_opportunities: 1,
      p_min_value: null,
      p_sample_limit: 10,
    });
  });

  it("runProspectDiscovery aplica defaults seguros", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: {}, error: null } as never);
    await runProspectDiscovery();
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("run_prospect_discovery", expect.objectContaining({
      p_min_score: 40,
      p_min_opportunities: 1,
      p_sample_limit: null,
    }));
  });

  it("runProspectDiscovery propaga erros do backend", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error("denied") } as never);
    await expect(runProspectDiscovery()).rejects.toThrow("denied");
  });

  it("listProspectDiscoveryRuns devolve a lista", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [{ id: "r1" }], error: null } as never);
    const list = await listProspectDiscoveryRuns(5);
    expect(list).toHaveLength(1);
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("prospect_discovery_runs_list", { p_limit: 5 });
  });

  it("addCaeCpvMapping exige fonte e envia os campos", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { id: "m1" }, error: null } as never);
    await addCaeCpvMapping({ caeCode: "62010", cpvCode: "72000000", source: "Estudo setorial 2026" });
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("cae_cpv_map_add", {
      p_cae_code: "62010",
      p_cpv_code: "72000000",
      p_source: "Estudo setorial 2026",
      p_radar_category: null,
      p_confidence: 100,
      p_note: null,
    });
  });
});

/**
 * Amostra pequena: 8 empresas com forma real (2 duplicados, 1 opt-out,
 * 1 sem sinal). Recalcula o relatório a partir da classificação — exatamente
 * os contadores que o backend devolve em `run_prospect_discovery`.
 */
describe("prospectDiscovery — execução com amostra pequena", () => {
  const sample: DiscoveryCandidate[] = [
    candidate({ company_id: "a", total_score: 84, reasons: ["Setor relevante em contratação pública (SOFTWARE)", "Valor adjudicado relevante"] }),
    candidate({ company_id: "b", total_score: 71, reasons: ["Setor relevante em contratação pública (REDES)"] }),
    candidate({ company_id: "c", total_score: 62, reasons: ["Frequência de concursos nos últimos 12 meses"] }),
    candidate({ company_id: "d", total_score: 45, reasons: ["CAE compatível: 62010"] }),
    candidate({ company_id: "e", total_score: 30, is_duplicate: true, reasons: ["Setor relevante em contratação pública (TELECOM)"] }),
    candidate({ company_id: "f", total_score: 55, is_duplicate: true, reasons: ["Valor adjudicado relevante"] }),
    candidate({ company_id: "g", total_score: 66, is_opt_out: true, reasons: ["Setor relevante em contratação pública (CLOUD/DATA)"] }),
    candidate({ company_id: "h", total_score: 35, reasons: [] }),
  ];

  it("produz os contadores e a distribuição esperados", () => {
    const newProspects = sample.filter(isActionableCandidate).length;
    const duplicates = sample.filter((c) => bucketCandidate(c) === "duplicate").length;
    const optOut = sample.filter((c) => bucketCandidate(c) === "opt_out").length;
    const lowSignal = sample.filter((c) => bucketCandidate(c) === "low_signal").length;

    expect(sample.length).toBe(8); // empresas analisadas
    expect(newProspects).toBe(4); // prospects novos
    expect(duplicates).toBe(2); // ignorados por duplicação
    expect(optOut).toBe(1); // ignorados por opt-out
    expect(lowSignal).toBe(1); // sem sinal suficiente

    const distribution = {
      lt40: sample.filter((c) => c.total_score < 40).length,
      "40_59": sample.filter((c) => c.total_score >= 40 && c.total_score < 60).length,
      "60_79": sample.filter((c) => c.total_score >= 60 && c.total_score < 80).length,
      gte80: sample.filter((c) => c.total_score >= 80).length,
    };
    expect(distribution).toEqual({ lt40: 2, "40_59": 2, "60_79": 3, gte80: 1 });
    expect(distributionTotal(distribution)).toBe(8);
  });

  it("não reativa opt-out nem duplica existentes", () => {
    const actionableIds = sample.filter(isActionableCandidate).map((c) => c.company_id);
    expect(actionableIds).toEqual(["a", "b", "c", "d"]);
    expect(actionableIds).not.toContain("e"); // duplicado
    expect(actionableIds).not.toContain("f"); // duplicado
    expect(actionableIds).not.toContain("g"); // opt-out
    expect(actionableIds).not.toContain("h"); // sem sinal
  });
});
