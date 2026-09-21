/**
 * Adjudata — Prospeção B2B: Lead Scoring Engine (FASE 5). Camada de I/O.
 *
 * Fala com os RPCs `lead_*` do Supabase. A computação autoritativa acontece no
 * backend (`lead_scoring_run`), que percorre os prospects reais, calcula os
 * componentes, guarda o snapshot auditável (`lead_scores`) e devolve a
 * distribuição + exemplos. Este módulo NÃO envia nada para o Autopilot e NÃO
 * cria campanhas.
 */

import { supabase } from "@/lib/supabase";
import type { LeadScoreComponent, ScoreBandKey } from "./config";

/** Filtros de execução/listagem do scoring. */
export type LeadScoringRunFilters = {
  minScore?: number | null;
  maxScore?: number | null;
  band?: ScoreBandKey | null;
  commercialStatus?: string | null;
  cae?: string | null;
  cpv?: string | null;
  district?: string | null;
  contactAvailable?: boolean;
  genericEmail?: boolean;
  minOpportunities?: number | null;
  minValue?: number | null;
  includeOptedOut?: boolean;
  sampleLimit?: number | null;
};

/** Distribuição de scores por portão. */
export type LeadScoreDistribution = {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  VERY_HIGH: number;
};

/** Linha de scoring devolvida pelo motor (snapshot por prospect). */
export type LeadScoreRow = {
  score_id: string;
  prospect_id: string | null;
  company_id: string | null;
  name: string;
  nif: string | null;
  cae: string | null;
  district: string | null;
  estimated_size: string | null;
  website: string | null;
  email: string | null;
  email_type: string | null;
  phone: string | null;
  commercial_status: string;
  opt_out: boolean;
  score: number;
  band: ScoreBandKey;
  components: Record<LeadScoreComponent, number>;
  contributions: Record<LeadScoreComponent, number>;
  reasons: string[];
  eligible: boolean;
  blocked_reason: string | null;
  matching_opportunities: number;
  estimated_opportunity_value: number | null;
  config_version: string;
  computed_at: string;
};

/** Resultado de uma execução de scoring. */
export type LeadScoringRunResult = {
  run_id: string;
  scored: number;
  eligible: number;
  blocked_opt_out: number;
  distribution: LeadScoreDistribution;
  filters: Record<string, unknown>;
  rows: LeadScoreRow[];
};

/** Registo de uma execução (histórico). */
export type LeadScoringRunSummary = {
  id: string;
  filters: Record<string, unknown>;
  config_version: string;
  scored: number;
  eligible: number;
  blocked_opt_out: number;
  distribution: LeadScoreDistribution;
  created_by: string | null;
  created_at: string;
};

/**
 * Executa o motor de scoring sobre os prospects reais, com os filtros
 * indicados. Requer admin/commercial_manager no backend. Não envia nada para o
 * Autopilot nem cria campanhas.
 */
export async function runLeadScoring(filters: LeadScoringRunFilters = {}): Promise<LeadScoringRunResult> {
  const { data, error } = await supabase.rpc("lead_scoring_run", {
    p_min_score: filters.minScore ?? null,
    p_max_score: filters.maxScore ?? null,
    p_band: filters.band ?? null,
    p_commercial_status: filters.commercialStatus ?? null,
    p_cae: filters.cae ?? null,
    p_cpv: filters.cpv ?? null,
    p_district: filters.district ?? null,
    p_contact_available: filters.contactAvailable ?? null,
    p_generic_email: filters.genericEmail ?? null,
    p_min_opportunities: filters.minOpportunities ?? null,
    p_min_value: filters.minValue ?? null,
    p_include_opted_out: filters.includeOptedOut ?? false,
    p_sample_limit: filters.sampleLimit ?? null,
  });
  if (error) throw error;
  return data as LeadScoringRunResult;
}

/** Lista o histórico de execuções de scoring. */
export async function listLeadScoringRuns(limit = 10): Promise<LeadScoringRunSummary[]> {
  const { data, error } = await supabase.rpc("lead_scoring_runs_list", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as LeadScoringRunSummary[];
}

/** Devolve os snapshots de score mais recentes (lista filtrada). */
export async function listLeadScores(filters: LeadScoringRunFilters = {}): Promise<LeadScoreRow[]> {
  const { data, error } = await supabase.rpc("lead_scores_list", {
    p_min_score: filters.minScore ?? null,
    p_band: filters.band ?? null,
    p_district: filters.district ?? null,
    p_generic_email: filters.genericEmail ?? null,
    p_contact_available: filters.contactAvailable ?? null,
    p_include_opted_out: filters.includeOptedOut ?? false,
    p_limit: filters.sampleLimit ?? 100,
  });
  if (error) throw error;
  return (data ?? []) as LeadScoreRow[];
}

/** Devolve a configuração ativa do scoring (autoridade em runtime). */
export async function getLeadScoringConfig(): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc("lead_scoring_config_get");
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

export const leadBandLabel: Record<ScoreBandKey, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  VERY_HIGH: "Muito alta",
};

/** Total de leads numa distribuição. */
export function distributionTotal(distribution: LeadScoreDistribution): number {
  return distribution.LOW + distribution.MEDIUM + distribution.HIGH + distribution.VERY_HIGH;
}
