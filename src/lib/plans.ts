// Planos do Adjudata — fonte única de verdade no frontend.
//
// Esta tabela espelha EXATAMENTE os entitlements definidos no backend em
// `public.plans` (ver supabase/migrations/20260927090000_plan_entitlements.sql).
// Sempre que alterares preços ou limites:
//   1. Atualiza aqui.
//   2. Atualiza a migração SQL correspondente.
//   3. Confirma que os Stripe price IDs batem com o Stripe.
//
// Regra: nenhuma página deve repetir preços/limites — todas leem daqui.
//
// Tabela canónica (preços sem IVA):
//   | Plano   | Mês | Ano | Pesquisas/mês | Oportunidades | Pesquisas guardadas | Alertas |
//   | Free    | 0   | —   | 50            | 10            | 5                   | 1       |
//   | Starter | 19  | 205 | 200           | 100           | 25                  | 5       |
//   | Pro     | 39  | 398 | ilimitadas    | 500           | 100                 | 20      |

export type PlanId = "free" | "starter" | "pro";
export type PaidPlanId = "starter" | "pro";

export type Plan = {
  id: PlanId;
  /** Nome apresentado na UI. */
  name: string;
  /** Preço mensal em euros, sem IVA. */
  priceMonthly: number;
  /** Preço anual em euros, sem IVA (0 quando não aplicável). */
  priceAnnual: number;
  /** Desconto anual em percentagem (arredondado), para badges. */
  annualDiscount: number;
  /** Descrição curta para a página de planos e JSON-LD. */
  description: string;
  /** Pesquisas por mês. `null` = ilimitadas. */
  maxSearchesMonth: number | null;
  /** Oportunidades guardadas. */
  maxSavedOpportunities: number;
  /** Pesquisas guardadas. */
  maxSavedSearches: number;
  /** Alertas automáticos. */
  maxAlerts: number;
  /** Linha de funcionalidades para os cartões. */
  features: string[];
  /** Plano em destaque ("Mais escolhido"). */
  featured: boolean;
};

export const plans: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnual: 0,
    annualDiscount: 0,
    description: "Para conhecer o Adjudata e testar uma rotina de pesquisa.",
    maxSearchesMonth: 50,
    maxSavedOpportunities: 10,
    maxSavedSearches: 5,
    maxAlerts: 1,
    features: [
      "50 pesquisas por mês",
      "10 oportunidades guardadas",
      "5 pesquisas guardadas",
      "1 alerta",
    ],
    featured: false,
  },
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 19,
    priceAnnual: 205,
    annualDiscount: 10,
    description:
      "Para empresas pequenas que precisam de acompanhar oportunidades com consistência.",
    maxSearchesMonth: 200,
    maxSavedOpportunities: 100,
    maxSavedSearches: 25,
    maxAlerts: 5,
    features: [
      "200 pesquisas por mês",
      "100 oportunidades guardadas",
      "25 pesquisas guardadas",
      "5 alertas",
      "Acesso a entidades e concorrência",
    ],
    featured: true,
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 39,
    priceAnnual: 398,
    annualDiscount: 15,
    description:
      "Para equipas comerciais que transformam contratação pública numa rotina de crescimento.",
    maxSearchesMonth: null,
    maxSavedOpportunities: 500,
    maxSavedSearches: 100,
    maxAlerts: 20,
    features: [
      "Pesquisas ilimitadas",
      "500 oportunidades guardadas",
      "100 pesquisas guardadas",
      "20 alertas",
      "Contexto completo de procedimentos",
    ],
    featured: false,
  },
] as const;

export function getPlan(id: PlanId): Plan {
  const plan = plans.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`Plano desconhecido: ${id}`);
  }
  return plan;
}

/** Formata euros sem casas decimais (ex.: 19 -> "19 €"). */
export function formatEuros(value: number): string {
  return `${value.toLocaleString("pt-PT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} €`;
}

/** Texto resumido de limites para FAQ/contacto, gerado a partir dos planos. */
export function planSummarySentence(): string {
  return plans
    .map((plan) => {
      const searches =
        plan.maxSearchesMonth === null
          ? "pesquisas ilimitadas"
          : `${plan.maxSearchesMonth} pesquisas`;
      const price =
        plan.priceMonthly === 0
          ? "sem custo para começar"
          : `${formatEuros(plan.priceMonthly)} por mês`;
      return `${plan.name}, ${price}, com ${searches}, ${plan.maxSavedOpportunities} oportunidades, ${plan.maxSavedSearches} pesquisas guardadas e ${plan.maxAlerts} ${plan.maxAlerts === 1 ? "alerta" : "alertas"}`;
    })
    .join("; ");
}
