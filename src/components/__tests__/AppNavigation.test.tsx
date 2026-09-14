import type { AnchorHTMLAttributes, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppNavigation from "@/components/AppNavigation";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
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

describe("AppNavigation", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
  });

  it("mostra a navegação principal numa página autenticada", () => {
    mockUsePathname.mockReturnValue("/pesquisa");

    render(<AppNavigation />);

    expect(screen.getByText("RADAR B2B")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /Dashboard/i }),
    ).toHaveAttribute("href", "/");

    expect(
      screen.getByRole("link", { name: /^Pesquisa$/i }),
    ).toHaveAttribute("href", "/pesquisa");

    expect(
      screen.getByRole("link", {
        name: /Pesquisas guardadas/i,
      }),
    ).toHaveAttribute("href", "/pesquisas-guardadas");

    expect(
      screen.getByRole("link", { name: /Oportunidades/i }),
    ).toHaveAttribute("href", "/oportunidades");

    expect(
      screen.getByRole("link", { name: /Alertas/i }),
    ).toHaveAttribute("href", "/alertas");
  });

  it("não mostra a navegação na página de login", () => {
    mockUsePathname.mockReturnValue("/login");

    render(<AppNavigation />);

    expect(
      screen.queryByText("RADAR B2B"),
    ).not.toBeInTheDocument();
  });

  it("abre o menu mobile e mostra o acesso à conta", () => {
    mockUsePathname.mockReturnValue("/");

    render(<AppNavigation />);

    const menuButton = screen.getByRole("button", {
      name: "Abrir navegação",
    });

    fireEvent.click(menuButton);

    expect(
      screen.getByRole("link", { name: /A minha conta/i }),
    ).toHaveAttribute("href", "/conta");
  });
});

