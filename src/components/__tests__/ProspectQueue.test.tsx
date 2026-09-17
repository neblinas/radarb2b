import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProspectQueue from "@/components/ProspectQueue";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
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
    rpc: mocks.rpc,
    auth: {
      getUser: mocks.getUser,
    },
  },
}));

function prospectRow(overrides: Record<string, unknown> = {}) {
  return {
    company_id: "company-1",
    company_name: "Empresa Alfa",
    company_nif: "500100100",
    prospect_score: 72,
    participation_count: 30,
    participation_12m: 9,
    award_count: 6,
    total_award_value: 350000,
    last_participation: "2026-09-01",
    cpv_codes: ["45200000"],
    prospect_id: null,
    prospect_status: null,
    assigned_to: null,
    assigned_at: null,
    next_action_at: null,
    total_count: 1,
    ...overrides,
  };
}

describe("ProspectQueue", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("apresenta a fila e sugere o próximo prospect quente", async () => {
    mocks.rpc.mockResolvedValue({ data: [prospectRow()], error: null });

    render(<ProspectQueue />);

    expect(await screen.findByText("Empresa Alfa")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "prospect_queue",
      expect.objectContaining({ p_assignment: "available", p_page: 1 }),
    );
    expect(screen.getByText(/Próximo prospect: Empresa Alfa/)).toBeInTheDocument();
  });

  it("assume um prospect disponível através da RPC", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [prospectRow()], error: null })
      .mockResolvedValueOnce({ data: prospectRow(), error: null })
      .mockResolvedValueOnce({ data: [prospectRow({ assigned_to: "user-1" })], error: null });

    render(<ProspectQueue />);

    const claimButton = await screen.findByRole("button", { name: /Assumir/i });
    await userEvent.click(claimButton);

    expect(mocks.rpc).toHaveBeenCalledWith("prospect_claim", { p_company_id: "company-1" });
  });

  it("remove um prospect assumido por mim através da RPC", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [prospectRow({ assigned_to: "user-1", prospect_id: "prospect-1" })], error: null })
      .mockResolvedValueOnce({ data: prospectRow(), error: null })
      .mockResolvedValueOnce({ data: [prospectRow()], error: null });

    render(<ProspectQueue />);

    const releaseButton = await screen.findByRole("button", { name: /Remover/i });
    await userEvent.click(releaseButton);

    expect(mocks.rpc).toHaveBeenCalledWith("prospect_release", { p_prospect_id: "prospect-1" });
  });

  it("não mostra botão de remover para prospects de outro comercial", async () => {
    mocks.rpc.mockResolvedValue({ data: [prospectRow({ assigned_to: "user-2", prospect_id: "prospect-2" })], error: null });

    render(<ProspectQueue />);

    expect(await screen.findByText("Empresa Alfa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remover/i })).not.toBeInTheDocument();
  });

  it("mostra mensagem quando a migração não está aplicada", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "not found" } });

    render(<ProspectQueue />);

    expect(
      await screen.findByText(/migração de prospeção já foi executada/i),
    ).toBeInTheDocument();
  });
});
