import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { checkSuppressed } from "./suppression";

describe("checkSuppressed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("usa a RPC segura por sessão (nunca envia o id da organização)", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    await checkSuppressed({ email: "Comercial@Empresa.PT", companyId: "company-1" });

    expect(mocks.rpc).toHaveBeenCalledWith("is_suppressed_session", {
      p_email: "Comercial@Empresa.PT",
      p_domain: "empresa.pt",
      p_company_id: "company-1",
    });
    // Garante que não regride para a RPC antiga nem passa p_organization_id null.
    expect(mocks.rpc).not.toHaveBeenCalledWith("is_suppressed", expect.anything());
  });

  it("devolve true quando o contacto está suprimido", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await checkSuppressed({ email: "optout@empresa.pt" })).toBe(true);
  });

  it("falha em segurança (true) quando a RPC devolve erro", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    expect(await checkSuppressed({ email: "a@empresa.pt" })).toBe(true);
  });

  it("falha em segurança (true) quando a chamada lança", async () => {
    mocks.rpc.mockRejectedValue(new Error("network"));
    expect(await checkSuppressed({ email: "a@empresa.pt" })).toBe(true);
  });

  it("usa o domínio derivado do email quando p_domain é omitido", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    await checkSuppressed({ email: "x@Sub.Empresa.PT" });

    expect(mocks.rpc).toHaveBeenCalledWith("is_suppressed_session", {
      p_email: "x@Sub.Empresa.PT",
      p_domain: "sub.empresa.pt",
      p_company_id: null,
    });
  });
});
