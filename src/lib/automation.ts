import { supabase } from "./supabase";
import {
  AUTOMATION_DEFAULTS,
  AutomationSettings,
  canSendRealEmail,
  isWithinSendWindow,
  settingsFromRows,
} from "./automationConfig";

/**
 * Sales Autopilot — wrappers com I/O (Supabase).
 *
 * Os valores vivem em `public.app_settings` (Supabase) e são geridos pelo
 * back-office. Tudo nasce DESLIGADO. A lógica pura (defaults, decisão de
 * envio, janela de envio) está em `automationConfig.ts`.
 */

export {
  AUTOMATION_DEFAULTS,
  canSendRealEmail,
  isWithinSendWindow,
  settingsFromRows,
};
export type { AutomationSettings };

export async function fetchAutomationSettings(): Promise<AutomationSettings> {
  const { data, error } = await supabase.rpc("automation_settings");
  if (error) throw error;
  return settingsFromRows((data ?? []) as { key: string; value: unknown }[]);
}

export async function updateAutomationSetting(key: keyof AutomationSettings, value: unknown) {
  const { error } = await supabase.rpc("automation_set_setting", { p_key: key, p_value: value });
  if (error) throw error;
}

/** Kill switch: desliga imediatamente todos os envios. */
export async function setKillSwitch(enabled: boolean) {
  await updateAutomationSetting("autopilot_kill_switch", enabled);
}

// ---------------------------------------------------------------------------
// Estado e suppression (back-office)
// ---------------------------------------------------------------------------

export type AutomationStateCount = { state: string; count: number };

export type AutomationEventRow = {
  prospect_id: string;
  from_state: string | null;
  to_state: string;
  reason: string | null;
  created_at: string;
};

export type AutomationStatus = {
  organization_id?: string;
  queued_jobs?: number;
  processing_jobs?: number;
  failed_jobs?: number;
  automation_prospects?: number;
  by_autopilot_state?: AutomationStateCount[];
  recent_events?: AutomationEventRow[];
  error?: string;
};

export async function fetchAutomationStatus(): Promise<AutomationStatus> {
  const { data, error } = await supabase.rpc("automation_status");
  if (error) throw error;
  return (data ?? {}) as AutomationStatus;
}

export type SuppressionRow = {
  id: string;
  email: string | null;
  domain: string | null;
  company_id: string | null;
  reason: string;
  source: string;
  created_at: string;
};

export async function fetchSuppressions(limit = 100): Promise<SuppressionRow[]> {
  const { data, error } = await supabase.rpc("automation_suppressions", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as SuppressionRow[];
}

// ---------------------------------------------------------------------------
// Fila de aprovação humana (FASE 7)
// ---------------------------------------------------------------------------

export type PendingApproval = {
  id: string;
  enrollment_id: string;
  company_id: string | null;
  company_name: string | null;
  to_email: string;
  subject: string;
  body: string;
  step_position: number;
  created_at: string;
};

export type ApprovalMetrics = {
  pending?: number;
  approved_7d?: number;
  rejected_7d?: number;
  error?: string;
};

export async function fetchPendingApprovals(limit = 50): Promise<PendingApproval[]> {
  const { data, error } = await supabase.rpc("outreach_pending_approvals", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as PendingApproval[];
}

export async function decideApproval(messageId: string, decision: "approve" | "reject", note?: string) {
  const { error } = await supabase.rpc("outreach_decide_approval", {
    p_message_id: messageId, p_decision: decision, p_note: note ?? null,
  });
  if (error) throw error;
}

export async function fetchApprovalMetrics(): Promise<ApprovalMetrics> {
  const { data, error } = await supabase.rpc("outreach_approval_metrics");
  if (error) throw error;
  return (data ?? {}) as ApprovalMetrics;
}

export const suppressionReasonLabel: Record<string, string> = {
  unsubscribe: "Cancelou subscrição",
  do_not_contact: "Não contactar",
  bounce: "Email devolvido",
  complaint: "Queixa de spam",
  manual: "Manual",
  compliance: "Conformidade",
};

