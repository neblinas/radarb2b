import { supabase } from "./supabase";

/**
 * Prospeção B2B — repositório de empresas-prospecto (FASE 2).
 *
 * Camada de I/O (Supabase) sobre a tabela `public.prospect_companies` e os RPCs
 * `prospect_company_*`. As regras de deduplicação, opt-out e transições de
 * estado vivem no backend (Postgres), nunca aqui.
 *
 * Esta fase é APENAS dados/backend base: não há pesquisa na Internet, crawling,
 * descoberta de websites, envio de emails nem integração com o Autopilot. A
 * função `isBlockedFromCampaigns` é a única salvaguarda relevante para as fases
 * seguintes.
 */

/** Estado de enriquecimento do prospecto. */
export const ENRICHMENT_STATUSES = [
  "NEW",
  "PENDING_ENRICHMENT",
  "WEBSITE_FOUND",
  "CONTACT_FOUND",
  "VALIDATED",
  "ELIGIBLE",
  "REJECTED",
  "READY_FOR_AUTOPILOT",
] as const;
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

/** Estado comercial do prospecto. */
export const COMMERCIAL_STATUSES = [
  "NEW",
  "ELIGIBLE",
  "REJECTED",
  "READY_FOR_AUTOPILOT",
  "IN_AUTOPILOT",
  "CONTACTED",
  "CONVERTED",
  "OPTED_OUT",
] as const;
export type CommercialStatus = (typeof COMMERCIAL_STATUSES)[number];

/** Tipo de email empresarial. */
export const EMAIL_TYPES = ["geral", "comercial", "suporte", "outro"] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

/** Dimensão estimada (espelha `company_lead_stats.inferred_size`). */
export const ESTIMATED_SIZES = ["micro", "pequeno", "medio", "grande"] as const;
export type EstimatedSize = (typeof ESTIMATED_SIZES)[number];

/** Registo completo de uma empresa-prospecto. */
export type ProspectCompany = {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  nif: string | null;
  nif_normalized: string | null;
  cae: string | null;
  activity_description: string | null;
  district: string | null;
  municipality: string | null;
  localidade: string | null;
  estimated_size: EstimatedSize | null;
  website: string | null;
  domain: string | null;
  phone: string | null;
  email: string | null;
  email_type: EmailType | null;
  contact_source_url: string | null;
  company_source: string | null;
  contact_source: string | null;
  discovered_at: string | null;
  last_verified_at: string | null;
  enrichment_status: EnrichmentStatus;
  commercial_score: number | null;
  score_reason: string | null;
  matching_opportunities: number;
  estimated_opportunity_value: number | null;
  commercial_status: CommercialStatus;
  last_contacted_at: string | null;
  contact_count: number;
  opt_out: boolean;
  opt_out_at: string | null;
  opt_out_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Linha de listagem (filtrada/paginada). */
export type ProspectCompanyListItem = {
  id: string;
  name: string;
  nif: string | null;
  cae: string | null;
  district: string | null;
  municipality: string | null;
  localidade: string | null;
  estimated_size: EstimatedSize | null;
  website: string | null;
  domain: string | null;
  email: string | null;
  email_type: EmailType | null;
  enrichment_status: EnrichmentStatus;
  commercial_status: CommercialStatus;
  commercial_score: number | null;
  score_reason: string | null;
  matching_opportunities: number;
  estimated_opportunity_value: number | null;
  opt_out: boolean;
  last_contacted_at: string | null;
  contact_count: number;
  created_at: string;
  updated_at: string;
  total_count: number;
};

/** Dados de entrada para criar um prospecto. */
export type CreateProspectCompanyInput = {
  name: string;
  nif?: string | null;
  cae?: string | null;
  activityDescription?: string | null;
  district?: string | null;
  municipality?: string | null;
  localidade?: string | null;
  estimatedSize?: EstimatedSize | null;
  website?: string | null;
  domain?: string | null;
  phone?: string | null;
  email?: string | null;
  emailType?: EmailType | null;
  contactSourceUrl?: string | null;
  companySource?: string | null;
  contactSource?: string | null;
  companyId?: string | null;
};

/** Dados de atualização (todos opcionais; só os definidos são aplicados). */
export type UpdateProspectCompanyInput = Partial<
  Omit<CreateProspectCompanyInput, "companyId">
> & {
  enrichmentStatus?: EnrichmentStatus | null;
  commercialStatus?: CommercialStatus | null;
  commercialScore?: number | null;
  scoreReason?: string | null;
  matchingOpportunities?: number | null;
  estimatedOpportunityValue?: number | null;
};

export type ListProspectCompaniesFilters = {
  query?: string | null;
  commercialStatus?: CommercialStatus | null;
  enrichmentStatus?: EnrichmentStatus | null;
  minScore?: number | null;
  maxScore?: number | null;
  includeOptedOut?: boolean;
  page?: number;
  pageSize?: number;
};

/** Normaliza um NIF para o identificador lógico (só dígitos). */
export function normalizeNif(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length ? digits : null;
}

/**
 * Extrai o domínio de um email ou URL (minúsculas, sem `www.`).
 * Determinístico e testável (não faz I/O).
 */
export function extractDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const candidate = trimmed.includes("@")
    ? trimmed.slice(trimmed.lastIndexOf("@") + 1)
    : trimmed.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const domain = candidate.replace(/:(.*)$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return domain.includes(".") ? domain : null;
}

/**
 * Classifica o tipo de email empresarial a partir do endereço.
 * Heurística conservadora: endereços genéricos comuns → "geral".
 */
export function classifyEmailType(email: string | null | undefined): EmailType | null {
  if (!email || !email.includes("@")) return null;
  const local = email.slice(0, email.lastIndexOf("@")).toLowerCase();
  if (["comercial", "vendas", "sales"].includes(local)) return "comercial";
  if (["suporte", "support", "ajuda", "help"].includes(local)) return "suporte";
  if (["geral", "info", "contacto", "contato", "office"].includes(local)) return "geral";
  return "outro";
}

/**
 * Um prospecto está impedido de entrar em campanhas quando tem opt-out ou
 * quando o estado comercial é OPTED_OUT. Salvaguarda para as fases seguintes.
 */
export function isBlockedFromCampaigns(
  prospect: Pick<ProspectCompany, "opt_out" | "commercial_status">,
): boolean {
  return prospect.opt_out === true || prospect.commercial_status === "OPTED_OUT";
}

function toRpcArgs(input: CreateProspectCompanyInput) {
  return {
    p_name: input.name,
    p_nif: input.nif ?? null,
    p_cae: input.cae ?? null,
    p_activity_description: input.activityDescription ?? null,
    p_district: input.district ?? null,
    p_municipality: input.municipality ?? null,
    p_localidade: input.localidade ?? null,
    p_estimated_size: input.estimatedSize ?? null,
    p_website: input.website ?? null,
    p_domain: input.domain ?? null,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
    p_email_type: input.emailType ?? null,
    p_contact_source_url: input.contactSourceUrl ?? null,
    p_company_source: input.companySource ?? null,
    p_contact_source: input.contactSource ?? null,
    p_company_id: input.companyId ?? null,
  };
}

/** Cria um prospecto. Idempotente perante NIF (devolve o existente). */
export async function createProspectCompany(
  input: CreateProspectCompanyInput,
): Promise<ProspectCompany> {
  const { data, error } = await supabase.rpc("prospect_company_create", toRpcArgs(input));
  if (error) throw error;
  return data as ProspectCompany;
}

/** Atualiza um prospecto. */
export async function updateProspectCompany(
  id: string,
  input: UpdateProspectCompanyInput,
): Promise<ProspectCompany> {
  const { data, error } = await supabase.rpc("prospect_company_update", {
    p_id: id,
    p_name: input.name ?? null,
    p_nif: input.nif ?? null,
    p_cae: input.cae ?? null,
    p_activity_description: input.activityDescription ?? null,
    p_district: input.district ?? null,
    p_municipality: input.municipality ?? null,
    p_localidade: input.localidade ?? null,
    p_estimated_size: input.estimatedSize ?? null,
    p_website: input.website ?? null,
    p_domain: input.domain ?? null,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
    p_email_type: input.emailType ?? null,
    p_contact_source_url: input.contactSourceUrl ?? null,
    p_company_source: input.companySource ?? null,
    p_contact_source: input.contactSource ?? null,
    p_enrichment_status: input.enrichmentStatus ?? null,
    p_commercial_status: input.commercialStatus ?? null,
    p_commercial_score: input.commercialScore ?? null,
    p_score_reason: input.scoreReason ?? null,
    p_matching_opportunities: input.matchingOpportunities ?? null,
    p_estimated_opportunity_value: input.estimatedOpportunityValue ?? null,
  });
  if (error) throw error;
  return data as ProspectCompany;
}

/** Obtém um prospecto por ID. */
export async function getProspectCompany(id: string): Promise<ProspectCompany | null> {
  const { data, error } = await supabase.rpc("prospect_company_get", { p_id: id });
  if (error) throw error;
  return (data as ProspectCompany | null) ?? null;
}

/** Obtém um prospecto por NIF (identificador lógico). */
export async function getProspectCompanyByNif(nif: string): Promise<ProspectCompany | null> {
  const { data, error } = await supabase.rpc("prospect_company_get_by_nif", { p_nif: nif });
  if (error) throw error;
  return (data as ProspectCompany | null) ?? null;
}

/** Lista/filtra prospectos (estado, score e pesquisa), paginado. */
export async function listProspectCompanies(
  filters: ListProspectCompaniesFilters = {},
): Promise<ProspectCompanyListItem[]> {
  const { data, error } = await supabase.rpc("prospect_company_list", {
    p_query: filters.query ?? null,
    p_commercial_status: filters.commercialStatus ?? null,
    p_enrichment_status: filters.enrichmentStatus ?? null,
    p_min_score: filters.minScore ?? null,
    p_max_score: filters.maxScore ?? null,
    p_include_opted_out: filters.includeOptedOut ?? true,
    p_page: filters.page ?? 1,
    p_page_size: filters.pageSize ?? 25,
  });
  if (error) throw error;
  return (data ?? []) as ProspectCompanyListItem[];
}

/** Marca opt-out. Impede reentrada em campanhas. Idempotente. */
export async function optOutProspectCompany(
  id: string,
  reason?: string,
): Promise<ProspectCompany> {
  const { data, error } = await supabase.rpc("prospect_company_opt_out", {
    p_id: id,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as ProspectCompany;
}

export const enrichmentStatusLabel: Record<EnrichmentStatus, string> = {
  NEW: "Novo",
  PENDING_ENRICHMENT: "A enriquecer",
  WEBSITE_FOUND: "Website encontrado",
  CONTACT_FOUND: "Contacto encontrado",
  VALIDATED: "Validado",
  ELIGIBLE: "Elegível",
  REJECTED: "Rejeitado",
  READY_FOR_AUTOPILOT: "Pronto para Autopilot",
};

export const commercialStatusLabel: Record<CommercialStatus, string> = {
  NEW: "Novo",
  ELIGIBLE: "Elegível",
  REJECTED: "Rejeitado",
  READY_FOR_AUTOPILOT: "Pronto para Autopilot",
  IN_AUTOPILOT: "No Autopilot",
  CONTACTED: "Contactado",
  CONVERTED: "Convertido",
  OPTED_OUT: "Opt-out",
};

export const emailTypeLabel: Record<EmailType, string> = {
  geral: "Geral",
  comercial: "Comercial",
  suporte: "Suporte",
  outro: "Outro",
};
