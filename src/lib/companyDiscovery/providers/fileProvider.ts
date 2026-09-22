/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Provider de ficheiro estruturado (`FileCompanyDiscoveryProvider`).
 *
 * Permite que o administrador importe uma lista externa de empresas fornecida
 * por si (CSV/JSON), proveniente de qualquer fonte legalmente reutilizável.
 * O conteúdo do ficheiro é mapeado por colunas (nome, NIF, CAE, distrito,
 * concelho, website…), filtrado, normalizado e deduplicado pelo motor.
 *
 * NÃO faz pedidos de rede. NÃO executa URLs. É totalmente local.
 */

import type {
  CompanyDiscoveryProvider,
  DiscoveryCheckpoint,
  DiscoveryFilters,
  ExternalCompanyRecord,
  ProviderSearchResult,
  SourceMetadata,
} from "../types";
import { applyFilters, defaultFilters } from "../normalize";
import { parseStructuredFile } from "../fileParsing";

/** Fonte de dados injetada (função que devolve o conteúdo textual do ficheiro). */
export type FileContentSource = () => Promise<string> | string;

/**
 * Provider de ficheiro. O conteúdo pode ser fornecido no construtor ou em
 * runtime (o back-office lê o ficheiro e injeta o texto).
 */
export class FileCompanyDiscoveryProvider implements CompanyDiscoveryProvider {
  readonly id = "file_import";
  private content: string;
  private fileName: string;
  private readonly source: FileContentSource | null;

  constructor(content = "", fileName = "import.csv", source: FileContentSource | null = null) {
    this.content = content;
    this.fileName = fileName;
    this.source = source;
  }

  /** Atualiza o conteúdo do ficheiro (usado pelo back-office antes de executar). */
  setContent(content: string, fileName: string): void {
    this.content = content;
    this.fileName = fileName;
  }

  getSourceMetadata(): SourceMetadata {
    return {
      id: this.id,
      name: "Importação de ficheiro (CSV/JSON)",
      kind: "file",
      license: "Fornecida pelo administrador — responsabilidade de reutilização do admin",
      licenseUrl: null,
      homepage: null,
      supportsIncrementalSync: false,
      notes:
        "O administrador é responsável por garantir que a lista importada é legalmente reutilizável. Não se executam URLs nem conteúdo do ficheiro.",
    };
  }

  supportsIncrementalSync(): boolean {
    return false;
  }

  async getCompanyDetails(identifier: string): Promise<ExternalCompanyRecord | null> {
    const result = await this.searchCompanies(defaultFilters());
    return result.records.find((record) => (record.sourceId ?? record.name) === identifier) ?? null;
  }

  async searchCompanies(filters: DiscoveryFilters): Promise<ProviderSearchResult> {
    const content = this.source ? await this.source() : this.content;
    if (!content || !content.trim()) {
      return { records: [], hasMore: false, errors: ["Ficheiro vazio."] };
    }

    const parsed = parseStructuredFile(this.fileName, content);
    const collectedAt = new Date().toISOString();
    const normalized = parsed.records
      .map((record) => ({ ...record, source: this.id, collectedAt }))
      .filter((record) => Boolean(record.name));
    const filtered = applyFilters(normalized as ExternalCompanyRecord[], filters);
    const limited = filtered.slice(0, filters.limit);

    return {
      records: limited,
      hasMore: filtered.length > limited.length,
      errors: parsed.errors,
    };
  }

  /** Não suporta checkpoint (o ficheiro é fornecido pelo administrador). */
  static readonly runsIncremental = false;
}

export type { DiscoveryCheckpoint };

