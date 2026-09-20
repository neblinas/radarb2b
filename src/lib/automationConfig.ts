/**
 * Sales Autopilot — configuração pura (sem I/O).
 *
 * Este módulo NÃO importa o cliente Supabase, para poder ser testado isolado
 * (mesmo padrão de `prospecting.ts`). Os wrappers com I/O vivem em
 * `automation.ts`.
 */

export type AutomationSettings = {
  sales_autopilot_enabled: boolean;
  auto_outreach_enabled: boolean;
  auto_reply_enabled: boolean;
  customer_lifecycle_enabled: boolean;
  value_report_enabled: boolean;
  autopilot_dry_run: boolean;
  autopilot_kill_switch: boolean;
  autopilot_min_score: number;
  autopilot_max_sends_per_day: number;
  autopilot_max_sends_per_domain_per_day: number;
  autopilot_prospect_cooldown_days: number;
  autopilot_followup_count: number;
  autopilot_followup_gap_days: number;
  autopilot_ai_auto_reply: boolean;
  autopilot_ai_reply_confidence: number;
  autopilot_ai_enabled: boolean;
  autopilot_ai_max_calls_per_day: number;
  autopilot_require_approval: boolean;
  autopilot_send_hour_start: number;
  autopilot_send_hour_end: number;
  autopilot_send_weekdays_only: boolean;
};

export const AUTOMATION_DEFAULTS: AutomationSettings = {
  sales_autopilot_enabled: false,
  auto_outreach_enabled: false,
  auto_reply_enabled: false,
  customer_lifecycle_enabled: false,
  value_report_enabled: false,
  autopilot_dry_run: true,
  autopilot_kill_switch: false,
  autopilot_min_score: 60,
  autopilot_max_sends_per_day: 50,
  autopilot_max_sends_per_domain_per_day: 2,
  autopilot_prospect_cooldown_days: 30,
  autopilot_followup_count: 2,
  autopilot_followup_gap_days: 4,
  autopilot_ai_auto_reply: false,
  autopilot_ai_reply_confidence: 80,
  autopilot_ai_enabled: false,
  autopilot_ai_max_calls_per_day: 200,
  autopilot_require_approval: true,
  autopilot_send_hour_start: 8,
  autopilot_send_hour_end: 18,
  autopilot_send_weekdays_only: true,
};

/** Converte o mapa `{key,value}[]` da RPC no objeto tipado, aplicando defaults. */
export function settingsFromRows(rows: { key: string; value: unknown }[]): AutomationSettings {
  const merged: Record<string, unknown> = { ...AUTOMATION_DEFAULTS };
  for (const row of rows) {
    if (row.key in AUTOMATION_DEFAULTS) merged[row.key] = row.value;
  }
  return merged as AutomationSettings;
}

/**
 * Indica se o autopilot pode enviar email real. Exige que o autopilot esteja
 * ligado, o outreach ativo, o kill switch desligado e o dry-run desligado.
 */
export function canSendRealEmail(settings: AutomationSettings): boolean {
  return (
    settings.sales_autopilot_enabled &&
    settings.auto_outreach_enabled &&
    !settings.autopilot_kill_switch &&
    !settings.autopilot_dry_run
  );
}

/**
 * Indica se um email de outbound deve ficar à espera de aprovação humana.
 * Sim quando a aprovação está exigida E vamos enviar de facto (não em dry-run).
 * Em dúvida, é conservador: exige aprovação.
 */
export function shouldRequireApproval(settings: AutomationSettings): boolean {
  return settings.autopilot_require_approval && !settings.autopilot_dry_run;
}

export function isWithinSendWindow(settings: AutomationSettings, when = new Date()): boolean {
  const hour = when.getHours();
  if (hour < settings.autopilot_send_hour_start || hour >= settings.autopilot_send_hour_end) return false;
  if (settings.autopilot_send_weekdays_only) {
    const day = when.getDay();
    if (day === 0 || day === 6) return false;
  }
  return true;
}
