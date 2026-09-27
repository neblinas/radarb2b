import type { AnchorHTMLAttributes, ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  onAuthStateChange: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  router: null as null | {
    push: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
  },
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
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      updateUser: mocks.updateUser,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}));

function enableSignupMode() {
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
}

function submitForm() {
  const submitButton = document.querySelector(
    'button[type="submit"]',
  ) as HTMLButtonElement;
  fireEvent.click(submitButton);
}

function fillCredentials() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "novo@empresa.pt" },
  });
  fireEvent.change(screen.getByLabelText("Palavra-passe"), {
    target: { value: "Segredo123!" },
  });
  fireEvent.change(screen.getByLabelText("Confirmar palavra-passe"), {
    target: { value: "Segredo123!" },
  });
}

describe("LoginPage - aceitação de termos no registo", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.router = { push: mocks.push, refresh: mocks.refresh };
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "user-test" }, session: null },
      error: null,
    });
  });

  it("só mostra o checkbox de termos no modo de criação de conta", () => {
    render(<LoginPage />);

    expect(screen.queryByText(/termos de utilização/i)).not.toBeInTheDocument();

    enableSignupMode();

    expect(screen.getByText(/termos de utilização/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /termos de utilização/i }),
    ).toHaveAttribute("href", "/termos");
    expect(
      screen.getByRole("link", { name: /política de privacidade/i }),
    ).toHaveAttribute("href", "/privacidade");
  });

  it("bloqueia o registo quando os termos não são aceites", async () => {
    render(<LoginPage />);

    enableSignupMode();
    fillCredentials();

    submitForm();

    expect(
      await screen.findByText(/tens de aceitar os termos de utilização/i),
    ).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

    it("permite o registo depois de aceitar os termos", async () => {
    render(<LoginPage />);

    enableSignupMode();
    fillCredentials();

    fireEvent.click(screen.getByRole("checkbox"));
    submitForm();

    await waitFor(() => {
      expect(mocks.signUp).toHaveBeenCalledWith({
        email: "novo@empresa.pt",
        password: "Segredo123!",
        options: { emailRedirectTo: `${window.location.origin}/confirmacao` },
      });
    });
  });

  it("mostra mensagem accionável quando o envio do email de confirmação falha", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { id: "user-test", identities: [] }, session: null },
      error: { message: "Error sending confirmation email", code: "unexpected_failure", status: 500 },
    });

    render(<LoginPage />);

    enableSignupMode();
    fillCredentials();
    fireEvent.click(screen.getByRole("checkbox"));
    submitForm();

    expect(
      await screen.findByText(/não foi possível enviar o email de confirmação/i),
    ).toBeInTheDocument();
  });

  it("avisa quando o email já está registado (identities vazio, sem erro)", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { id: "user-test", identities: [] }, session: null },
      error: null,
    });

    render(<LoginPage />);

    enableSignupMode();
    fillCredentials();
    fireEvent.click(screen.getByRole("checkbox"));
    submitForm();

    expect(
      await screen.findByText(/já existe uma conta com este email/i),
    ).toBeInTheDocument();
  });
});

