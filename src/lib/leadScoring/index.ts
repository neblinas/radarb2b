/**
 * Adjudata — Prospeção B2B: Lead Scoring Engine (FASE 5). Ponto de entrada.
 *
 * Reexporta a configuração central, o motor determinístico (puro) e a camada
 * de I/O (Supabase). Nenhum valor de scoring deve ser hardcoded fora de
 * `config.ts`.
 */

export * from "./config";
export * from "./engine";
export * from "./io";
