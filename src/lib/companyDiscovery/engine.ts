/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Motor determinístico (lógica pura, testável).
 *
 * Orquestra um provider de descoberta externa e produz avaliações + contadores,
 * SEM tocar no Supabase. A execução (dry-run vs. real) e a persistência são
 * decididas pela camada de I/O (`io.ts`) e pelo backend.
 *
 * Fluxo:
 *   External Source → Discovery → Normalization → Deduplication → (Prospect
 *   Creation, fora daqui) → Enrichment → Scoring → Eligibility → Autopilot.
 */

import {
  evaluateDiscoveryBatch,
  filtersToObject,
  sortEvaluations,
  type ExternalCompanyInput,
  type KnownCompanySnapshot,
} from "./normalize";
import type {
  CompanyDiscoveryProvider,
  DiscoveryCheckpoint,
  DiscoveryFilters,
  ExternalDiscoveryCounters,
  ExternalDiscoveryResult,
  ExternalRecordEvaluation,
  ProviderSearchResult,
} from "./types";
import { EXTERNAL_DISCOVERY_LIMITS } from "./types";

/** Entrada do motor. */
export type DiscoveryEngineInput = {
  provider: CompanyDiscoveryProvider;
  filters: DiscoveryFilters;
  /** Estado interno conhecido (NIFs/chaves existentes e bloqueados). */
  known: KnownCompanySnapshot;
  /** Checkpoint anterior (sincronização incremental), quando aplicável. */
  checkpoint?: DiscoveryCheckpoint | null;
  /** Execução em modo dry-run (não insere nada). */
  dryRun: boolean;
  /** ID da execução (atribuído pelo backend). */
  runId?: string | null;
};

/** Saída do motor (antes de persistir). */
export type DiscoveryEngineOutput = {
  provider: string;
  dryRun: boolean;
  counters: ExternalDiscoveryCounters;
  evaluations: ExternalRecordEvaluation[];
  /** Candidatos acionáveis (bucket = new) — os que seriam criados. */
  newRecords: ExternalRecordEvaluation[];
  errors: string[];
  hasMore: boolean;
  nextCursor: string | null;
  searchResult: ProviderSearchResult;
  filters: Record<string, unknown>;
};

/**
 * Executa o motor. Nunca lança para falhas da fonte: devolve contadores com
 * `errors` contabilizados. A inserção NÃO acontece aqui.
 */
export async function runDiscoveryEngine(input: DiscoveryEngineInput): Promise<DiscoveryEngineOutput> {
  const { provider, filters, known, dryRun } = input;

  const startedAt = new Date().toISOString();
  const searchResult = await provider.searchCompanies(filters, input.checkpoint ?? null);

  const { evaluations, counters } = evaluateDiscoveryBatch(
    searchResult.records as ExternalCompanyInput[],
    provider.id,
    startedAt,
    known,
  );

  const errors = [...(searchResult.errors ?? [])];
  counters.errors = errors.length;

  const sorted = sortEvaluations(evaluations);
  const newRecords = sorted.filter((evaluation) => evaluation.bucket === "new");

  return {
    provider: provider.id,
    dryRun,
    counters,
    evaluations: sorted.slice(0, EXTERNAL_DISCOVERY_LIMITS.maxEvaluationsReturned),
    newRecords,
    errors,
    hasMore: searchResult.hasMore,
    nextCursor: searchResult.nextCursor ?? null,
    searchResult,
    filters: filtersToObject(filters),
  };
}

/** Constrói o payload de contactos a inserir a partir de uma avaliação. */
export function toPersistPayload(evaluation: ExternalRecordEvaluation): Record<string, unknown> {
  const record = evaluation.record;
  return {
    name: record.name,
    nif: record.nif ?? null,
    cae: record.cae ?? null,
    activity_description: null,
    district: record.district ?? null,
    municipality: record.municipality ?? null,
    localidade: record.localidade ?? null,
    estimated_size: record.size ?? null,
    website: record.website ?? null,
    domain: record.website ? record.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null,
    company_source: record.source,
    source_id: record.sourceId ?? null,
    collected_at: record.collectedAt,
    dedup_key: evaluation.dedupKey,
  };
}

/** Constrói o resultado final apresentável (dry-run ou real). */
export function buildDiscoveryResult(output: DiscoveryEngineOutput, source: DiscoveryEngineOutput["provider"]): ExternalDiscoveryResult {
  const startedAt = new Date().toISOString();
  return {
    run_id: "",
    provider: output.provider,
    dry_run: output.dryRun,
    counters: output.counters,
    evaluations: output.evaluations,
    source: {
      id: output.provider,
      name: source,
      kind: "open_data",
      license: "",
      supportsIncrementalSync: false,
    },
    started_at: startedAt,
    finished_at: startedAt,
    errors: output.errors,
  };
}

export type { KnownCompanySnapshot };

