/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Ponto de entrada do módulo.
 *
 * Arquitetura desacoplada (AGENTS.md): o motor não conhece fontes concretas —
 * apenas a interface `CompanyDiscoveryProvider`. Adicionar uma fonte nova é
 * registá-la no `CompanyDiscoveryRegistry`, sem tocar no pipeline.
 *
 * Pipeline externo completo:
 *   External Source → Discovery → Normalization → Deduplication →
 *   Prospect Creation → Enrichment → Scoring → Eligibility → Autopilot.
 *
 * Esta fase implementa Discovery, Normalization e Deduplication (pré-visualização)
 * e a criação de prospects via `prospect_company_create`. O enriquecimento,
 * scoring e elegibilidade continuam a ser as fases internas já existentes
 * (FASE 4–6), acionadas sobre os prospects criados.
 */

export * from "./types";
export * from "./normalize";
export * from "./fileParsing";
export * from "./engine";
export * from "./io";
export * from "./providers";
