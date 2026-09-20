import { supabase } from "./supabase";

/**
 * Outbound & campanhas — camada de I/O (Supabase).
 *
 * A UI do back-office usa estas funções para gerir campanhas, templates e
 * passos, e para ver métricas. O envio real é feito pelo worker `autopilot-outreach`.
 */

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  version: number;
  active: boolean;
  created_at: string;
};

export type OutreachCampaign = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "paused" | "archived";
  daily_limit: number;
  domain_daily_limit: number;
  created_at: string;
};

export type OutreachStep = {
  id: string;
  campaign_id: string;
  position: number;
  template_id: string | null;
  subject: string | null;
  body: string | null;
  delay_days: number;
};

export type OutreachMetrics = {
  active_enrollments?: number;
  sent_7d?: number;
  sent_30d?: number;
  opens_30d?: number;
  clicks_30d?: number;
  replies?: number;
  unsubscribes_30d?: number;
  bounces_30d?: number;
  error?: string;
};

export async function fetchTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from("email_templates")
    .select("id,name,subject,body,version,active,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmailTemplate[];
}

export async function fetchCampaigns(): Promise<OutreachCampaign[]> {
  const { data, error } = await supabase
    .from("outreach_campaigns")
    .select("id,name,description,status,daily_limit,domain_daily_limit,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OutreachCampaign[];
}

export async function fetchCampaignSteps(campaignId: string): Promise<OutreachStep[]> {
  const { data, error } = await supabase
    .from("outreach_steps")
    .select("id,campaign_id,position,template_id,subject,body,delay_days")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OutreachStep[];
}

export async function fetchOutreachMetrics(): Promise<OutreachMetrics> {
  const { data, error } = await supabase.rpc("outreach_metrics");
  if (error) throw error;
  return (data ?? {}) as OutreachMetrics;
}

export const campaignStatusLabel: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
  archived: "Arquivada",
};
