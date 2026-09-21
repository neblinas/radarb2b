import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from "@/lib/supabase";
import {
  canRunManagementAction,
  formatEuroShort,
  getManagementDetail,
  getManagementMetrics,
  isContactBlocked,
  listManagementProspects,
  managementActionLabel,
  managementPages,
  managementTotal,
  runManagementAction,
  type ProspectManagementRow,
} from "./prospectManagement";

function row(overrides: Partial<ProspectManagementRow> = {}): ProspectManagementRow {
  return {
    id: "p1",
    name: "Empresa Alfa",
    nif: "500100100",
    cae: "62010",
    district: "Lisboa",
    municipality: "Lisboa",
    localidade: "Lisboa",
    estimated_size: "medio",
    website: "https://alfa.pt",
    domain: "alfa.pt",
    email: "geral@alfa.pt",
    email_type: "geral",
    enrichment_status: "CONTACT_FOUND",
    commercial_status: "NEW",
    commercial_score: 72,
    score_reason: "Bom encaixe",
    matching_opportunities: 3,
    estimated_opportunity_value: 250000,
    cpv_codes: ["72000000"],
    categories: ["SOFTWARE"],
    opt_out: false,
    contact_count: 0,
    last_contacted_at: null,
    enriched: true,
    has_public_contact: true,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-10T10:00:00Z",
    total_count: 42,
    ...overrides,
  };
}

describe("prospectManagement — bloqueio de contacto", () => {
  it("bloqueia com opt-out explícito", () => {
    expect(isContactBlocked({ opt_out: true, commercial_status: "NEW" })).toBe(true);
  });

  it("bloqueia com estado OPTED_OUT mesmo sem flag", () => {
    expect(isContactBlocked({ opt_out: false, commercial_status: "OPTED_OUT" })).toBe(true);
  });

  it("permite prospects ativos", () => {
    expect(isContactBlocked({ opt_out: false, commercial_status: "ELIGIBLE" })).toBe(false);
  });
});

describe("prospectManagement — elegibilidade de ações", () => {
  const active = { opt_out: false, commercial_status: "NEW" };
  const blocked = { opt_out: true, commercial_status: "OPTED_OUT" };

  it("OPT_OUT e REJECT são sempre permitidos", () => {
    for (const prospect of [active, blocked]) {
      expect(canRunManagementAction("OPT_OUT", prospect)).toBe(true);
      expect(canRunManagementAction("REJECT", prospect)).toBe(true);
    }
  });

  it("nunca reativa prospects com opt-out", () => {
    expect(canRunManagementAction("APPROVE", blocked)).toBe(false);
    expect(canRunManagementAction("READY_AUTOPILOT", blocked)).toBe(false);
    expect(canRunManagementAction("RESET", blocked)).toBe(false);
  });

  it("permite aprovar/pronto para o Autopilot em prospects ativos", () => {
    expect(canRunManagementAction("APPROVE", active)).toBe(true);
    expect(canRunManagementAction("READY_AUTOPILOT", active)).toBe(true);
  });
});

describe("prospectManagement — helpers de paginação e formatação", () => {
  it("lê o total da listagem", () => {
    expect(managementTotal([row({ total_count: 42 })])).toBe(42);
    expect(managementTotal([])).toBe(0);
  });

  it("calcula o número de páginas", () => {
    expect(managementPages(42, 25)).toBe(2);
    expect(managementPages(0, 25)).toBe(1);
    expect(managementPages(50, 25)).toBe(2);
  });

  it("formata valores em euros", () => {
    expect(formatEuroShort(null)).toBe("—");
    expect(formatEuroShort(250000)).toContain("250");
  });

  it("tem rótulo legível para cada ação", () => {
    for (const action of ["APPROVE", "REJECT", "READY_AUTOPILOT", "OPT_OUT", "RESET"] as const) {
      expect(managementActionLabel[action]).toBeTruthy();
    }
  });
});

describe("prospectManagement — I/O", () => {
  it("getManagementMetrics devolve as métricas", async () => {
    const metrics = { total: 10, opted_out: 2 };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: metrics, error: null } as never);
    const result = await getManagementMetrics();
    expect(result).toBe(metrics);
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("prospect_management_metrics");
  });

  it("listManagementProspects envia os filtros esperados", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [row()], error: null } as never);
    const rows = await listManagementProspects({
      query: "alfa",
      commercialStatus: "NEW",
      minScore: 50,
      includeOptOut: true,
      page: 2,
      pageSize: 25,
    });
    expect(rows).toHaveLength(1);
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("prospect_management_list", {
      p_query: "alfa",
      p_commercial_status: "NEW",
      p_enrichment_status: null,
      p_min_score: 50,
      p_max_score: null,
      p_cae: null,
      p_cpv: null,
      p_district: null,
      p_category: null,
      p_email_type: null,
      p_has_website: false,
      p_has_email: false,
      p_opt_out: true,
      p_min_opportunities: null,
      p_min_value: null,
      p_page: 2,
      p_page_size: 25,
    });
  });

  it("listManagementProspects aplica defaults seguros (exclui opt-out)", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);
    await listManagementProspects();
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith(
      "prospect_management_list",
      expect.objectContaining({ p_opt_out: false, p_page: 1, p_page_size: 25 }),
    );
  });

  it("getManagementDetail devolve o detalhe", async () => {
    const detail = { id: "p1", name: "Empresa Alfa", contacts: [] };
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: detail, error: null } as never);
    const result = await getManagementDetail("p1");
    expect(result).toBe(detail);
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("prospect_management_detail", { p_id: "p1" });
  });

  it("runManagementAction envia ação e motivo", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never);
    await runManagementAction("p1", "OPT_OUT", "Pedido do titular");
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("prospect_management_action", {
      p_id: "p1",
      p_action: "OPT_OUT",
      p_reason: "Pedido do titular",
    });
  });

  it("propaga erros do backend", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error("denied") } as never);
    await expect(getManagementMetrics()).rejects.toThrow("denied");
  });
});
