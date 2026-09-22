import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from "@/lib/supabase";
import { fetchRecentSent, type SentOutreach } from "./automation";

function row(overrides: Partial<SentOutreach> = {}): SentOutreach {
  return {
    id: "m1",
    enrollment_id: "e1",
    company_id: "c1",
    company_name: "Empresa Alfa",
    to_email: "geral@alfa.pt",
    subject: "Uma oportunidade em contratação pública para a Empresa Alfa",
    step_position: 1,
    sent_at: "2026-09-22T16:10:00.000Z",
    created_at: "2026-09-22T16:09:00.000Z",
    ...overrides,
  };
}

describe("automation — histórico de enviados (I/O)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetchRecentSent usa a RPC e passa o limite pedido", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [row()], error: null } as never);
    const list = await fetchRecentSent(25);
    expect(list).toHaveLength(1);
    expect(list[0].to_email).toBe("geral@alfa.pt");
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("outreach_recent_sent", { p_limit: 25 });
  });

  it("fetchRecentSent usa o limite por omissão (50)", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [], error: null } as never);
    await fetchRecentSent();
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("outreach_recent_sent", { p_limit: 50 });
  });

  it("fetchRecentSent devolve lista vazia quando não há dados", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never);
    const list = await fetchRecentSent();
    expect(list).toEqual([]);
  });

  it("fetchRecentSent propaga erros do backend", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error("denied") } as never);
    await expect(fetchRecentSent()).rejects.toThrow("denied");
  });
});
