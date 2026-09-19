import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProspectingDashboardPage from "@/app/backoffice/prospeccao/dashboard/page";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  push: vi.fn(),
  router: null as null | { push: ReturnType<typeof vi.fn> },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/backoffice/prospeccao/dashboard",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
      signOut: vi.fn(),
    },
    rpc: mocks.rpc,
  },
}));

const metricsPayload = {
  scope: "team",
  total: 12,
  assigned: 7,
  available: 240,
  overdue: 2,
  won: 3,
  lost: 1,
  do_not_contact: 0,
  by_status: [
    { status: "CONTACTED", count: 4 },
    { status: "WON", count: 3 },
  ],
  activities_30d: 9,
  top_prospects: [
    {
      company_id: "company-1",
      company_name: "Empresa Alfa",
      company_nif: "500100100",
      prospect_score: 88,
      status: "CONTACTED",
      assigned_to: "user-1",
      next_action_at: "2026-09-20T10:00:00Z",
    },
  ],
  upcoming_actions: [
    {
      prospect_id: "prospect-1",
      company_id: "company-1",
      company_name: "Empresa Alfa",
      status: "CONTACTED",
      next_action_at: "2026-09-20T10:00:00Z",
      assigned_to: "user-1",
    },
  ],
};

describe("ProspectingDashboardPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.router = { push: mocks.push };
    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: "user-1", email: "comercial@example.com", app_metadata: { role: "commercial_manager" } },
      },
    });
    mocks.rpc.mockResolvedValue({ data: metricsPayload, error: null });
  });

  it("bloqueia utilizadores sem role comercial", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-x", email: "cliente@example.com", app_metadata: { role: "customer" } } },
    });

    render(<ProspectingDashboardPage />);

    expect(await screen.findByText("Área reservada.")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("mostra os KPIs agregados da prospeção", async () => {
    render(<ProspectingDashboardPage />);

    expect(await screen.findByText("Pulso da prospeção")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("prospect_metrics", { p_scope: "team" });
    expect(screen.getByText("Prospects assumidos")).toBeInTheDocument();
    expect(screen.getByText("Próximas ações vencidas")).toBeInTheDocument();
    expect(screen.getAllByText("Empresa Alfa").length).toBeGreaterThan(0);
    expect(screen.getByText("88")).toBeInTheDocument();
  });

  it("avisa quando a migração de métricas não está disponível", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });

    render(<ProspectingDashboardPage />);

    expect(
      await screen.findByText(/migração de métricas de prospeção/i),
    ).toBeInTheDocument();
  });
});
