import { supabase } from "./supabase";

/**
 * Painel de controlo do autopilot — camada de I/O (Supabase).
 *
 * Reúne métricas de outbound, inbound, ciclo de vida e da fila numa só chamada
 * (`autopilot_dashboard`), mais os logs recentes e o "touch" de atividade.
 */

export type AutopilotFlags = {
  sales_autopilot_enabled?: boolean;
  auto_outreach_enabled?: boolean;
  auto_reply_enabled?: boolean;
  customer_lifecycle_enabled?: boolean;
  autopilot_dry_run?: boolean;
  autopilot_kill_switch?: boolean;
  autopilot_ai_enabled?: boolean;
};

export type AutopilotDashboard = {
  outreach?: Record<string, unknown> & { error?: string };
  inbound?: Record<string, unknown> & { error?: string };
  lifecycle?: Record<string, unknown> & { error?: string };
  queue?: {
    queued_jobs?: number;
    processing_jobs?: number;
    failed_jobs?: number;
    automation_prospects?: number;
    error?: string;
  };
  flags?: AutopilotFlags;
  error?: string;
};

export type AutomationRunRow = {
  id: string;
  level: string;
  step: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function fetchAutopilotDashboard(): Promise<AutopilotDashboard> {
  const { data, error } = await supabase.rpc("autopilot_dashboard");
  if (error) throw error;
  return (data ?? {}) as AutopilotDashboard;
}

export async function fetchRecentRuns(limit = 50): Promise<AutomationRunRow[]> {
  const { data, error } = await supabase.rpc("automation_recent_runs", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as AutomationRunRow[];
}

/** Marca o utilizador como "visto agora" (chamado pela app autenticada). */
export async function touchActivity(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.rpc("activity_touch");
}

export const runLevelClass: Record<string, string> = {
  info: "text-cyan-300 border-cyan-400/20 bg-cyan-400/5",
  warn: "text-amber-300 border-amber-400/20 bg-amber-400/5",
  error: "text-rose-300 border-rose-400/20 bg-rose-400/5",
};
