import { describe, expect, it } from "vitest";
import { formatEuros, getPlan, plans, planSummarySentence } from "@/lib/plans";

describe("plans (fonte única)", () => {
  it("expõe exatamente três planos na ordem canónica", () => {
    expect(plans.map((plan) => plan.id)).toEqual(["free", "starter", "pro"]);
  });

  it("mantém a tabela canónica (preços e limites)", () => {
    const free = getPlan("free");
    expect(free.priceMonthly).toBe(0);
    expect(free.maxSearchesMonth).toBe(50);
    expect(free.maxSavedOpportunities).toBe(10);
    expect(free.maxSavedSearches).toBe(5);
    expect(free.maxAlerts).toBe(1);

    const starter = getPlan("starter");
    expect(starter.priceMonthly).toBe(19);
    expect(starter.priceAnnual).toBe(205);
    expect(starter.maxSearchesMonth).toBe(200);
    expect(starter.maxSavedOpportunities).toBe(100);
    expect(starter.maxSavedSearches).toBe(25);
    expect(starter.maxAlerts).toBe(5);

    const pro = getPlan("pro");
    expect(pro.priceMonthly).toBe(39);
    expect(pro.priceAnnual).toBe(398);
    expect(pro.maxSearchesMonth).toBeNull();
    expect(pro.maxSavedOpportunities).toBe(500);
    expect(pro.maxSavedSearches).toBe(100);
    expect(pro.maxAlerts).toBe(20);
  });

  it("formata euros sem casas decimais", () => {
    expect(formatEuros(0)).toBe("0 €");
    expect(formatEuros(19)).toBe("19 €");
    expect(formatEuros(398)).toBe("398 €");
  });

  it("gera a frase de resumo a partir dos planos", () => {
    const sentence = planSummarySentence();
    expect(sentence).toContain("Free, sem custo para começar, com 50 pesquisas");
    expect(sentence).toContain("Starter, 19 € por mês, com 200 pesquisas");
    expect(sentence).toContain("Pro, 39 € por mês, com pesquisas ilimitadas");
  });

  it("explica os limites na descrição das funcionalidades", () => {
    const starter = getPlan("starter");
    expect(starter.features).toContain("200 pesquisas por mês");
    expect(starter.features).toContain("25 pesquisas guardadas");
    expect(starter.features).toContain("5 alertas");
  });
});
