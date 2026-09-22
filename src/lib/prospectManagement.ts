/**
 * Adjudata — Prospeção B2B: Gestão de Prospeção (FASE 6). Camada de domínio + I/O.
 *
 * Esta fase é a área de GESTÃO no back-office: visão única para rever
 * empresas-prospecto, filtrar, abrir o detalhe e executar ações administrativas.
 *
 * O trabalho autoritativo (filtros, agregações, transições de estado) corre no
 * backend (RPCs `prospect_management_*`). Aqui vive apenas:
 *   * os contratos de tipos (espelham o payload dos RPCs);
 *   * a camada de I/O Supabase;
 *   * helpers puros e testáveis (rótulos, elegibilidade, formatação).
 *
 * Esta fase NÃO envia emails, NÃO cria campanhas e NÃO inscreve nada no
 * Autopilot. "Preparar para Autopilot" apenas marca o prospecto como pronto.
 */

import { supabase } from "@/lib/supabase";
import type { CommercialStatus, EnrichmentStatus, EmailType } from "./prospectCompanies";

/** Ação administrativa sobre um prospecto. */
export const MANAGEMENT_ACTIONS = [
  "APPROVE",
  "REJECT",
  "READY_AUTOPILOT",
  "OPT_OUT",
  "RESET",
] as const;
export type ManagementAction = (typeof MANAGEMENT_ACTIONS)[number];

export const managementActionLabel: Record<ManagementAction, string> = {
  APPROVE: "Aprovar",
  REJECT: "Rejeitar",
  READY_AUTOPILOT: "Preparar para Autopilot",
  OPT_OUT: "Aplicar opt-out",
  RESET: "Reiniciar estado",
};

export const managementActionDescription: Record<ManagementAction, string> = {
  APPROVE: "Marca o prospecto como elegível para contacto comercial.",
  REJECT: "Rejeita o prospecto. Não será priorizado.",
  READY_AUTOPILOT: "Marca como pronto para o Autopilot. Não inscreve em campanhas.",
  OPT_OUT: "Aplica opt-out definitivo. Impede qualquer contacto futuro.",
  RESET: "Devolve o estado comercial a Novo. Nunca repõe um opt-out.",
};

/** Descrição das ações quando aplicadas em lote (âmbito plural e seleção). */
export const managementBulkActionDescription: Record<ManagementAction, string> = {
  APPROVE: "Marca todos os prospects selecionados como elegíveis para contacto comercial.",
  REJECT: "Rejeita todos os prospects selecionados. Não serão priorizados.",
  READY_AUTOPILOT: "Marca os selecionados como prontos para o Autopilot. Não inscreve em campanhas.",
  OPT_OUT: "Aplica opt-out definitivo a todos os selecionados. Impede qualquer contacto futuro.",
  RESET: "Devolve o estado comercial dos selecionados a Novo. Nunca repõe um opt-out.",
};

/**
 * Ordem canónica das ações administrativas (individual e em lote). Uma única
 * fonte de verdade para a UI do detalhe e da listagem, evitando divergência.
 */
export const managementActions: ManagementAction[] = [
  "APPROVE",
  "READY_AUTOPILOT",
  "REJECT",
  "OPT_OUT",
  "RESET",
];

/**
 * Resultado da aplicação de uma ação a um único prospecto dentro de um lote.
 * Espelha linha a linha o payload de `prospect_management_action_bulk`.
 */
export type ManagementBulkResult = {
  prospect_id: string;
  applied: boolean;
  commercial_status: string | null;
  enrichment_status: string | null;
  opt_out: boolean | null;
  error: string | null;
};

/** Etiquetas legíveis do estado comercial (espelha o funil de prospeção). */
export const commercialStatusLabelDetailed: Record<string, string> = {
  NEW: "Novo",
  ELIGIBLE: "Elegível",
  REJECTED: "Rejeitado",
  READY_FOR_AUTOPILOT: "Pronto para Autopilot",
  IN_AUTOPILOT: "No Autopilot",
  CONTACTED: "Contactado",
  CONVERTED: "Convertido",
  OPTED_OUT: "Opt-out",
};

/** Etiquetas legíveis do estado de enriquecimento. */
export const enrichmentStatusLabelDetailed: Record<string, string> = {
  NEW: "Novo",
  PENDING_ENRICHMENT: "A enriquecer",
  WEBSITE_FOUND: "Website encontrado",
  CONTACT_FOUND: "Contacto encontrado",
  VALIDATED: "Validado",
  ELIGIBLE: "Elegível",
  REJECTED: "Rejeitado",
  READY_FOR_AUTOPILOT: "Pronto para Autopilot",
};

export const emailTypeLabelDetailed: Record<string, string> = {
  geral: "Geral",
  comercial: "Comercial",
  suporte: "Suporte",
  outro: "Outro",
};

/** Métricas agregadas do funil de gestão. */
export type ProspectManagementMetrics = {
  total: number;
  opted_out: number;
  ready_for_autopilot: number;
  in_autopilot: number;
  contacted: number;
  converted: number;
  rejected: number;
  with_website: number;
  with_valid_contact: number;
  enriched: number;
  with_public_contact: number;
  by_status: { status: string; count: number }[];
  by_enrichment: { status: string; count: number }[];
};

/** Linha da listagem de gestão. */
export type ProspectManagementRow = {
  id: string;
  name: string;
  nif: string | null;
  cae: string | null;
  district: string | null;
  municipality: string | null;
  localidade: string | null;
  estimated_size: string | null;
  website: string | null;
  domain: string | null;
  email: string | null;
  email_type: EmailType | string | null;
  enrichment_status: EnrichmentStatus | string;
  commercial_status: CommercialStatus | string;
  commercial_score: number | null;
  score_reason: string | null;
  matching_opportunities: number;
  estimated_opportunity_value: number | null;
  cpv_codes: string[];
  categories: string[];
  opt_out: boolean;
  contact_count: number;
  last_contacted_at: string | null;
  enriched: boolean;
  has_public_contact: boolean;
  created_at: string;
  updated_at: string;
  total_count: number;
};

/** Contacto público recolhido (com proveniência). */
export type ManagementContact = {
  id: string;
  contacto: string;
  normalizado: string;
  source_url: string;
  domain: string;
  contact_type: "email" | "phone";
  classification: "GENERIC_BUSINESS" | "NAMED_PERSON" | "UNKNOWN";
  confidence: number;
  method: string;
  collected_at: string;
  note: string | null;
  is_opt_out: boolean;
};

/** Execução de enriquecimento registada. */
export type ManagementEnrichmentRun = {
  id: string;
  status: string;
  website: string | null;
  domain: string | null;
  website_confidence: number | null;
  website_method: string | null;
  pages_crawled: number;
  contacts_found: number;
  emails_found: number;
  phones_found: number;
  skipped_reason: string | null;
  error: string | null;
  created_at: string;
};

/** Atividade comercial registada. */
export type ManagementActivity = {
  id: string;
  activity_type: string;
  outcome: string | null;
  notes: string | null;
  occurred_at: string;
  next_action_at: string | null;
};

/** Contexto do Radar (oportunidades/CPV) quando a empresa está ligada. */
export type ManagementRadarContext = {
  company_id: string;
  participation_count: number;
  participation_12m: number;
  award_count: number;
  total_award_value: number;
  last_participation: string | null;
  competitor_count: number;
} | null;

/** Detalhe completo de um prospecto de gestão. */
export type ProspectManagementDetail = {
  id: string;
  name: string;
  nif: string | null;
  cae: string | null;
  activity_description: string | null;
  district: string | null;
  municipality: string | null;
  localidade: string | null;
  estimated_size: string | null;
  website: string | null;
  domain: string | null;
  email: string | null;
  email_type: EmailType | string | null;
  phone: string | null;
  enrichment_status: EnrichmentStatus | string;
  commercial_status: CommercialStatus | string;
  commercial_score: number | null;
  score_reason: string | null;
  matching_opportunities: number;
  estimated_opportunity_value: number | null;
  cpv_codes: string[];
  categories: string[];
  opt_out: boolean;
  opt_out_at: string | null;
  opt_out_reason: string | null;
  contact_count: number;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  radar: ManagementRadarContext;
  contacts: ManagementContact[];
  enrichment_history: ManagementEnrichmentRun[];
  activities: ManagementActivity[];
};

/** Filtros da listagem de gestão. */
export type ProspectManagementFilters = {
  query?: string | null;
  commercialStatus?: string | null;
  enrichmentStatus?: string | null;
  minScore?: number | null;
  maxScore?: number | null;
  cae?: string | null;
  cpv?: string | null;
  district?: string | null;
  category?: string | null;
  emailType?: string | null;
  hasWebsite?: boolean;
  hasEmail?: boolean;
  includeOptOut?: boolean;
  minOpportunities?: number | null;
  minValue?: number | null;
  page?: number;
  pageSize?: number;
};

export const emptyManagementFilters: ProspectManagementFilters = {
  query: null,
  commercialStatus: null,
  enrichmentStatus: null,
  minScore: null,
  maxScore: null,
  cae: null,
  cpv: null,
  district: null,
  category: null,
  emailType: null,
  hasWebsite: false,
  hasEmail: false,
  includeOptOut: false,
  minOpportunities: null,
  minValue: null,
  page: 1,
  pageSize: 25,
};

/**
 * Um prospecto está bloqueado para qualquer contacto/campanha quando tem
 * opt-out explícito ou estado OPTED_OUT. Lógica pura, espelha o backend.
 */
export function isContactBlocked(prospect: {
  opt_out: boolean;
  commercial_status: string;
}): boolean {
  return prospect.opt_out === true || prospect.commercial_status === "OPTED_OUT";
}

/**
 * Uma ação é permitida num determinado estado? Regras:
 *   * nunca se reativa um prospecto com opt-out (APPROVE/READY_AUTOPILOT/RESET);
 *   * OPT_OUT é sempre permitido (é idempotente);
 *   * REJECT é sempre permitido.
 */
export function canRunManagementAction(
  action: ManagementAction,
  prospect: { opt_out: boolean; commercial_status: string },
): boolean {
  if (action === "OPT_OUT" || action === "REJECT") return true;
  return !isContactBlocked(prospect);
}

/** Total de itens paginados (a partir da coluna `total_count`). */
export function managementTotal(rows: ProspectManagementRow[]): number {
  return rows[0]?.total_count ?? 0;
}

/** Calcula o número de páginas para um total e tamanho de página. */
export function managementPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Ids da página atual que podem ser selecionados para ações em lote. */
export function selectableRowIds(rows: ProspectManagementRow[]): string[] {
  return rows
    .filter((row) => typeof row.id === "string" && row.id.length > 0)
    .map((row) => row.id);
}

/**
 * Remove ids que não constam na lista visível (evita agir sobre linhas que
 * desapareceram com a paginação/filtros). Devolve em ordem determinística.
 */
export function pruneSelection(selected: string[], rows: ProspectManagementRow[]): string[] {
  const visible = new Set(selectableRowIds(rows));
  return selected.filter((id) => visible.has(id));
}

/** Resumo agregado do resultado de um lote. */
export function summarizeBulkResults(results: ManagementBulkResult[]): {
  total: number;
  applied: number;
  failed: number;
} {
  const applied = results.filter((result) => result.applied).length;
  return { total: results.length, applied, failed: results.length - applied };
}

/** Mensagem legível do resultado de um lote para a UI. */
export function bulkResultMessage(action: ManagementAction, results: ManagementBulkResult[]): string {
  const { total, applied, failed } = summarizeBulkResults(results);
  const label = managementActionLabel[action].toLowerCase();
  if (total === 0) return "Nenhum prospect selecionado.";
  if (failed === 0) return `${applied} prospecto(s): "${label}" aplicado(s) com sucesso.`;
  if (applied === 0) return `Não foi possível aplicar "${label}" a nenhum dos ${total} prospecto(s) selecionado(s).`;
  return `${applied} de ${total} prospecto(s) atualizados. ${failed} bloqueado(s) — ver detalhe.`;
}

/** Formata um valor em euros (máx. 0 decimais) ou "—". */
export function formatEuroShort(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Resultado da preparação de um prospecto para o Autopilot (FASE 9). */
export type PrepareAutopilotItem = {
  prospect_id: string;
  company_id: string | null;
  ok: boolean;
  reason: string;
};

/** Mensagem de Autopilot gerada por empresa (FASE 9). */
export type AutopilotMessage = {
  message_id: string;
  enrollment_id: string;
  company_id: string | null;
  company_name: string | null;
  company_nif: string | null;
  to_email: string;
  subject: string;
  status: string;
  step_position: number;
  created_at: string;
  sent_at: string | null;
};

/** Rótulos legíveis do estado de uma mensagem de outreach (fila de aprovação). */
export const outreachMessageStatusLabel: Record<string, string> = {
  queued: "Em fila",
  pending_approval: "A aguardar aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  sent: "Enviada",
  failed: "Falhou",
  skipped: "Ignorada",
};

/**
 * Resume a preparação para o Autopilot: quantos ficaram inscritos e quantos
 * ficaram bloqueados (com motivo). Pura e testável.
 */
export function summarizePrepareResults(results: PrepareAutopilotItem[]): {
  total: number;
  prepared: number;
  blocked: number;
} {
  const prepared = results.filter((result) => result.ok).length;
  return { total: results.length, prepared, blocked: results.length - prepared };
}

/** Mensagem legível do resultado da preparação para o Autopilot. */
export function prepareResultMessage(results: PrepareAutopilotItem[]): string {
  const { total, prepared, blocked } = summarizePrepareResults(results);
  if (total === 0) return "Nenhum prospect selecionado.";
  if (blocked === 0) return `${prepared} empresa(s) inscritas no Autopilot. A mensagem será preparada por empresa.`;
  if (prepared === 0) return `Não foi possível inscrever nenhuma das ${total} empresas. Ver detalhe dos bloqueios.`;
  return `${prepared} de ${total} empresa(s) inscritas no Autopilot. ${blocked} bloqueada(s) — ver detalhe.`;
}
// ---------------------------------------------------------------------------
// I/O — Supabase
// ---------------------------------------------------------------------------

/** Obtém as métricas agregadas do funil de gestão. */
export async function getManagementMetrics(): Promise<ProspectManagementMetrics> {
  const { data, error } = await supabase.rpc("prospect_management_metrics");
  if (error) throw error;
  return data as ProspectManagementMetrics;
}

/** Lista prospects de gestão (filtrada e paginada). */
export async function listManagementProspects(
  filters: ProspectManagementFilters = {},
): Promise<ProspectManagementRow[]> {
  const { data, error } = await supabase.rpc("prospect_management_list", {
    p_query: filters.query ?? null,
    p_commercial_status: filters.commercialStatus ?? null,
    p_enrichment_status: filters.enrichmentStatus ?? null,
    p_min_score: filters.minScore ?? null,
    p_max_score: filters.maxScore ?? null,
    p_cae: filters.cae ?? null,
    p_cpv: filters.cpv ?? null,
    p_district: filters.district ?? null,
    p_category: filters.category ?? null,
    p_email_type: filters.emailType ?? null,
    p_has_website: filters.hasWebsite ?? false,
    p_has_email: filters.hasEmail ?? false,
    p_opt_out: filters.includeOptOut ?? false,
    p_min_opportunities: filters.minOpportunities ?? null,
    p_min_value: filters.minValue ?? null,
    p_page: filters.page ?? 1,
    p_page_size: filters.pageSize ?? 25,
  });
  if (error) throw error;
  return (data ?? []) as ProspectManagementRow[];
}

/** Obtém o detalhe consolidado de um prospecto. */
export async function getManagementDetail(id: string): Promise<ProspectManagementDetail> {
  const { data, error } = await supabase.rpc("prospect_management_detail", { p_id: id });
  if (error) throw error;
  return data as ProspectManagementDetail;
}

/** Executa uma ação administrativa auditada sobre um prospecto. */
export async function runManagementAction(
  id: string,
  action: ManagementAction,
  reason?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("prospect_management_action", {
    p_id: id,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

/**
 * Aplica a mesma ação administrativa a vários prospectos em lote. Cada item é
 * processado de forma independente no backend (mesmas regras e auditoria do
 * caso individual) e o resultado por prospecto é devolvido, sem silenciar
 * falhas (ex.: tentar reativar um opt-out devolve `applied: false` com motivo).
 */
export async function runManagementBulkAction(
  ids: string[],
  action: ManagementAction,
  reason?: string | null,
): Promise<ManagementBulkResult[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.rpc("prospect_management_action_bulk", {
    p_ids: ids,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ManagementBulkResult[];
}

/**
 * Inscreve um lote de prospectos no Autopilot (FASE 9). Para cada empresa:
 * garante um contacto de email comercial, assume o prospecto no Autopilot e cria
 * a inscrição (que gera a mensagem por empresa no próximo ciclo do worker).
 * Devolve, por prospecto, se ficou inscrito ou o motivo do bloqueio — nunca
 * silencia falhas (sem email, sem empresa no Radar, opt-out, suppression).
 */
export async function prepareProspectsForAutopilot(
  ids: string[],
  campaignId?: string | null,
): Promise<PrepareAutopilotItem[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.rpc("prospect_prepare_autopilot_bulk", {
    p_ids: ids,
    p_campaign_id: campaignId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as PrepareAutopilotItem[];
}

/** Lista as mensagens de Autopilot geradas por empresa (para confirmação na UI). */
export async function listAutopilotMessages(limit = 50): Promise<AutopilotMessage[]> {
  const { data, error } = await supabase.rpc("prospect_autopilot_messages_list", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as AutopilotMessage[];
}
