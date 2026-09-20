import { supabase } from "./supabase";

/**
 * Inbound & IA — camada de I/O (Supabase).
 *
 * A ingestão/classificação é feita pela Edge Function `inbound-email`. Estas
 * funções servem o back-office para ver conversas, classificações e métricas.
 */

export type Conversation = {
  id: string;
  prospect_id: string | null;
  company_id: string | null;
  contact_email: string;
  subject: string | null;
  status: "open" | "waiting" | "closed";
  last_message_at: string;
  created_at: string;
};

export type InboundMessage = {
  id: string;
  conversation_id: string | null;
  from_email: string;
  subject: string | null;
  body_text: string | null;
  received_at: string;
};

export type ReplyClassificationRow = {
  id: string;
  message_id: string;
  classification: string;
  confidence: number;
  method: "deterministic" | "ai" | "manual";
  rationale: string | null;
  created_at: string;
};

export type InboundMetrics = {
  open_conversations?: number;
  messages_7d?: number;
  by_classification?: Record<string, number>;
  needs_human?: number;
  error?: string;
};

export async function fetchConversations(limit = 50): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,prospect_id,company_id,contact_email,subject,status,last_message_at,created_at")
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function fetchInboundMessages(conversationId: string): Promise<InboundMessage[]> {
  const { data, error } = await supabase
    .from("inbound_messages")
    .select("id,conversation_id,from_email,subject,body_text,received_at")
    .eq("conversation_id", conversationId)
    .order("received_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InboundMessage[];
}

export async function fetchReplyClassifications(messageId: string): Promise<ReplyClassificationRow[]> {
  const { data, error } = await supabase
    .from("reply_classifications")
    .select("id,message_id,classification,confidence,method,rationale,created_at")
    .eq("message_id", messageId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReplyClassificationRow[];
}

export async function fetchInboundMetrics(): Promise<InboundMetrics> {
  const { data, error } = await supabase.rpc("inbound_metrics");
  if (error) throw error;
  return (data ?? {}) as InboundMetrics;
}

export const classificationLabel: Record<string, string> = {
  interested: "Interessado",
  not_interested: "Não interessado",
  unsubscribe: "Cancelou",
  wants_demo: "Quer demonstração",
  wants_trial: "Quer teste",
  pricing_question: "Pergunta preço",
  product_question: "Pergunta produto",
  objection: "Objeção",
  wrong_contact: "Contacto errado",
  out_of_office: "Fora do escritório",
  bounce: "Bounce",
  needs_human: "Requer humano",
};

export const methodLabel: Record<string, string> = {
  deterministic: "Regras",
  ai: "IA",
  manual: "Manual",
};
