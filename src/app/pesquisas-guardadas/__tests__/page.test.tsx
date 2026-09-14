import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PesquisasGuardadasPage, {
  buildSearchUrl,
} from "@/app/pesquisas-guardadas/page";

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

function createSavedSearchQuery(data: unknown[] = []) {
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

describe("PesquisasGuardadasPage", () => {
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

  it("constrói corretamente a URL de uma pesquisa guardada", () => {
    const url = buildSearchUrl({
      query: "software cloud",
      procedureType: "Concurso público",
      dateFrom: "2026-01-01",
      dateTo: "2026-09-01",
      valueFrom: 10000,
      valueTo: 50000,
    });

    const parsed = new URL(url, "https://radarb2b.test");

    expect(parsed.pathname).toBe("/pesquisa");
    expect(parsed.searchParams.get("query")).toBe("software cloud");
    expect(parsed.searchParams.get("procedureType")).toBe(
      "Concurso público",
    );
    expect(parsed.searchParams.get("dateFrom")).toBe("2026-01-01");
    expect(parsed.searchParams.get("dateTo")).toBe("2026-09-01");
    expect(parsed.searchParams.get("valueFrom")).toBe("10000");
    expect(parsed.searchParams.get("valueTo")).toBe("50000");
  });

  it("ignora filtros vazios na URL", () => {
    expect(
      buildSearchUrl({
        query: null,
        procedureType: "",
        dateFrom: null,
        dateTo: null,
        valueFrom: "",
        valueTo: undefined,
      }),
    ).toBe("/pesquisa");
  });

  it("redireciona para login quando não existe utilizador", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: null,
      },
    });

    render(<PesquisasGuardadasPage />);

    await vi.waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/login");
    });

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("carrega e apresenta as pesquisas guardadas do utilizador", async () => {
    const builder = createSavedSearchQuery([
      {
        id: "saved-1",
        name: "Software público",
        filters: {
          query: "software",
          valueFrom: 10000,
        },
        created_at: "2026-09-14T10:00:00Z",
        updated_at: "2026-09-14T10:00:00Z",
      },
    ]);

    mocks.from.mockReturnValue(builder);

    render(<PesquisasGuardadasPage />);

    expect(
      await screen.findByText("Software público"),
    ).toBeInTheDocument();

    expect(mocks.from).toHaveBeenCalledWith("saved_searches");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-test");

    expect(screen.getByText("Texto: software")).toBeInTheDocument();
    expect(
      screen.getByText(/Valor mín\.:/i),
    ).toBeInTheDocument();
  });

  it("remove uma pesquisa guardada através da RPC", async () => {
    const builder = createSavedSearchQuery([
      {
        id: "saved-1",
        name: "Pesquisa para remover",
        filters: {
          query: "cloud",
        },
        created_at: "2026-09-14T10:00:00Z",
        updated_at: "2026-09-14T10:00:00Z",
      },
    ]);

    mocks.from.mockReturnValue(builder);

    mocks.rpc.mockResolvedValue({
      data: true,
      error: null,
    });

    const user = userEvent.setup();

    render(<PesquisasGuardadasPage />);

    expect(
      await screen.findByText("Pesquisa para remover"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Remover/i }),
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "remove_saved_search",
      {
        p_saved_search_id: "saved-1",
      },
    );

    expect(
      await screen.findByText("Ainda não tens pesquisas guardadas"),
    ).toBeInTheDocument();
  });
});

