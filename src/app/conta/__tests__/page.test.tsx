import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContaPage from "@/app/conta/page";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
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
      getSession: mocks.getSession,
      signOut: mocks.signOut,
    },
    from: mocks.from,
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

function createAccountQuery(data: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue({ data, error: null });

  return builder;
}

function mockAccountData({ paid = false } = {}) {
  mocks.from
    .mockReturnValueOnce(
      createAccountQuery({ account_status: "active" }),
    )
    .mockReturnValueOnce(
      createAccountQuery({
        plan_id: paid ? "pro" : "free",
        status: paid ? "active" : "active",
        stripe_customer_id: paid ? "cus_test" : null,
        stripe_subscription_id: paid ? "sub_test" : null,
        cancel_at_period_end: false,
        current_period_end: paid ? "2026-10-15T00:00:00Z" : null,
        plans: {
          name: paid ? "Pro" : "Free",
          max_searches_month: paid ? null : 20,
        },
      }),
    )
    .mockReturnValueOnce(
      createAccountQuery({
        searches_used: paid ? 12 : 7,
        period_start: "2026-09-01",
      }),
    );
}

describe("ContaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.router = { push: mocks.push };
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-test",
          email: "teste@example.com",
        },
      },
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "session-test" } },
    });
  });

  it("redireciona para login quando não existe sessão", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    render(<ContaPage />);

    await vi.waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/login");
    });

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("mostra quota e planos disponíveis no plano Free", async () => {
    mockAccountData();

    render(<ContaPage />);

    expect(await screen.findByText("A minha conta")).toBeInTheDocument();
    expect(
      screen.getByText(/13\s+pesquisas disponíveis este mês/),
    ).toBeInTheDocument();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher Pro" })).toBeInTheDocument();
  });

  it("mostra a gestão de subscrição para um cliente pago", async () => {
    mockAccountData({ paid: true });

    render(<ContaPage />);

    expect(await screen.findByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Pesquisas ilimitadas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerir subscrição/i })).toBeInTheDocument();
    expect(screen.queryByText("Escolher Starter")).not.toBeInTheDocument();
  });
});
