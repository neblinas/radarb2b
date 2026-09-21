import { supabase } from "@/lib/supabase";

/**
 * Prospeção B2B — Prospect Discovery Engine (FASE 3). Camada de I/O.
 *
 * O motor vive no backend (RPC `run_prospect_discovery`), que gera candidatos a
 * partir de dados reais de contratação pública já existentes no sistema,
 * deduplica contra os prospects existentes e exclui opt-out.
 *
 * Esta fase NÃO faz crawling, NÃO procura websites/emails/telefones na Internet,
 * NÃO envia para o Autopilot e NÃO cria automação periódica. A execução é
 * manual (back-office) ou através da função interna segura no backend.
 *
 * Correspondência CAE ↔ CPV:
 *   Não existe ainda um mecanismo fiável de correspondência; a arquitetura
 *   (`cae_cpv_map`) está preparada mas NÃO se inventam relações. O motor usa CAE
 *   apenas quando existe um mapeamento revisto por humano.
 */

/** Critérios de uma execução de descoberta. */
export type DiscoveryCriteria = {
  /** Score mínimo preliminar (0-100). */
  minScore?: number;
  /** Ramo de negócio derivado do CPV (ex.: "SOFTWARE"). */
  radarCategory?: string | null;
  /** Distrito da entidade adjudicante (localização relevante). */
  district?: string | null;
  /** Número mínimo de oportunidades (participações) conhecidas. */
  minOpportunities?: number;
  /** Valor adjudicado mínimo agregado (EUR). */
  minValue?: number | null;
  /** Limite de amostra (empresas analisadas). Nulo = sem limite artificial. */
  sampleLimit?: number | null;
};

/** Candidato devolvido pelo motor. */
export type DiscoveryCandidate = {
  company_id: string;
  name: string;
  nif: string | null;
  total_score: number;
  participation_count: number;
  participation_12m: number;
  award_count: number;
  total_award_value: number;
  last_participation: string | null;
  cpv_codes: string[];
  categories: string[];
  district: string | null;
  cae_compatible: string | null;
  competitor_count: number;
  reasons: string[];
  inferred_size: "micro" | "pequeno" | "medio" | "grande";
  is_duplicate: boolean;
  is_opt_out: boolean;
};

/** Distribuição de scores por portão. */
export type ScoreDistribution = {
  lt40: number;
  "40_59": number;
  "60_79": number;
  gte80: number;
};

/** Resultado de uma execução de descoberta. */
export type DiscoveryResult = {
  run_id: string;
  companies_analyzed: number;
  candidates_generated: number;
  new_prospects: number;
  skipped_duplicates: number;
  skipped_opt_out: number;
  skipped_low_signal: number;
  score_distribution: ScoreDistribution;
  candidates: DiscoveryCandidate[];
};

/** Registo de uma execução (para o histórico do relatório). */
export type DiscoveryRun = {
  id: string;
  criteria: Record<string, unknown>;
  sample_limit: number | null;
  companies_analyzed: number;
  candidates_generated: number;
  new_prospects: number;
  skipped_duplicates: number;
  skipped_opt_out: number;
  skipped_low_signal: number;
  score_distribution: ScoreDistribution;
  created_by: string | null;
  created_at: string;
};

/**
 * Um candidato é "acionável" (prospect novo) quando não é duplicado de um
 * prospect existente, não tem opt-out e tem pelo menos um motivo real.
 * Lógica pura, espelha a classificação do backend.
 */
export function isActionableCandidate(candidate: DiscoveryCandidate): boolean {
  return !candidate.is_duplicate && !candidate.is_opt_out && candidate.reasons.length > 0;
}

/** Classificação legível de um candidato (para a lista). */
export type CandidateBucket = "new" | "duplicate" | "opt_out" | "low_signal";

export function bucketCandidate(candidate: DiscoveryCandidate): CandidateBucket {
  if (candidate.is_duplicate) return "duplicate";
  if (candidate.is_opt_out) return "opt_out";
  if (candidate.reasons.length === 0) return "low_signal";
  return "new";
}

export const candidateBucketLabel: Record<CandidateBucket, string> = {
  new: "Novo prospect",
  duplicate: "Ignorado (já existe)",
  opt_out: "Ignorado (opt-out)",
  low_signal: "Sem sinal suficiente",
};

/**
 * Executa o motor de descoberta (manual/interno).
 * Requer admin/commercial_manager no backend.
 */
export async function runProspectDiscovery(
  criteria: DiscoveryCriteria = {},
): Promise<DiscoveryResult> {
  const { data, error } = await supabase.rpc("run_prospect_discovery", {
    p_min_score: criteria.minScore ?? 40,
    p_radar_category: criteria.radarCategory ?? null,
    p_district: criteria.district ?? null,
    p_min_opportunities: criteria.minOpportunities ?? 1,
    p_min_value: criteria.minValue ?? null,
    p_sample_limit: criteria.sampleLimit ?? null,
  });
  if (error) throw error;
  return data as DiscoveryResult;
}

/** Lista as últimas execuções de descoberta da organização. */
export async function listProspectDiscoveryRuns(limit = 10): Promise<DiscoveryRun[]> {
  const { data, error } = await supabase.rpc("prospect_discovery_runs_list", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as DiscoveryRun[];
}

/** Adiciona um mapeamento CAE↔CPV revisto por humano (fonte obrigatória). */
export async function addCaeCpvMapping(input: {
  caeCode: string;
  cpvCode: string;
  source: string;
  radarCategory?: string | null;
  confidence?: number;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("cae_cpv_map_add", {
    p_cae_code: input.caeCode,
    p_cpv_code: input.cpvCode,
    p_source: input.source,
    p_radar_category: input.radarCategory ?? null,
    p_confidence: input.confidence ?? 100,
    p_note: input.note ?? null,
  });
  if (error) throw error;
}

export const inferredSizeLabel: Record<DiscoveryCandidate["inferred_size"], string> = {
  micro: "Micro",
  pequeno: "Pequena",
  medio: "Média",
  grande: "Grande",
};

/** Total de candidatos numa distribuição de scores. */
export function distributionTotal(distribution: ScoreDistribution): number {
  return distribution.lt40 + distribution["40_59"] + distribution["60_79"] + distribution.gte80;
}
