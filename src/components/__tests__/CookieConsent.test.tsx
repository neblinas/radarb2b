import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import CookieConsent from "@/components/CookieConsent";

const STORAGE_KEY = "radar_cookie_consent";

describe("CookieConsent", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("mostra o banner quando ainda não há consentimento guardado", async () => {
    render(<CookieConsent />);

    expect(
      await screen.findByText(/Privacidade no Radar B2B/i),
    ).toBeInTheDocument();
  });

  it("não mostra o banner quando já existe consentimento guardado", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );

    render(<CookieConsent />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.queryByText(/Privacidade no Radar B2B/i),
    ).not.toBeInTheDocument();
  });

  it("reabre as preferências quando o evento é disparado", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );

    render(<CookieConsent />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.queryByText(/Privacidade no Radar B2B/i),
    ).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("radar-open-cookie-settings"));
    });

    expect(
      await screen.findByText(/Privacidade no Radar B2B/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Cookies necessários ativos/i }),
    ).toBeInTheDocument();
  });
});
