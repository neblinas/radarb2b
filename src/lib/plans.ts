// Planos do Adjudata — fonte única de verdade no frontend.
//
// Esta tabela espelha EXATAMENTE os entitlements definidos no backend em
// `public.plans` (ver supabase/migrations/20260928090000_plan_pricing_v2.sql).
// Sempre que alterares preços ou limites:
//   1. Atualiza aqui.
//   2. Atualiza a migração SQL correspondente.
//   3. Confirma que os Stripe price IDs batem com o Stripe.
//
// Regra: nenhuma página deve repetir preços/limites — todas leem daqui.
//
// Tabela canónica (preços sem IVA):
//   | Plano   | Mês | Ano | Pesquisas/mês | Oportunidades | Pesquisas guardadas | Alertas |
//   | Free    | 0   | —   | 10            | 3             | 1                   | 1       |
//   | Starter | 29  | 290 | 250           | 100           | 25                  | 5       |
//   | Pro     | 69  | 690 | ilimitadas    | 500           | 100                 | 20      |

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
    description: "Para experimentar o Adjudata e perceber o valor.",
    maxSearchesMonth: 10,
    maxSavedOpportunities: 3,
    maxSavedSearches: 1,
    maxAlerts: 1,
    features: [
      "10 pesquisas por mês",
      "3 oportunidades guardadas",
      "1 pesquisa guardada",
      "1 alerta",
    ],
    featured: false,
  },
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    priceAnnual: 290,
    annualDiscount: 17,
    description:
      "Para empresas que acompanham regularmente contratação pública.",
    maxSearchesMonth: 250,
    maxSavedOpportunities: 100,
    maxSavedSearches: 25,
    maxAlerts: 5,
    features: [
      "250 pesquisas por mês",
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
    priceMonthly: 69,
    priceAnnual: 690,
    annualDiscount: 17,
    description:
      "Para empresas que querem intelligence comercial avançada.",
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

