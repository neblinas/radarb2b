import { describe, expect, it } from "vitest";
import { isBusinessEmailDomain, personalize } from "./outreachTemplate";

describe("outreach personalization", () => {
  it("substitui variáveis com dados reais", () => {
    const result = personalize(
      "Olá {company}, vi que participou em {awards} concursos no valor de {value}. CPV: {cpv}.",
      {
        nif: "500000000",
        award_count: 12,
        total_award_value: 600000,
        cpv_codes: ["45000000", "71000000", "80000000", "99999999"],
        participation_12m: 5,
      },
      "Empresa X",
    );
    expect(result).toContain("Olá Empresa X");
    expect(result).toContain("12 concursos");
    expect(result).toContain("45000000, 71000000, 80000000");
    // Apenas os 3 primeiros CPVs.
    expect(result).not.toContain("99999999");
  });

  it("usa — para campos ausentes (não inventa)", () => {
    const result = personalize("NIF {nif}, valor {value}, CPV {cpv}", {}, "Empresa Y");
    expect(result).toBe("NIF —, valor —, CPV —");
  });

  it("formata valor em euros", () => {
    const result = personalize("{value}", { total_award_value: 1234.5 }, "Z");
    expect(result).toContain("€");
  });

  it("valida domínios de email empresarial", () => {
    expect(isBusinessEmailDomain("comercial@empresa.pt")).toBe(true);
    expect(isBusinessEmailDomain("a@sub.empresa.pt")).toBe(true);
    expect(isBusinessEmailDomain("a@example.com")).toBe(false);
    expect(isBusinessEmailDomain("a@test.com")).toBe(false);
    expect(isBusinessEmailDomain("sememail")).toBe(false);
    expect(isBusinessEmailDomain("a@localhost")).toBe(false);
  });
});
