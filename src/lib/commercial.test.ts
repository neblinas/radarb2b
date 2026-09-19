import { describe, expect, it, vi } from "vitest";
import {
  commissionKindLabel,
  commissionStatusLabel,
  formatEuro,
} from "@/lib/commercial";
import { supabase } from "@/lib/supabase";
import {
  acceptTerms,
  emailStatusLabel,
  fetchCurrentTerms,
  fetchMySentEmails,
  fetchMySender,
  fetchMyTermsStatus,
  sendCommercialEmail,
  updateMySender,
} from "@/lib/commercial";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
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

  it("fetchMySender devolve a primeira linha ou null", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{ user_id: "u1", display_name: "João Silva", reply_to: null, signature_note: "x" }],
      error: null,
    } as never);
    const sender = await fetchMySender();
    expect(sender?.display_name).toBe("João Silva");
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("commercial_ensure_sender");
  });

  it("updateMySender envia os campos esperados", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { user_id: "u1", display_name: "Ana", reply_to: null, signature_note: "x" },
      error: null,
    } as never);
    const sender = await updateMySender({ displayName: "Ana" });
    expect(sender.display_name).toBe("Ana");
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith("commercial_update_sender", {
      p_display_name: "Ana",
      p_reply_to: null,
      p_signature_note: null,
    });
  });

  it("fetchMySentEmails devolve a lista", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{ id: "m1", to_email: "a@b.pt", subject: "Oi", status: "sent" }],
      error: null,
    } as never);
    const list = await fetchMySentEmails();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("sent");
  });

  it("sendCommercialEmail invoca a edge function com o payload", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { ok: true, id: "m9" },
      error: null,
    } as never);
    const result = await sendCommercialEmail({ to: "a@b.pt", subject: "Teste", body: "Olá" });
    expect(result.id).toBe("m9");
    expect(vi.mocked(supabase.functions.invoke)).toHaveBeenCalledWith(
      "send-commercial-email",
      expect.objectContaining({ body: expect.objectContaining({ to: "a@b.pt" }) }),
    );
  });

  it("sendCommercialEmail propaga o erro da função", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { error: "Destinatário inválido" },
      error: null,
    } as never);
    await expect(sendCommercialEmail({ to: "x", subject: "s", body: "b" })).rejects.toThrow("Destinatário inválido");
  });

  it("tem rótulo para os estados de email", () => {
    for (const status of ["queued", "sent", "failed"]) {
      expect(emailStatusLabel[status]).toBeTruthy();
    }
  });
});

