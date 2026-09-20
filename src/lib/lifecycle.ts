import { supabase } from "./supabase";
import type { LifecycleStage } from "./customerLifecycle";

/**
 * Ciclo de vida de clientes — camada de I/O (Supabase).
 *
 * Leitura para o back-office/account. A escrita/transição é feita pelo worker
 * `autopilot-lifecycle` (service role) via RPCs de serviço.
 */

export type CustomerLifecycleRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  subscription_id: string | null;
  stage: LifecycleStage;
  health_score: number;
  searches_30d: number;
  logins_30d: number;
  last_seen_at: string | null;
  renewal_due_at: string | null;
  churn_risk_reason: string | null;
  updated_at: string;
};

export type LifecycleEventRow = {
  id: string;
  user_id: string;
  from_stage: string | null;
  to_stage: string;
  reason: string | null;
  source: string;
  created_at: string;
};

export type ValueReportRow = {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  body: string;
  status: "generated" | "sent" | "failed";
  sent_at: string | null;
  created_at: string;
};

export type OnboardingTask = {
  id: string;
  user_id: string;
  task_key: string;
  label: string;
  completed_at: string | null;
};

export type LifecycleMetrics = {
  by_stage?: Record<string, number>;
  at_risk?: number;
  renewals_30d?: number;
  value_reports_30d?: number;
  error?: string;
};

export async function fetchLifecycleClients(limit = 100): Promise<CustomerLifecycleRow[]> {
  const { data, error } = await supabase
    .from("customer_lifecycle")
    .select("id,user_id,plan_id,subscription_id,stage,health_score,searches_30d,logins_30d,last_seen_at,renewal_due_at,churn_risk_reason,updated_at")
    .order("health_score", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CustomerLifecycleRow[];
}

export async function fetchMyLifecycle(): Promise<CustomerLifecycleRow | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("customer_lifecycle")
    .select("id,user_id,plan_id,subscription_id,stage,health_score,searches_30d,logins_30d,last_seen_at,renewal_due_at,churn_risk_reason,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as CustomerLifecycleRow | null;
}

export async function fetchMyOnboarding(): Promise<OnboardingTask[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("onboarding_tasks")
    .select("id,user_id,task_key,label,completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OnboardingTask[];
}

export async function fetchLifecycleEvents(userId: string, limit = 50): Promise<LifecycleEventRow[]> {
  const { data, error } = await supabase
    .from("lifecycle_events")
    .select("id,user_id,from_stage,to_stage,reason,source,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LifecycleEventRow[];
}

export async function fetchLifecycleMetrics(): Promise<LifecycleMetrics> {
  const { data, error } = await supabase.rpc("lifecycle_metrics");
  if (error) throw error;
  return (data ?? {}) as LifecycleMetrics;
}
