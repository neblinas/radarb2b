import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackSignUp } from "@/lib/analytics";

describe("trackSignUp", () => {
  beforeEach(() => {
    delete (window as Window & { gtag?: unknown }).gtag;
  });

  it("não falha sem gtag", () => {
    expect(() => trackSignUp()).not.toThrow();
  });

  it("emite sign_up sem PII quando gtag está disponível", () => {
    const gtag = vi.fn();
    (window as Window & { gtag?: typeof gtag }).gtag = gtag;

    trackSignUp();

    expect(gtag).toHaveBeenCalledWith("event", "sign_up", { method: "email" });
  });
});
