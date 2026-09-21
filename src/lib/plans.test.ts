import { describe, expect, it } from "vitest";
import { formatEuros, getPlan, plans, planSummarySentence } from "@/lib/plans";

describe("plans (fonte única)", () => {
  it("expõe exatamente três planos na ordem canónica", () => {
    expect(plans.map((plan) => plan.id)).toEqual(["free", "starter", "pro"]);
  });

  it("mantém a tabela canónica (preços e limites)", () => {
    const free = getPlan("free");
    expect(free.priceMonthly).toBe(0);
    expect(free.maxSearchesMonth).toBe(10);
    expect(free.maxSavedOpportunities).toBe(3);
    expect(free.maxSavedSearches).toBe(1);
    expect(free.maxAlerts).toBe(1);

    const starter = getPlan("starter");
    expect(starter.priceMonthly).toBe(29);
    expect(starter.priceAnnual).toBe(290);
    expect(starter.maxSearchesMonth).toBe(250);
    expect(starter.maxSavedOpportunities).toBe(100);
    expect(starter.maxSavedSearches).toBe(25);
    expect(starter.maxAlerts).toBe(5);

    const pro = getPlan("pro");
    expect(pro.priceMonthly).toBe(69);
    expect(pro.priceAnnual).toBe(690);
    expect(pro.maxSearchesMonth).toBeNull();
    expect(pro.maxSavedOpportunities).toBe(500);
    expect(pro.maxSavedSearches).toBe(100);
    expect(pro.maxAlerts).toBe(20);
  });

  it("formata euros sem casas decimais", () => {
    expect(formatEuros(0)).toBe("0 €");
    expect(formatEuros(29)).toBe("29 €");
    expect(formatEuros(690)).toBe("690 €");
  });

  it("gera a frase de resumo a partir dos planos", () => {
    const sentence = planSummarySentence();
    expect(sentence).toContain("Free, sem custo para começar, com 10 pesquisas");
    expect(sentence).toContain("Starter, 29 € por mês, com 250 pesquisas");
    expect(sentence).toContain("Pro, 69 € por mês, com pesquisas ilimitadas");
  });

  it("explica os limites na descrição das funcionalidades", () => {
    const starter = getPlan("starter");
    expect(starter.features).toContain("250 pesquisas por mês");
    expect(starter.features).toContain("25 pesquisas guardadas");
    expect(starter.features).toContain("5 alertas");
  });

  it("mantém a vantagem anual coerente com os preços", () => {
    // Starter: 29 x 12 = 348 -> 290 => ~16.7% (arredondado a 17%)
    const starter = getPlan("starter");
    expect(starter.priceAnnual).toBeLessThan(starter.priceMonthly * 12);
    expect(starter.annualDiscount).toBe(17);

    // Pro: 69 x 12 = 828 -> 690 => ~16.7% (arredondado a 17%)
    const pro = getPlan("pro");
    expect(pro.priceAnnual).toBeLessThan(pro.priceMonthly * 12);
    expect(pro.annualDiscount).toBe(17);
  });
});

