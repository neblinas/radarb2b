/**
 * Ciclo de vida de clientes — lógica pura (determinística, testável).
 *
 * Calcula o "health score" e o estágio/nova ação a partir de sinais REAIS
 * (pesquisas, logins, última atividade, fim do período). Nunca inventa dados.
 */

export type LifecycleStage =
  | "onboarding"
  | "activated"
  | "engaged"
  | "at_risk"
  | "dormant"
  | "renewal_due"
  | "renewed"
  | "churned"
  | "winback";

export type LifecycleAction =
  | "nudge_onboarding"
  | "value_report"
  | "renewal_reminder"
  | "reactivate"
  | "check_in";

export type LifecycleSignals = {
  /** Pesquisas nos últimos 30 dias. */
  searches30d: number;
  /** Logins nos últimos 30 dias. */
  logins30d: number;
  /** Dias desde a última atividade (null = nunca). */
  daysSinceLastSeen: number | null;
  /** Dias até renovação (negativo = já passou). null = sem data. */
  daysToRenewal: number | null;
  /** Checklist de onboarding ainda incompleta. */
  onboardingIncomplete: boolean;
  /** Estado da subscrição (ex.: 'active', 'expired', 'canceled'). */
  subscriptionStatus: string | null;
};

export type LifecycleDecision = {
  stage: LifecycleStage;
  healthScore: number;
  action: LifecycleAction;
  reason: string;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

/** Pontua o "engajamento" com base em sinais observáveis (0-100). */
export function computeHealthScore(signals: LifecycleSignals): number {
  let score = 50;

  // Pesquisas (peso principal).
  score += Math.min(30, signals.searches30d * 3);
  // Logins.
  score += Math.min(20, signals.logins30d * 4);
  // Recência.
  if (signals.daysSinceLastSeen === null) score -= 25;
  else if (signals.daysSinceLastSeen <= 7) score += 10;
  else if (signals.daysSinceLastSeen <= 30) score += 0;
  else if (signals.daysSinceLastSeen <= 60) score -= 15;
  else score -= 30;

  // Onboarding incompleto penaliza.
  if (signals.onboardingIncomplete) score -= 10;

  // Subscrição não ativa penaliza fortemente.
  if (signals.subscriptionStatus && ["expired", "canceled", "past_due"].includes(signals.subscriptionStatus)) {
    score -= 20;
  }

  return clamp(score);
}

/**
 * Decide o estágio e a próxima ação. Determinístico e conservador.
 *
 * Precedência: churn → renovação → dormência → onboarding → engajamento.
 */
export function decideLifecycle(signals: LifecycleSignals): LifecycleDecision {
  const healthScore = computeHealthScore(signals);
  const subInactive = signals.subscriptionStatus != null
    && ["expired", "canceled", "past_due"].includes(signals.subscriptionStatus);

  // 1. Churn: subscrição cancelada/expirada.
  if (subInactive) {
    return {
      stage: signals.daysSinceLastSeen !== null && signals.daysSinceLastSeen > 90 ? "churned" : "at_risk",
      healthScore,
      action: "reactivate",
      reason: `subscrição ${signals.subscriptionStatus}`,
    };
  }

  // 2. Renovação próxima.
  if (signals.daysToRenewal !== null && signals.daysToRenewal <= 14 && signals.daysToRenewal >= 0) {
    return {
      stage: "renewal_due",
      healthScore,
      action: "renewal_reminder",
      reason: `renovação em ${signals.daysToRenewal} dias`,
    };
  }

  // 3. Dormência / risco.
  if (signals.daysSinceLastSeen !== null && signals.daysSinceLastSeen > 60) {
    return { stage: "dormant", healthScore, action: "reactivate", reason: `inativo há ${signals.daysSinceLastSeen} dias` };
  }
  if (healthScore < 40) {
    return { stage: "at_risk", healthScore, action: "check_in", reason: `health score baixo (${healthScore})` };
  }

  // 4. Onboarding incompleto.
  if (signals.onboardingIncomplete) {
    return { stage: "onboarding", healthScore, action: "nudge_onboarding", reason: "onboarding incompleto" };
  }

  // 5. Engajamento.
  const engaged = signals.searches30d >= 5 || signals.logins30d >= 5;
  if (engaged) {
    return { stage: "engaged", healthScore, action: "value_report", reason: "cliente ativo e engajado" };
  }

  return { stage: "activated", healthScore, action: "value_report", reason: "cliente ativado" };
}

/** Título legível do estágio. */
export const lifecycleStageLabel: Record<LifecycleStage, string> = {
  onboarding: "Em onboarding",
  activated: "Ativado",
  engaged: "Engajado",
  at_risk: "Em risco",
  dormant: "Dormente",
  renewal_due: "Renovação a vencer",
  renewed: "Renovado",
  churned: "Cancelado",
  winback: "Recuperação",
};

export const lifecycleActionLabel: Record<LifecycleAction, string> = {
  nudge_onboarding: "Ajudar onboarding",
  value_report: "Enviar relatório de valor",
  renewal_reminder: "Lembrete de renovação",
  reactivate: "Reativar",
  check_in: "Contacto de acompanhamento",
};
