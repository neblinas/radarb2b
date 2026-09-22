/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Camada de I/O (Supabase).
 *
 * A inserção de prospects e o registo de execuções acontecem no backend (RPCs
 * `external_discovery_*`). Aqui vive apenas a ligação a essa autoridade:
 *   * `loadKnownSnapshot` — carrega NIFs/chaves existentes e bloqueados (a
 *     autoridade da deduplicação é sempre o backend; este snapshot serve para a
 *     pré-visualização/dry-run e para não repetir trabalho);
 *   * `persistDiscovery` — insere os novos registos (real) ou apenas regista a
 *     execução (dry-run), de forma idempotente e auditada;
 *   * `listExternalDiscoveryRuns` — histórico de execuções.
 *
 * Compliance: a inserção passa SEMPRE por `prospect_company_create` (validação
 * de role, deduplicação por NIF/empresa, opt-out). O motor nunca escreve
 * diretamente nas tabelas.
 */

import { supabase } from "@/lib/supabase";
import type { KnownCompanySnapshot } from "./normalize";
import { emptyKnownCompanySnapshot, inferEmailType, normalizeNif } from "./normalize";
import type { ExternalDiscoveryRun, ExternalRecordEvaluation } from "./types";

/** Carrega o snapshot de empresas conhecidas (existentes vs. bloqueadas). */
export async function loadKnownSnapshot(): Promise<KnownCompanySnapshot> {
  const { data, error } = await supabase.rpc("external_discovery_known_companies");
  if (error) throw error;
  const payload = (data ?? {}) as {
    known_nifs?: string[];
    known_dedup_keys?: string[];
    blocked_nifs?: string[];
    blocked_dedup_keys?: string[];
  };
  return {
    knownNifs: new Set((payload.known_nifs ?? []).map((nif) => normalizeNif(nif) ?? "").filter(Boolean)),
    knownDedupKeys: new Set((payload.known_dedup_keys ?? []).map((key) => `name:${key}`)),
    blockedNifs: new Set((payload.blocked_nifs ?? []).map((nif) => normalizeNif(nif) ?? "").filter(Boolean)),
    blockedDedupKeys: new Set((payload.blocked_dedup_keys ?? []).map((key) => `name:${key}`)),
  };
}

/** Resultado da persistência de uma execução. */
export type PersistDiscoveryResult = {
  run_id: string;
  created: number;
  skipped: number;
};

/**
 * Persiste uma execução de descoberta externa.
 *   * dry-run → apenas registra a execução (nenhum prospect é criado);
 *   * real → insere os candidatos novos via `external_discovery_persist`, que
 *     por sua vez reutiliza `prospect_company_create` (idempotente, com opt-out
 *     e deduplicação autoritativas).
 */
export async function persistDiscovery(input: {
  provider: string;
  dryRun: boolean;
  filters: Record<string, unknown>;
  counters: {
    found: number;
    existing: number;
    blocked: number;
    invalid: number;
    created: number;
    errors: number;
    sourceDuplicates: number;
  };
  errors: string[];
  newRecords: ExternalRecordEvaluation[];
}): Promise<PersistDiscoveryResult> {
  const { data, error } = await supabase.rpc("external_discovery_persist", {
    p_provider: input.provider,
    p_dry_run: input.dryRun,
    p_filters: input.filters,
    p_found: input.counters.found,
    p_existing: input.counters.existing,
    p_blocked: input.counters.blocked,
    p_invalid: input.counters.invalid,
    p_errors: input.counters.errors,
    p_source_duplicates: input.counters.sourceDuplicates,
    p_errors_detail: input.errors,
    p_records: input.newRecords.map((evaluation) => ({
      name: evaluation.record.name,
      nif: evaluation.record.nif ?? null,
      cae: evaluation.record.cae ?? null,
      district: evaluation.record.district ?? null,
      municipality: evaluation.record.municipality ?? null,
      localidade: evaluation.record.localidade ?? null,
      estimated_size: evaluation.record.size ?? null,
      website: evaluation.record.website ?? null,
      // Email fornecido EXPLICITAMENTE pela fonte. Nunca inferido.
      email: evaluation.record.email ?? null,
      // Tipo derivado do prefixo (geral/comercial/suporte/outro) para o scoring
      // reconhecer contacto empresarial genérico. Sem email, não se atribui tipo.
      email_type: evaluation.record.email ? inferEmailType(evaluation.record.email) : null,
      company_source: evaluation.record.source,
      // Proveniência honesta: a origem do contacto é o próprio provider que o
      // forneceu (ficheiro, lista manual ou dados abertos) — nunca inventada.
      contact_source: evaluation.record.source,
      source_id: evaluation.record.sourceId ?? null,
      activity_description: null,
    })),
  });
  if (error) throw error;
  const payload = (data ?? {}) as { run_id?: string; created?: number; skipped?: number };
  return {
    run_id: payload.run_id ?? "",
    created: payload.created ?? 0,
    skipped: payload.skipped ?? 0,
  };
}

/** Lista as últimas execuções de descoberta externa da organização. */
export async function listExternalDiscoveryRuns(limit = 10): Promise<ExternalDiscoveryRun[]> {
  const { data, error } = await supabase.rpc("external_discovery_runs_list", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as ExternalDiscoveryRun[];
}

/** Devolve o snapshot vazio (útil em testes/dry-run sem sessão). */
export function emptySnapshot(): KnownCompanySnapshot {
  return emptyKnownCompanySnapshot();
}

