import { describe, expect, it } from "vitest";
import { emailDomain, normalizeEmailForSuppression } from "./suppressionRules";

describe("suppression helpers", () => {
  it("extrai o domínio do email", () => {
    expect(emailDomain("Comercial@Empresa.PT")).toBe("empresa.pt");
    expect(emailDomain("a@b.c")).toBe("b.c");
  });

  it("devolve vazio para email sem @", () => {
    expect(emailDomain("sem-arroba")).toBe("");
  });

  it("normaliza email para comparação", () => {
    expect(normalizeEmailForSuppression("  Foo@Bar.PT ")).toBe("foo@bar.pt");
  });
});

