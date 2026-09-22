import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProspectingManagementPage from "@/app/backoffice/prospeccao/gestao/page";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/backoffice/prospeccao/gestao",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: mocks.getUser, signOut: vi.fn() },
    rpc: mocks.rpc,
  },
}));

const row = {
  id: "prospect-1",
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
  commercial_status: "ELIGIBLE",
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
};

const findOptions = { timeout: 3000 };

function setupRpc(overrides: Record<string, unknown> = {}) {
  mocks.rpc.mockImplementation((name: string) => {
    if (overrides[name]) return Promise.resolve(overrides[name]);
    if (name === "prospect_management_metrics") {
      return Promise.resolve({
        data: { total: 42, enriched: 30, with_public_contact: 18, ready_for_autopilot: 5, contacted: 7, converted: 2, opted_out: 3 },
        error: null,
      });
    }
    if (name === "prospect_categories") return Promise.resolve({ data: ["SOFTWARE"], error: null });
    return Promise.resolve({ data: [row], error: null });
  });
}

describe("ProspectingManagementPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "gestor@example.com", app_metadata: { role: "commercial_manager" } } },
    });
    setupRpc();
  });

  it("bloqueia utilizadores sem role comercial", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-x", email: "cliente@example.com", app_metadata: { role: "customer" } } },
    });

    render(<ProspectingManagementPage />);

    expect(await screen.findByText("Área reservada.", undefined, findOptions)).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith("prospect_management_list", expect.anything());
  });

  it("mostra métricas e a listagem de gestão", async () => {
    render(<ProspectingManagementPage />);

    expect(await screen.findByText("Revisão e operação do funil de prospects")).toBeInTheDocument();
    expect(await screen.findByText("Empresa Alfa", undefined, findOptions)).toBeInTheDocument();
    expect(screen.getByText("Total de prospects")).toBeInTheDocument();
    expect(screen.getByText("Prontos para Autopilot")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prospect_management_list",
      expect.objectContaining({ p_page: 1, p_page_size: 25, p_opt_out: false }),
    );
  });

  it("avisa quando a migração de gestão não está disponível", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "prospect_categories") return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: null, error: { message: "function does not exist" } });
    });

    render(<ProspectingManagementPage />);

    expect(
      await screen.findByText(/migração `20261002090000_prospecting_management.sql`/i, undefined, findOptions),
    ).toBeInTheDocument();
  });

  it("aplica uma ação em lote aos prospects selecionados", async () => {
    const user = userEvent.setup();
    setupRpc({
      prospect_management_metrics: { data: { total: 42 }, error: null },
      prospect_categories: { data: [], error: null },
      prospect_management_action_bulk: {
        data: [
          {
            prospect_id: "prospect-1",
            applied: true,
            commercial_status: "READY_FOR_AUTOPILOT",
            enrichment_status: "READY_FOR_AUTOPILOT",
            opt_out: false,
            error: null,
          },
        ],
        error: null,
      },
    });

    render(<ProspectingManagementPage />);
    await screen.findByText("Empresa Alfa", undefined, findOptions);

    await user.click(screen.getByLabelText("Selecionar todos os prospects da página"));
    expect(screen.getByText("1 selecionado(s)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preparar para Autopilot" }));
    await user.click(screen.getByRole("button", { name: /Confirmar em lote/ }));

    await waitFor(
      () => expect(mocks.rpc.mock.calls.some(([name]) => name === "prospect_management_action_bulk")).toBe(true),
      { timeout: 2000 },
    );

    const bulkCall = mocks.rpc.mock.calls.find(([name]) => name === "prospect_management_action_bulk");
    expect(bulkCall?.[1]).toEqual({ p_ids: ["prospect-1"], p_action: "READY_AUTOPILOT", p_reason: null });
    expect(await screen.findByText(/aplicado\(s\) com sucesso/, undefined, findOptions)).toBeInTheDocument();
  }, 15000);

  it("mostra o detalhe dos prospects bloqueados no lote", async () => {
    const user = userEvent.setup();
    setupRpc({
      prospect_management_metrics: { data: { total: 42 }, error: null },
      prospect_categories: { data: [], error: null },
      prospect_management_action_bulk: {
        data: [
          {
            prospect_id: "prospect-1",
            applied: false,
            commercial_status: null,
            enrichment_status: null,
            opt_out: null,
            error: "Prospecto com opt-out — não pode ser reativado",
          },
        ],
        error: null,
      },
    });

    render(<ProspectingManagementPage />);
    await screen.findByText("Empresa Alfa", undefined, findOptions);

    await user.click(screen.getByLabelText("Selecionar Empresa Alfa"));
    await user.click(screen.getByRole("button", { name: "Aprovar" }));
    await user.click(screen.getByRole("button", { name: /Confirmar em lote/ }));

    expect(await screen.findByText(/Prospecto com opt-out/, undefined, findOptions)).toBeInTheDocument();
  });
});
