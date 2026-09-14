import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AlertasPage from "@/app/alertas/page";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  push: vi.fn(),
  router: null as null | { push: ReturnType<typeof vi.fn> },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
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
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

function createAlertsQuery(data: unknown[] = []) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);

  builder.then.mockImplementation((resolve) =>
    Promise.resolve({
      data,
      error: null,
    }).then(resolve),
  );

  return builder;
}

function createAlert(overrides = {}) {
  return {
    id: "alert-1",
    name: "Alerta software",
    active: true,
    frequency: "daily",
    filters: {
      query: "software",
    },
    last_run_at: null,
    created_at: "2026-09-14T10:00:00Z",
    ...overrides,
  };
}

describe("AlertasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.router = {
      push: mocks.push,
    };

    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-test",
          email: "teste@example.com",
        },
      },
    });
  });

  it("redireciona para login quando não existe utilizador", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: null,
      },
    });

    render(<AlertasPage />);

    await vi.waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/login");
    });

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("carrega apenas os alertas do utilizador autenticado", async () => {
    const builder = createAlertsQuery([
      createAlert(),
    ]);

    mocks.from.mockReturnValue(builder);

    render(<AlertasPage />);

    expect(
      await screen.findByText("Alerta software"),
    ).toBeInTheDocument();

    expect(mocks.from).toHaveBeenCalledWith("alerts");

    expect(builder.eq).toHaveBeenCalledWith(
      "user_id",
      "user-test",
    );

    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByText("Texto: software")).toBeInTheDocument();
  });

  it("desativa um alerta através da RPC", async () => {
    const builder = createAlertsQuery([
      createAlert({ active: true }),
    ]);

    mocks.from.mockReturnValue(builder);

    mocks.rpc.mockResolvedValue({
      data: true,
      error: null,
    });

    const user = userEvent.setup();

    render(<AlertasPage />);

    expect(
      await screen.findByText("Alerta software"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Desativar/i }),
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "set_alert_active",
      {
        p_alert_id: "alert-1",
        p_active: false,
      },
    );

    expect(
      await screen.findByText("Inativo"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /Ativar/i }),
    ).toBeInTheDocument();
  });

  it("ativa um alerta através da RPC", async () => {
    const builder = createAlertsQuery([
      createAlert({ active: false }),
    ]);

    mocks.from.mockReturnValue(builder);

    mocks.rpc.mockResolvedValue({
      data: true,
      error: null,
    });

    const user = userEvent.setup();

    render(<AlertasPage />);

    await screen.findByText("Alerta software");

    await user.click(
      screen.getByRole("button", { name: /Ativar/i }),
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "set_alert_active",
      {
        p_alert_id: "alert-1",
        p_active: true,
      },
    );

    expect(
      await screen.findByText("Ativo"),
    ).toBeInTheDocument();
  });

  it("mostra erro específico quando o plano impede ativar mais alertas", async () => {
    const builder = createAlertsQuery([
      createAlert({ active: false }),
    ]);

    mocks.from.mockReturnValue(builder);

    mocks.rpc.mockResolvedValue({
      data: false,
      error: {
        message: "Limite de alertas atingido",
      },
    });

    const user = userEvent.setup();

    render(<AlertasPage />);

    await screen.findByText("Alerta software");

    await user.click(
      screen.getByRole("button", { name: /Ativar/i }),
    );

    expect(
      await screen.findByText(
        "O teu plano atual não permite ativar mais alertas.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("Inativo")).toBeInTheDocument();
  });

  it("remove um alerta através da RPC", async () => {
    const builder = createAlertsQuery([
      createAlert(),
    ]);

    mocks.from.mockReturnValue(builder);

    mocks.rpc.mockResolvedValue({
      data: true,
      error: null,
    });

    const user = userEvent.setup();

    render(<AlertasPage />);

    await screen.findByText("Alerta software");

    await user.click(
      screen.getByRole("button", { name: /Remover/i }),
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "remove_alert",
      {
        p_alert_id: "alert-1",
      },
    );

    expect(
      await screen.findByText("Ainda não tens alertas"),
    ).toBeInTheDocument();
  });
});
