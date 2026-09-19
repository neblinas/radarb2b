import { describe, expect, it, vi } from "vitest";
import {
  commissionKindLabel,
  commissionStatusLabel,
  formatEuro,
} from "@/lib/commercial";
import { supabase } from "@/lib/supabase";
import {
  acceptTerms,
  fetchCurrentTerms,
  fetchMyTermsStatus,
} from "@/lib/commercial";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: vi.fn() }, rpc: vi.fn() },
}));

describe("commercial lib", () => {
  it("formata euros em pt-PT", () => {
    const value = formatEuro(19);
    expect(value).toContain("19");
    expect(value).toMatch(/€|EUR/);
  });

  it("tem rótulo para todos os tipos de comissão relevantes", () => {
    for (const kind of [
      "direct_first",
      "direct_follow",
      "direct_annual",
      "retention",
      "team_second_month",
      "team_annual",
      "team_level2",
      "recruiter",
    ]) {
      expect(commissionKindLabel[kind]).toBeTruthy();
    }
  });

  it("tem rótulo para todos os estados de comissão", () => {
    for (const status of ["pending", "approved", "paid", "cancelled"]) {
      expect(commissionStatusLabel[status]).toBeTruthy();
    }
  });

  it("fetchCurrentTerms devolve a primeira versão ou null", async () => {
    const rpc = vi.mocked(supabase.rpc);
    rpc.mockResolvedValueOnce({
      data: [{ terms_id: "t1", version: 1, title: "T", body: "B", effective_from: "2026-09-23" }],
      error: null,
    } as never);

    const terms = await fetchCurrentTerms();
    expect(terms?.version).toBe(1);
    expect(rpc).toHaveBeenCalledWith("commercial_current_terms");
  });

  it("fetchCurrentTerms devolve null quando não há termos", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);
    expect(await fetchCurrentTerms()).toBeNull();
  });

  it("fetchMyTermsStatus devolve o estado de aceitação", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{ accepted: false, accepted_version: null, current_version: 2 }],
      error: null,
    } as never);

    const status = await fetchMyTermsStatus();
    expect(status?.accepted).toBe(false);
    expect(status?.current_version).toBe(2);
  });

  it("acceptTerms devolve a versão aceite", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 3, error: null } as never);
    expect(await acceptTerms()).toBe(3);
  });
});

