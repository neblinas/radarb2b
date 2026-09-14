import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OportunidadesPage from "@/app/oportunidades/page";

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

function createSavedOpportunitiesQuery(data: unknown[] = []) {
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

describe("OportunidadesPage", () => {
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

    render(<OportunidadesPage />);

    await vi.waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/login");
    });

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("carrega apenas as oportunidades do utilizador autenticado", async () => {
    const builder = createSavedOpportunitiesQuery([
      {
        id: "saved-1",
        procedure_id: "procedure-1",
        notes: null,
        created_at: "2026-09-14T10:00:00Z",
        procedure: {
          id: "procedure-1",
          source_id: "BASE-123",
          object: "Aquisição de serviços cloud",
          procedure_type: "Concurso público",
          publication_date: "2026-09-10",
          base_price: 50000,
        },
      },
    ]);

    mocks.from.mockReturnValue(builder);

    render(<OportunidadesPage />);

    expect(
      await screen.findByText("Aquisição de serviços cloud"),
    ).toBeInTheDocument();

    expect(mocks.from).toHaveBeenCalledWith(
      "saved_opportunities",
    );

    expect(builder.eq).toHaveBeenCalledWith(
      "user_id",
      "user-test",
    );

    expect(
      screen.getByRole("link", { name: /Ver procedimento/i }),
    ).toHaveAttribute(
      "href",
      "/procedimentos/procedure-1",
    );

    expect(screen.getByText("ID BASE-123")).toBeInTheDocument();
  });

  it("remove uma oportunidade através da RPC", async () => {
    const builder = createSavedOpportunitiesQuery([
      {
        id: "saved-1",
        procedure_id: "procedure-1",
        notes: null,
        created_at: "2026-09-14T10:00:00Z",
        procedure: {
          id: "procedure-1",
          source_id: "BASE-123",
          object: "Oportunidade para remover",
          procedure_type: "Concurso público",
          publication_date: "2026-09-10",
          base_price: 50000,
        },
      },
    ]);

    mocks.from.mockReturnValue(builder);

    mocks.rpc.mockResolvedValue({
      data: true,
      error: null,
    });

    const user = userEvent.setup();

    render(<OportunidadesPage />);

    expect(
      await screen.findByText("Oportunidade para remover"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Remover/i }),
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "remove_saved_opportunity",
      {
        p_procedure_id: "procedure-1",
      },
    );

    expect(
      await screen.findByText(
        "Ainda não tens oportunidades guardadas",
      ),
    ).toBeInTheDocument();
  });

  it("mantém a oportunidade e mostra erro quando a remoção falha", async () => {
    const builder = createSavedOpportunitiesQuery([
      {
        id: "saved-1",
        procedure_id: "procedure-1",
        notes: null,
        created_at: "2026-09-14T10:00:00Z",
        procedure: {
          id: "procedure-1",
          source_id: "BASE-123",
          object: "Oportunidade protegida",
          procedure_type: "Concurso público",
          publication_date: "2026-09-10",
          base_price: 50000,
        },
      },
    ]);

    mocks.from.mockReturnValue(builder);

    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "Erro de teste",
      },
    });

    const user = userEvent.setup();

    render(<OportunidadesPage />);

    expect(
      await screen.findByText("Oportunidade protegida"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Remover/i }),
    );

    expect(
      await screen.findByText(
        "Não foi possível remover esta oportunidade.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Oportunidade protegida"),
    ).toBeInTheDocument();
  });
});
