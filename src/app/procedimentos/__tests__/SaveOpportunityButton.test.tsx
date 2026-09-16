import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SaveOpportunityButton from "@/app/procedimentos/SaveOpportunityButton";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    rpc: mocks.rpc,
  },
}));

describe("SaveOpportunityButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: "user-test" },
      },
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("pede autenticação antes de guardar", async () => {
    const user = userEvent.setup();
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    render(<SaveOpportunityButton procedureId="procedure-1" />);

    await user.click(
      screen.getByRole("button", { name: "Guardar oportunidade" }),
    );

    expect(
      await screen.findByText(
        "Inicia sessão para guardar esta oportunidade.",
      ),
    ).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("guarda a oportunidade e desativa a ação após sucesso", async () => {
    const user = userEvent.setup();

    render(<SaveOpportunityButton procedureId="procedure-1" />);

    await user.click(
      screen.getByRole("button", { name: "Guardar oportunidade" }),
    );

    expect(mocks.rpc).toHaveBeenCalledWith("save_opportunity", {
      p_procedure_id: "procedure-1",
      p_notes: null,
    });
    expect(
      await screen.findByRole("button", {
        name: "Oportunidade guardada",
      }),
    ).toBeDisabled();
  });

  it("mostra o limite do plano quando o backend bloqueia a operação", async () => {
    const user = userEvent.setup();
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Limite de oportunidades atingido" },
    });

    render(<SaveOpportunityButton procedureId="procedure-1" />);

    await user.click(
      screen.getByRole("button", { name: "Guardar oportunidade" }),
    );

    expect(
      await screen.findByText(
        "Atingiste o limite de oportunidades guardadas do teu plano.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar oportunidade" }),
    ).not.toBeDisabled();
  });
});
