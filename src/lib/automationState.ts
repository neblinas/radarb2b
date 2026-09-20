/**
 * Sales Autopilot — máquina de estados.
 *
 * Puro e determinístico (sem I/O), para ser testável isoladamente. Mapeia o
 * ciclo automático do prospect e valida transições permitidas para evitar
 * saltos incoerentes. As transições são registadas em `automation_events`.
 *
 * O estado é mantido em `automation_events.to_state` (histórico) — o estado
 * atual é o evento mais recente. Isto mantém-se compatível com o estado CRM
 * existente em `sales_prospects.status` (que continua a ser a fonte para a UI
 * comercial humana).
 */

export const AUTOMATION_STATES = [
  "discovered",
  "qualification_pending",
  "qualified",
  "not_qualified",
  "enrichment_pending",
  "contact_ready",
  "no_contact",
  "outreach_queued",
  "contacted",
  "followup_1",
  "followup_2",
  "replied",
  "interested",
  "signup",
  "activated",
  "paying",
  "retained",
  "not_interested",
  "bounced",
  "unsubscribed",
  "do_not_contact",
  "lost",
  "human_review",
] as const;

export type AutomationState = (typeof AUTOMATION_STATES)[number];

/** Estado inicial de um prospect descoberto pela automação. */
export const INITIAL_STATE: AutomationState = "discovered";

/**
 * Estados terminais: não devem receber mais transições automáticas de outreach.
 */
export const TERMINAL_STATES: ReadonlySet<AutomationState> = new Set([
  "not_qualified",
  "no_contact",
  "not_interested",
  "bounced",
  "unsubscribed",
  "do_not_contact",
  "lost",
  "paying",
  "retained",
]);

/** Mapa de transições permitidas (from → to[]). */
const TRANSITIONS: Record<AutomationState, AutomationState[]> = {
  discovered: ["qualification_pending", "do_not_contact", "lost"],
  qualification_pending: ["qualified", "not_qualified", "no_contact", "do_not_contact"],
  qualified: ["enrichment_pending", "do_not_contact", "lost"],
  not_qualified: [],
  enrichment_pending: ["contact_ready", "no_contact", "human_review"],
  contact_ready: ["outreach_queued", "human_review", "do_not_contact"],
  no_contact: ["human_review", "lost"],
  outreach_queued: ["contacted", "bounced", "human_review", "do_not_contact"],
  contacted: ["followup_1", "replied", "bounced", "unsubscribed", "not_interested", "do_not_contact", "human_review"],
  followup_1: ["followup_2", "replied", "bounced", "unsubscribed", "not_interested", "do_not_contact", "human_review"],
  followup_2: ["replied", "bounced", "unsubscribed", "not_interested", "do_not_contact", "human_review", "lost"],
  replied: ["interested", "not_interested", "unsubscribed", "human_review", "do_not_contact"],
  interested: ["signup", "human_review", "not_interested", "lost"],
  signup: ["activated", "human_review", "lost"],
  activated: ["paying", "lost"],
  paying: ["retained", "lost"],
  retained: ["lost"],
  // Estados alternativos/terminais.
  not_interested: [],
  bounced: [],
  unsubscribed: [],
  do_not_contact: [],
  lost: [],
  human_review: ["contacted", "replied", "interested", "qualified", "not_qualified", "outreach_queued", "do_not_contact", "lost"],
};

/** Normaliza o alvo "wrong_contact" (não é estado; vira human_review). */
/** Verifica se uma transição é permitida. */
export function canTransition(from: AutomationState, to: AutomationState): boolean {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/** Valida e devolve a próxima transição, ou lança erro se for inválida. */
export function assertTransition(from: AutomationState, to: AutomationState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transição inválida: ${from} -> ${to}`);
  }
}

export function isTerminal(state: AutomationState): boolean {
  return TERMINAL_STATES.has(state);
}

/** Limiares de confiança de contacto (0-100). */
export const HIGH_CONFIDENCE = 70;
export const MEDIUM_CONFIDENCE = 40;

/**
 * Decide o estado com base na confiança do melhor contacto encontrado.
 * Determinístico e conservador: confiança baixa vai para revisão humana.
 */
export function classifyContactConfidence(confidence: number): {
  level: "high" | "medium" | "low";
  state: "contact_ready" | "human_review";
} {
  if (confidence >= HIGH_CONFIDENCE) return { level: "high", state: "contact_ready" };
  if (confidence >= MEDIUM_CONFIDENCE) return { level: "medium", state: "contact_ready" };
  return { level: "low", state: "human_review" };
}

/**
 * Decide o próximo estado após uma resposta classificada. Determinístico:
 * as ações críticas (unsubscribe) são tratadas sem depender de LLM.
 */
export function stateForReply(
  classification: "interested" | "not_interested" | "unsubscribe" | "wants_demo" | "wants_trial" | "pricing_question" | "product_question" | "objection" | "wrong_contact" | "out_of_office" | "bounce" | "needs_human",
): AutomationState {
  switch (classification) {
    case "unsubscribe":
      return "unsubscribed";
    case "not_interested":
      return "not_interested";
    case "wrong_contact":
      return "human_review";
    case "out_of_office":
      return "contacted"; // Não é uma resposta real; mantém em contacto (reagenda follow-up).
    case "bounce":
      return "bounced";
    case "needs_human":
      return "human_review";
    case "interested":
    case "wants_demo":
    case "wants_trial":
      return "interested";
    case "pricing_question":
    case "product_question":
    case "objection":
      return "replied";
    default:
      return "human_review";
  }
}


