import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
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

describe("ProspectingManagementPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "gestor@example.com", app_metadata: { role: "commercial_manager" } } },
    });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "prospect_management_metrics") {
        return Promise.resolve({ data: { total: 42, enriched: 30, with_public_contact: 18, ready_for_autopilot: 5, contacted: 7, converted: 2, opted_out: 3 }, error: null });
      }
      if (name === "prospect_categories") return Promise.resolve({ data: ["SOFTWARE"], error: null });
      return Promise.resolve({ data: [row], error: null });
    });
  });

  it("bloqueia utilizadores sem role comercial", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-x", email: "cliente@example.com", app_metadata: { role: "customer" } } },
    });

    render(<ProspectingManagementPage />);

    expect(await screen.findByText("Área reservada.")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith("prospect_management_list", expect.anything());
  });

  it("mostra métricas e a listagem de gestão", async () => {
    render(<ProspectingManagementPage />);

    expect(await screen.findByText("Revisão e operação do funil de prospects")).toBeInTheDocument();
    expect(await screen.findByText("Empresa Alfa")).toBeInTheDocument();
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

    expect(await screen.findByText(/migração `20261002090000_prospecting_management.sql`/i)).toBeInTheDocument();
  });
});
