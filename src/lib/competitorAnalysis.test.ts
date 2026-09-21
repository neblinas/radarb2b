import { afterEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import {
  fetchCompanyCompetitors,
  fetchCompanyCompetitionSummary,
  fetchCurrentPlan,
  fetchProcedureCompetitors,
  formatDate,
  formatEuro,
  planLabel,
  searchCompanies,
} from "./competitorAnalysis";
import { trackEvent } from "./analytics";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe("competitorAnalysis formatting", () => {
  it("formats euro values from numbers and numeric strings", () => {
    expect(formatEuro(1500)).toContain("€");
    expect(formatEuro("2000")).toContain("€");
    expect(formatEuro(0)).toContain("€");
  });

  it("returns a placeholder for missing or invalid euro values", () => {
    expect(formatEuro(null)).toBe("—");
    expect(formatEuro(undefined)).toBe("—");
    expect(formatEuro("não é número")).toBe("—");
  });

  it("formats dates safely", () => {
    expect(formatDate("2026-09-10")).toMatch(/2026/);
    expect(formatDate(null)).toBe("—");
    // Valor inválido é devolvido como veio.
    expect(formatDate("data-invalida")).toBe("data-invalida");
  });

  it("exposes known plan labels", () => {
    expect(planLabel.free).toBe("Free");
    expect(planLabel.starter).toBe("Starter");
    expect(planLabel.pro).toBe("Pro");
  });
});

describe("competitorAnalysis RPC wrappers", () => {
  it("fetchCurrentPlan recorre ao client_current_plan", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: "pro", error: null } as never);
    expect(await fetchCurrentPlan()).toBe("pro");
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("client_current_plan");
  });

  it("fetchCurrentPlan cai em free quando a RPC devolve null", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never);
    expect(await fetchCurrentPlan()).toBe("free");
  });

  it("fetchCompanyCompetitors envia empresa e limite", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);
    await fetchCompanyCompetitors("company-1", 10);
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("company_competitors", {
      p_company_id: "company-1",
      p_limit: 10,
    });
  });

  it("fetchCompanyCompetitionSummary devolve o resumo", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        company_id: "c1",
        participations: 5,
        has_company: true,
        competitor_count: 3,
        competitor_count_12m: 1,
        most_frequent_competitor: null,
      },
      error: null,
    } as never);

    const summary = await fetchCompanyCompetitionSummary("c1");
    expect(summary?.competitor_count).toBe(3);
  });

  it("fetchProcedureCompetitors devolve a lista", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{ company_id: "c1", name: "A", nif: "1", role: "CONCORRENTE", won: false }],
      error: null,
    } as never);

    const rows = await fetchProcedureCompetitors("p1");
    expect(rows).toHaveLength(1);
    expect(rows[0].won).toBe(false);
  });

  it("searchCompanies ignora termos curtos sem consultar a base de dados", async () => {
    const from = vi.mocked(supabase.from);
    from.mockClear();
    expect(await searchCompanies("a")).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("analytics trackEvent", () => {
  const gtagKey = "gtag";

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[gtagKey];
    vi.restoreAllMocks();
  });

  it("não falha quando gtag não existe (sem consentimento)", () => {
    expect(() => trackEvent("evento", { a: 1 })).not.toThrow();
  });

  it("encaminha eventos para gtag quando disponível", () => {
    const gtag = vi.fn();
    (window as unknown as Record<string, unknown>)[gtagKey] = gtag;

    trackEvent("competitor_analysis_run", { plan: "pro", company_id: "abc" });

    expect(gtag).toHaveBeenCalledWith("event", "competitor_analysis_run", {
      plan: "pro",
      company_id: "abc",
    });
  });
});
