import { supabase } from "@/lib/supabase";

/**
 * Análise de concorrência do portal do cliente (camada de I/O).
 *
 * Toda a agregação vive no backend (RPC `company_competitors` /
 * `company_competition_summary` / `procedure_competitors`), que também aplica
 * o gating de plano. O frontend nunca calcula nem inventa concorrentes.
 */

export type Competitor = {
  company_id: string;
  name: string | null;
  nif: string | null;
  shared_procedures: number;
  shared_last_date: string | null;
  competitor_awards: number;
  competitor_award_value: number;
  competitor_participations: number;
  competitor_participations_12m: number;
  top_cpvs: string[];
  top_buyers: string[];
};

export type CompetitionSummary = {
  company_id: string;
  participations: number;
  has_company: boolean;
  competitor_count: number;
  competitor_count_12m: number;
  most_frequent_competitor: {
    company_id: string;
    name: string | null;
    shared: number;
  } | null;
};

export type ProcedureCompetitor = {
  company_id: string;
  name: string | null;
  nif: string | null;
  role: string;
  won: boolean;
};

export type CompanySearchResult = {
  id: string;
  name: string | null;
  nif: string | null;
};

/** Pesquisa empresas por nome ou NIF (dados BASE públicos). */
export async function searchCompanies(term: string, limit = 8): Promise<CompanySearchResult[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const pattern = `%${trimmed}%`;
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, nif")
    .or(`name.ilike.${pattern},nif.ilike.${pattern}`)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as CompanySearchResult[];
}

export async function fetchCompany(companyId: string): Promise<CompanySearchResult | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, nif")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as CompanySearchResult | null;
}

export async function fetchCompanyCompetitionSummary(companyId: string): Promise<CompetitionSummary | null> {
  const { data, error } = await supabase.rpc("company_competition_summary", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return (data ?? null) as CompetitionSummary | null;
}

export async function fetchCompanyCompetitors(companyId: string, limit = 25): Promise<Competitor[]> {
  const { data, error } = await supabase.rpc("company_competitors", {
    p_company_id: companyId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as Competitor[];
}

export async function fetchProcedureCompetitors(procedureId: string): Promise<ProcedureCompetitor[]> {
  const { data, error } = await supabase.rpc("procedure_competitors", {
    p_procedure_id: procedureId,
  });
  if (error) throw error;
  return (data ?? []) as ProcedureCompetitor[];
}

/** Plano atual do utilizador (gerido no backend). */
export async function fetchCurrentPlan(): Promise<string> {
  const { data, error } = await supabase.rpc("client_current_plan");
  if (error) throw error;
  return (data as string) ?? "free";
}

export const planLabel: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
};

export function formatEuro(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-PT");
}
