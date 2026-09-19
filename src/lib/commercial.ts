import { supabase } from "@/lib/supabase";

export type CommissionKind =
  | "direct_first"
  | "direct_follow"
  | "direct_annual"
  | "retention"
  | "team_second_month"
  | "team_annual"
  | "team_level2"
  | "recruiter";

export type EarningRow = {
  id: string;
  created_at: string;
  commission_type: string;
  kind: CommissionKind | string | null;
  level: number;
  amount: number;
  status: "pending" | "approved" | "paid" | "cancelled";
  status_at: string;
  client_email: string | null;
  source_email: string | null;
  rule_version: number | null;
  note: string | null;
};

export type ClientRow = {
  client_user_id: string;
  client_email: string | null;
  plan_id: string | null;
  status: string | null;
  started_at: string;
  current_period_end: string | null;
  is_annual: boolean;
  commercial_user_id: string;
  commercial_email: string | null;
  commission_total: number;
};

export type ReferralInfo = {
  code: string;
  link: string;
};

/** Devolve (ou cria) o código de referência do comercial autenticado. */
export async function fetchMyReferralCode(): Promise<ReferralInfo | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase.rpc("commercial_ensure_referral_code", {
    p_user_id: userId,
  });
  if (error || !data) return null;

  const code = data as unknown as string;
  const base =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://adjudata.pt";

  return { code, link: `${base}/planos?ref=${code}` };
}

export async function fetchMyClients(): Promise<ClientRow[]> {
  const { data, error } = await supabase.rpc("commercial_my_clients");
  if (error) throw error;
  return (data ?? []) as ClientRow[];
}

export async function fetchMyEarnings(): Promise<EarningRow[]> {
  const { data, error } = await supabase.rpc("commercial_my_earnings");
  if (error) throw error;
  return (data ?? []) as EarningRow[];
}

export const commissionKindLabel: Record<string, string> = {
  direct_first: "1.ª mensalidade (100%)",
  direct_follow: "Mensalidade seguinte (10%)",
  direct_annual: "Subscrição anual (20%)",
  retention: "Bónus de retenção (3%)",
  team_second_month: "Equipa — 2.ª mensalidade (50%)",
  team_annual: "Equipa — anual (5%)",
  team_level2: "Equipa nível 2",
  recruiter: "Bónus de recrutamento (5%)",
};

export const commissionStatusLabel: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  paid: "Paga",
  cancelled: "Cancelada",
};

export function formatEuro(value: number): string {
  return Number(value).toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
  });
}

// ---------------------------------------------------------------------------
// Gestão (admin / gestor comercial)
// ---------------------------------------------------------------------------

export type TeamEarningRow = {
  id: string;
  created_at: string;
  beneficiary_email: string | null;
  commission_type: string;
  kind: string | null;
  level: number;
  amount: number;
  status: "pending" | "approved" | "paid" | "cancelled";
  client_email: string | null;
  note: string | null;
};

export async function fetchTeamEarnings(): Promise<TeamEarningRow[]> {
  const { data, error } = await supabase.rpc("commercial_team_earnings");
  if (error) throw error;
  return (data ?? []) as TeamEarningRow[];
}

export async function attributeClient(
  clientUserId: string,
  commercialUserId: string,
  method: "manual" | "referral_link" | "prospection" = "manual",
): Promise<void> {
  const { error } = await supabase.rpc("commercial_attribute_client", {
    p_client_user_id: clientUserId,
    p_commercial_user_id: commercialUserId,
    p_method: method,
  });
  if (error) throw error;
}

export async function markCommissionPaid(id: string): Promise<void> {
  const { error } = await supabase.rpc("commercial_mark_paid", { p_commission_id: id });
  if (error) throw error;
}

export async function approveCommission(id: string): Promise<void> {
  const { error } = await supabase.rpc("commercial_approve_commission", { p_commission_id: id });
  if (error) throw error;
}

export async function cancelCommission(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("commercial_cancel_commission", {
    p_commission_id: id,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export type AdminOption = { kind: "client" | "commercial"; user_id: string; email: string | null; role: string | null };

export async function fetchAdminOptions(): Promise<AdminOption[]> {
  const { data, error } = await supabase.rpc("commercial_admin_options");
  if (error) throw error;
  return (data ?? []) as AdminOption[];
}

// ---------------------------------------------------------------------------
// Termos do programa comercial
// ---------------------------------------------------------------------------

export type ProgramTerms = {
  terms_id: string;
  version: number;
  title: string;
  body: string;
  effective_from: string;
};

export type TermsStatus = {
  accepted: boolean;
  accepted_version: number | null;
  current_version: number;
};

export async function fetchCurrentTerms(): Promise<ProgramTerms | null> {
  const { data, error } = await supabase.rpc("commercial_current_terms");
  if (error) throw error;
  const rows = (data ?? []) as ProgramTerms[];
  return rows[0] ?? null;
}

export async function fetchMyTermsStatus(): Promise<TermsStatus | null> {
  const { data, error } = await supabase.rpc("commercial_my_terms_status");
  if (error) throw error;
  const rows = (data ?? []) as TermsStatus[];
  return rows[0] ?? null;
}

/** Registra a aceitação da versão corrente. Devolve a versão aceite. */
export async function acceptTerms(): Promise<number> {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : null;
  const { data, error } = await supabase.rpc("commercial_accept_terms", {
    p_user_agent: userAgent,
  });
  if (error) throw error;
  return data as unknown as number;
}

// ---------------------------------------------------------------------------
// Correio comercial (envio)
// ---------------------------------------------------------------------------

export const COMMERCIAL_FROM_EMAIL = "comercial@adjudata.pt";

export type MailSender = {
  user_id: string;
  display_name: string;
  reply_to: string | null;
  signature_note: string;
};

export type SentEmail = {
  id: string;
  to_email: string;
  subject: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  sent_at: string | null;
  created_at: string;
  created_by_email: string | null;
};

export type EmailDetail = {
  id: string;
  to_email: string;
  cc: string | null;
  subject: string;
  body: string;
  rendered_body: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

export async function fetchMySender(): Promise<MailSender | null> {
  const { data, error } = await supabase.rpc("commercial_ensure_sender");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as MailSender | null;
}

export async function updateMySender(input: {
  displayName: string;
  replyTo?: string;
  signatureNote?: string;
}): Promise<MailSender> {
  const { data, error } = await supabase.rpc("commercial_update_sender", {
    p_display_name: input.displayName,
    p_reply_to: input.replyTo ?? null,
    p_signature_note: input.signatureNote ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as MailSender;
}

export async function fetchMySentEmails(limit = 100): Promise<SentEmail[]> {
  const { data, error } = await supabase.rpc("commercial_my_sent_emails", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as SentEmail[];
}

export async function fetchEmailDetail(id: string): Promise<EmailDetail | null> {
  const { data, error } = await supabase.rpc("commercial_email_detail", {
    p_message_id: id,
  });
  if (error) throw error;
  const rows = (data ?? []) as EmailDetail[];
  return rows[0] ?? null;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  companyId?: string;
  clientUserId?: string;
  prospectId?: string;
};

/** Envia email via Edge Function (remetente único + assinatura automática). */
export async function sendCommercialEmail(
  input: SendEmailInput,
): Promise<{ ok: boolean; id?: string }> {
  const { data, error } = await supabase.functions.invoke(
    "send-commercial-email",
    {
      body: {
        to: input.to,
        subject: input.subject,
        body: input.body,
        cc: input.cc ?? null,
        company_id: input.companyId ?? null,
        client_user_id: input.clientUserId ?? null,
        prospect_id: input.prospectId ?? null,
      },
    },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { ok: true, id: data?.id };
}

export const emailStatusLabel: Record<string, string> = {
  queued: "Em fila",
  sent: "Enviado",
  failed: "Falhou",
};
