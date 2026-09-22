/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Registo de providers de descoberta externa.
 *
 * O motor NUNCA depende de uma fonte específica: procura no registo pela `id`.
 * Adicionar um provider novo = registar aqui, sem alterar o pipeline.
 */

import type { CompanyDiscoveryProvider, SourceMetadata } from "../types";
import { FileCompanyDiscoveryProvider } from "./fileProvider";
import { ManualCompanyDiscoveryProvider } from "./manualProvider";
import { OpenDataCompanyDiscoveryProvider, type OpenDataSourceConfig } from "./openDataProvider";

export { FileCompanyDiscoveryProvider } from "./fileProvider";
export { ManualCompanyDiscoveryProvider } from "./manualProvider";
export { OpenDataCompanyDiscoveryProvider } from "./openDataProvider";
export type { OpenDataSourceConfig } from "./openDataProvider";

/**
 * Fábrica de providers de dados abertos a partir de configuração explícita.
 * Sem configuração, a lista fica vazia — não inventamos fontes nem endpoints.
 */
export function createOpenDataProviders(configs: OpenDataSourceConfig[]): OpenDataCompanyDiscoveryProvider[] {
  return configs.map((config) => new OpenDataCompanyDiscoveryProvider(config));
}

/**
 * Registo por omissão. `file`, `manual` e o provider de dados abertos (inativo
 * enquanto não houver endpoint configurado) estão sempre presentes.
 */
export class CompanyDiscoveryRegistry {
  private readonly providers = new Map<string, CompanyDiscoveryProvider>();

  constructor(providers: CompanyDiscoveryProvider[] = []) {
    for (const provider of providers) this.register(provider);
  }

  register(provider: CompanyDiscoveryProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): CompanyDiscoveryProvider | null {
    return this.providers.get(id) ?? null;
  }

  list(): CompanyDiscoveryProvider[] {
    return [...this.providers.values()];
  }

  /** Metadados de todas as fontes registadas (para o back-office). */
  metadata(): SourceMetadata[] {
    return this.list().map((provider) => provider.getSourceMetadata());
  }
}

/** Registo por omissão com os providers disponíveis nesta fase. */
export function defaultDiscoveryRegistry(openDataConfigs: OpenDataSourceConfig[] = []): CompanyDiscoveryRegistry {
  return new CompanyDiscoveryRegistry([
    new FileCompanyDiscoveryProvider(),
    new ManualCompanyDiscoveryProvider(),
    ...createOpenDataProviders(openDataConfigs),
  ]);
}
