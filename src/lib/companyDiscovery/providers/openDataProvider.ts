/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Provider de dados abertos (`OpenDataCompanyDiscoveryProvider`).
 *
 * Base para integrações futuras com fontes de dados abertos legalmente
 * reutilizáveis (ex.: datasets do dados.gov.pt publicados via API CKAN).
 *
 * IMPORTANTE — conformidade (AGENTS.md):
 *   * NÃO inventamos endpoints. O provider só faz pedidos quando existe uma
 *     configuração EXPLÍCITA (`endpoint`), que o administrador fornece e que
 *     deve corresponder a uma API pública oficialmente suportada.
 *   * Sem configuração, devolve lista vazia (não contacta nada).
 *   * Respeita o rate limit e o user-agent identificável; nunca contorna
 *     bloqueios, CAPTCHA, autenticação ou termos.
 *   * O pedido é feito a partir do backend autorizado — não é uma chamada
 *     cliente arbitrária, pelo que só aceita hosts HTTPS públicos válidos.
 *
 * O mapeamento de campos é feito por uma função de projeção fornecida na
 * configuração, deixando cada fonte concreta definir o seu formato sem alterar
 * o motor.
 */

import type {
  CompanyDiscoveryProvider,
  DiscoveryCheckpoint,
  DiscoveryFilters,
  ExternalCompanyRecord,
  ProviderSearchResult,
  SourceMetadata,
} from "../types";
import { assertSafeUrl } from "@/lib/enrichmentSecurity";

/** Configuração de uma fonte de dados abertos. */
export type OpenDataSourceConfig = {
  /** Identificador estável (ex.: "dadosgov_cnpj" ou um nome próprio). */
  id: string;
  /** Nome legível. */
  name: string;
  /** Licença de reutilização documentada (obrigatória). */
  license: string;
  /** URL da licença/termos (informativo). */
  licenseUrl?: string | null;
  /** Página oficial da fonte (informativo). */
  homepage?: string | null;
  /**
   * Endpoint HTTPS da API. Sem endpoint → provider inativo (devolve vazio).
   * NUNCA é inventado: só é definido por configuração explícita.
   */
  endpoint: string | null;
  /** A fonte suporta buscar apenas registos alterados desde uma data? */
  supportsIncremental?: boolean;
  /** Parâmetro de paginação (nome do query param), quando aplicável. */
  pageParam?: string | null;
  /** Nome do parâmetro de data de alteração, quando aplicável. */
  updatedSinceParam?: string | null;
  /** Notas de conformidade/limites. */
  notes?: string | null;
  /**
   * Projeção de um item da resposta da fonte para um registo externo parcial.
   * Obrigatória para que o provider seja funcional.
   */
  project?: (item: Record<string, unknown>) => Partial<ExternalCompanyRecord> & { name?: string | null };
};

/** User-agent identificável e responsável do serviço. */
export const DISCOVERY_USER_AGENT = "Adjudata-CompanyDiscovery/1.0 (+https://adjudata.pt)";

/** Timeout e limite de bytes por resposta (defensivos). */
export const OPEN_DATA_TIMEOUT_MS = 10_000;
export const OPEN_DATA_MAX_BYTES = 2_000_000;

/**
 * Provider de dados abertos genérico. Não contacta nada sem `endpoint`.
 */
export class OpenDataCompanyDiscoveryProvider implements CompanyDiscoveryProvider {
  readonly id: string;
  private readonly config: OpenDataSourceConfig;

  constructor(config: OpenDataSourceConfig) {
    this.id = config.id;
    this.config = config;
  }

  /** O provider está configurado e é funcional? */
  isConfigured(): boolean {
    return Boolean(this.config.endpoint && this.config.project);
  }

  getSourceMetadata(): SourceMetadata {
    return {
      id: this.config.id,
      name: this.config.name,
      kind: "open_data",
      license: this.config.license,
      licenseUrl: this.config.licenseUrl ?? null,
      homepage: this.config.homepage ?? null,
      supportsIncrementalSync: this.supportsIncrementalSync(),
      notes:
        this.config.notes ??
        (this.isConfigured()
          ? "Fonte de dados abertos configurada explicitamente pelo administrador."
          : "Sem endpoint configurado — provider inativo. Configure um endpoint de API pública legalmente reutilizável."),
    };
  }

  supportsIncrementalSync(): boolean {
    return Boolean(this.config.supportsIncremental && this.config.updatedSinceParam);
  }

  async getCompanyDetails(identifier: string): Promise<ExternalCompanyRecord | null> {
    // Nesta fase o detalhe é obtido via pesquisa; fontes com endpoint de detalhe
    // podem ser adicionadas sem alterar o motor.
    const result = await this.searchCompanies({ ...EMPTY_FILTERS, limit: 1 });
    return result.records.find((record) => record.sourceId === identifier) ?? null;
  }

  async searchCompanies(
    filters: DiscoveryFilters,
    checkpoint?: DiscoveryCheckpoint | null,
  ): Promise<ProviderSearchResult> {
    // Sem endpoint → não contacta nada (não inventamos fontes).
    if (!this.isConfigured() || !this.config.endpoint) {
      return { records: [], hasMore: false, errors: [] };
    }
    if (!this.config.project) {
      return { records: [], hasMore: false, errors: [] };
    }

    const safe = assertSafeUrl(this.config.endpoint);
    if (!safe.ok) {
      return { records: [], hasMore: false, errors: [`Endpoint recusado por segurança (${safe.reason}).`] };
    }

    const url = safe.url;
    if (filters.cae) url.searchParams.set("cae", filters.cae);
    if (filters.district) url.searchParams.set("district", filters.district);
    if (filters.municipality) url.searchParams.set("municipality", filters.municipality);
    if (filters.incorporationFrom) url.searchParams.set("from", filters.incorporationFrom);
    url.searchParams.set("limit", String(Math.min(filters.limit, 200)));
    if (this.config.pageParam && checkpoint?.cursor) {
      url.searchParams.set(this.config.pageParam, checkpoint.cursor);
    }
    if (this.config.updatedSinceParam && checkpoint?.updatedSince) {
      url.searchParams.set(this.config.updatedSinceParam, checkpoint.updatedSince);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPEN_DATA_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": DISCOVERY_USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        return { records: [], hasMore: false, errors: [`Fonte respondeu ${response.status}.`] };
      }
      const length = Number(response.headers.get("content-length") || 0);
      if (length > OPEN_DATA_MAX_BYTES) {
        return { records: [], hasMore: false, errors: ["Resposta demasiado grande."] };
      }
      const text = (await response.text()).slice(0, OPEN_DATA_MAX_BYTES);
      const parsed = JSON.parse(text) as unknown;
      const items = extractItems(parsed);
      const project = this.config.project;
      const records = items
        .map((item) => project(item))
        .filter((record): record is Partial<ExternalCompanyRecord> & { name: string } => Boolean(record?.name))
        .map((record) => ({ ...record, name: record.name as string }));
      return {
        records: records as ExternalCompanyRecord[],
        hasMore: items.length >= filters.limit,
        nextCursor: null,
      };
    } catch (error) {
      return {
        records: [],
        hasMore: false,
        errors: [error instanceof Error ? `Falha na fonte: ${error.message}` : "Falha na fonte."],
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

const EMPTY_FILTERS: DiscoveryFilters = {
  cae: null,
  sector: null,
  district: null,
  municipality: null,
  incorporationFrom: null,
  incorporationTo: null,
  activeOnly: false,
  size: null,
  minEmployees: null,
  limit: 1,
};

/** Extrai uma lista de itens de uma resposta JSON heterogénea (CKAN/API genérica). */
export function extractItems(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["records", "data", "results", "items", "companies"]) {
      const value = obj[key];
      if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
      // CKAN: { result: { records: [...] } }
      if (value && typeof value === "object") {
        const nested = extractItems(value);
        if (nested.length) return nested;
      }
    }
    if (obj.result) return extractItems(obj.result);
  }
  return [];
}
