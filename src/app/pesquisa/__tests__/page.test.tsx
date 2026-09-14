import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PesquisaPage from "@/app/pesquisa/page";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
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
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

function createQueryBuilder({
  data = [],
  count = 0,
  error = null,
}: {
  data?: Array<{
    id: string;
    source_id: string | null;
    object: string | null;
    procedure_type: string | null;
    publication_date: string | null;
    base_price: string | number | null;
  }>;
  count?: number;
  error?: { message: string } | null;
} = {}) {
  const builder = {
    select: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    or: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    then: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.lte.mockReturnValue(builder);

  builder.then.mockImplementation((resolve) =>
    Promise.resolve({
      data,
      count,
      error,
    }).then(resolve),
  );

  return builder;
}

describe("PesquisaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.searchParams = new URLSearchParams();

    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-test",
          email: "teste@example.com",
        },
      },
    });

    mocks.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: mocks.unsubscribe,
        },
      },
    });

    mocks.rpc.mockResolvedValue({
      data: true,
      error: null,
    });
  });

  it("carrega os filtros a partir dos parâmetros da URL", async () => {
    mocks.searchParams = new URLSearchParams({
      query: "software",
      procedureType: "Concurso público",
      dateFrom: "2026-01-01",
      dateTo: "2026-09-01",
      valueFrom: "10000",
      valueTo: "50000",
    });

    mocks.from.mockReturnValue(createQueryBuilder());

    render(<PesquisaPage />);

    await screen.findByText("teste@example.com");

    expect(
      screen.getByPlaceholderText("Pesquisar por objeto ou descrição..."),
    ).toHaveValue("software");

    expect(screen.getByRole("combobox")).toHaveValue(
      "Concurso público",
    );

    expect(screen.getByLabelText("Publicado desde")).toHaveValue(
      "2026-01-01",
    );

    expect(screen.getByLabelText("Publicado até")).toHaveValue(
      "2026-09-01",
    );

    expect(screen.getByLabelText("Valor mínimo (€)")).toHaveValue(10000);

    expect(screen.getByLabelText("Valor máximo (€)")).toHaveValue(50000);
  });

  it("bloqueia a pesquisa quando não existe utilizador autenticado", async () => {
    mocks.searchParams = new URLSearchParams({
      query: "cloud",
    });

    mocks.getUser.mockResolvedValue({
      data: {
        user: null,
      },
    });

    render(<PesquisaPage />);

    expect(
      await screen.findByText("Inicia sessão para efetuares pesquisas."),
    ).toBeInTheDocument();

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("não guarda uma pesquisa sem filtros", async () => {
    const user = userEvent.setup();

    render(<PesquisaPage />);

    await user.click(
      screen.getByRole("button", { name: /Guardar pesquisa/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Define pelo menos um filtro antes de guardar.",
        ),
      ).toBeInTheDocument();
    });

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("valida a quota e aplica os filtros corretos ao Supabase", async () => {
    mocks.searchParams = new URLSearchParams({
      query: "software",
      procedureType: "Concurso público",
      dateFrom: "2026-01-01",
      dateTo: "2026-09-01",
      valueFrom: "10000",
      valueTo: "50000",
    });

    const builder = createQueryBuilder({
      data: [
        {
          id: "procedure-1",
          source_id: "BASE-1",
          object: "Aquisição de software",
          procedure_type: "Concurso público",
          publication_date: "2026-06-15",
          base_price: 25000,
        },
      ],
      count: 1,
    });

    mocks.from.mockReturnValue(builder);

    render(<PesquisaPage />);

    expect(
      await screen.findByText("Aquisição de software"),
    ).toBeInTheDocument();

    expect(mocks.rpc).toHaveBeenCalledWith(
      "increment_search_usage",
    );

    expect(mocks.from).toHaveBeenCalledWith("procedures");

    expect(builder.or).toHaveBeenCalledWith(
      "object.ilike.%software%,description.ilike.%software%",
    );

    expect(builder.eq).toHaveBeenCalledWith(
      "procedure_type",
      "Concurso público",
    );

    expect(builder.gte).toHaveBeenCalledWith(
      "publication_date",
      "2026-01-01",
    );

    expect(builder.lte).toHaveBeenCalledWith(
      "publication_date",
      "2026-09-01",
    );

    expect(builder.gte).toHaveBeenCalledWith(
      "base_price",
      10000,
    );

    expect(builder.lte).toHaveBeenCalledWith(
      "base_price",
      50000,
    );

    expect(builder.range).toHaveBeenCalledWith(0, 49);
  });

  it("pagina os resultados sem voltar a consumir quota", async () => {
    mocks.searchParams = new URLSearchParams({
      query: "software",
    });

    const firstBuilder = createQueryBuilder({
      data: [
        {
          id: "procedure-1",
          source_id: "BASE-1",
          object: "Resultado página 1",
          procedure_type: "Concurso público",
          publication_date: "2026-06-15",
          base_price: 25000,
        },
      ],
      count: 60,
    });

    const secondBuilder = createQueryBuilder({
      data: [
        {
          id: "procedure-51",
          source_id: "BASE-51",
          object: "Resultado página 2",
          procedure_type: "Concurso público",
          publication_date: "2026-05-15",
          base_price: 30000,
        },
      ],
      count: 60,
    });

    mocks.from
      .mockReturnValueOnce(firstBuilder)
      .mockReturnValueOnce(secondBuilder);

    const user = userEvent.setup();

    render(<PesquisaPage />);

    expect(
      await screen.findByText("Resultado página 1"),
    ).toBeInTheDocument();

    expect(firstBuilder.range).toHaveBeenCalledWith(0, 49);

    await user.click(
      screen.getByRole("button", { name: /Seguinte/i }),
    );

    expect(
      await screen.findByText("Resultado página 2"),
    ).toBeInTheDocument();

    expect(secondBuilder.range).toHaveBeenCalledWith(50, 99);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
