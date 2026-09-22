/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Provider manual (`ManualCompanyDiscoveryProvider`).
 *
 * Permite ao administrador introduzir/colar uma lista de empresas diretamente
 * na UI (ex.: resultado de uma consulta pontual a uma fonte legalmente
 * reutilizável). É o equivalente em memória do provider de ficheiro, sem I/O.
 *
 * NÃO contacta fontes externas nem executa URLs.
 */

import type {
  CompanyDiscoveryProvider,
  DiscoveryFilters,
  ExternalCompanyRecord,
  ProviderSearchResult,
  SourceMetadata,
} from "../types";
import { applyFilters, type ExternalCompanyInput } from "../normalize";

export class ManualCompanyDiscoveryProvider implements CompanyDiscoveryProvider {
  readonly id = "manual";
  private records: ExternalCompanyInput[];

  constructor(records: ExternalCompanyInput[] = []) {
    this.records = records;
  }

  /** Substitui a lista manual (usada pelo back-office antes de executar). */
  setRecords(records: ExternalCompanyInput[]): void {
    this.records = records;
  }

  getSourceMetadata(): SourceMetadata {
    return {
      id: this.id,
      name: "Lista manual do administrador",
      kind: "manual",
      license: "Fornecida pelo administrador — responsabilidade de reutilização do admin",
      licenseUrl: null,
      homepage: null,
      supportsIncrementalSync: false,
      notes: "Empresas introduzidas manualmente pelo administrador. Não contacta fontes externas.",
    };
  }

  supportsIncrementalSync(): boolean {
    return false;
  }

  async getCompanyDetails(identifier: string): Promise<ExternalCompanyRecord | null> {
    const result = await this.searchCompanies({ ...DEFAULT, limit: Number.MAX_SAFE_INTEGER });
    return result.records.find((record) => record.name === identifier) ?? null;
  }

  async searchCompanies(filters: DiscoveryFilters): Promise<ProviderSearchResult> {
    const collectedAt = new Date().toISOString();
    const normalized = this.records
      .map((record) => ({ ...record, source: this.id, collectedAt }))
      .filter((record) => Boolean(record.name));
    const filtered = applyFilters(normalized as ExternalCompanyRecord[], filters);
    const limited = filtered.slice(0, filters.limit);
    return { records: limited, hasMore: filtered.length > limited.length };
  }
}

const DEFAULT: DiscoveryFilters = {
  cae: null,
  sector: null,
  district: null,
  municipality: null,
  incorporationFrom: null,
  incorporationTo: null,
  activeOnly: false,
  size: null,
  minEmployees: null,
  limit: 50,
};
