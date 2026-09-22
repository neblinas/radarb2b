/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Contratos de tipos do motor de descoberta de empresas EXTERNAS.
 *
 * Objetivo: descobrir empresas que ainda NÃO existem na base da Adjudata a
 * partir de fontes externas legalmente reutilizáveis (APIs públicas, dados
 * abertos, datasets com licença explícita, ficheiros fornecidos pelo
 * administrador), importar apenas os dados empresariais necessários e
 * submetê-las ao fluxo normal de enriquecimento, scoring e qualificação.
 *
 * Princípios (AGENTS.md):
 *   * Não usar scraping de fontes que proíbam automação.
 *   * Não contornar CAPTCHA, autenticação, rate limiting, robots.txt ou termos.
 *   * Priorizar APIs públicas, dados abertos e fontes com licença explícita.
 *   * Nada é inventado: URLs/endpoints vêm sempre de configuração explícita.
 *
 * Este módulo é desacoplado da base atual da Adjudata: os providers só produzem
 * `ExternalCompanyRecord`. A inserção (prospect creation) é feita à parte, pelo
 * pipeline já existente.
 */

/**
 * Estado de atividade da empresa, quando a fonte o disponibiliza.
 * Nulo = desconhecido (nunca inferido).
 */
export type ExternalActivityState = "active" | "inactive" | "suspended" | "unknown";

/**
 * Dimensão da empresa, quando a fonte a disponibiliza.
 * Alinhada com a escala usada em `prospect_companies.estimated_size`.
 */
export type ExternalCompanySize = "micro" | "pequeno" | "medio" | "grande";

/**
 * Registo de empresa normalizado, proveniente de uma fonte externa.
 * Todos os campos são opcionais exceto `name` e `source`/`sourceId`.
 */
export type ExternalCompanyRecord = {
  /** Nome legal da empresa (obrigatório). */
  name: string;
  /** NIF/NIPC (só dígitos, quando disponível). */
  nif?: string | null;
  /** CAE principal (formato canónico, ex.: "62010"). */
  cae?: string | null;
  /** CAEs secundários. */
  caeSecondary?: string[] | null;
  /** Estado da empresa na fonte. */
  state?: ExternalActivityState | null;
  /** Data de constituição (ISO `YYYY-MM-DD`), quando disponível. */
  incorporationDate?: string | null;
  /** Distrito. */
  district?: string | null;
  /** Concelho/município. */
  municipality?: string | null;
  /** Localidade/freguesia. */
  localidade?: string | null;
  /** Morada empresarial (sede), quando disponível. */
  address?: string | null;
  /** Dimensão, quando a fonte a disponibiliza. */
  size?: ExternalCompanySize | null;
  /** Número de trabalhadores, quando disponível. */
  employees?: number | null;
  /** Website, quando a fonte o disponibiliza (nunca inferido nesta fase). */
  website?: string | null;
  /**
   * Email de contacto, quando a fonte o fornece EXPLICITAMENTE (nunca inferido,
   * nunca extraído de HTML). No import por ficheiro (CSV/JSON) é a coluna de
   * contacto declarada pelo administrador.
   */
  email?: string | null;

  // ---- Proveniência (obrigatória) -----------------------------------------
  /** Identificador estável do provider que produziu o registo. */
  source: string;
  /** Identificador da empresa NA fonte (quando existe). */
  sourceId?: string | null;
  /** Data de recolha (ISO). */
  collectedAt: string;
};

/**
 * Classificação do email de contacto face à natureza da caixa. Alinhada com a
 * escala usada no enriquecimento (`company_enrichment_contacts.classification`):
 *   * `GENERIC_BUSINESS` — caixa institucional/genérica (ex.: `geral@`, `info@`),
 *     apta para comunicação B2B por interesse legítimo.
 *   * `NAMED_PERSON`     — aparenta ser de uma pessoa (ex.: `joao.silva@`);
 *     excluída por omissão no import por ficheiro.
 *   * `UNKNOWN`          — não é possível determinar com confiança.
 */
export type ExternalEmailClassification = "GENERIC_BUSINESS" | "NAMED_PERSON" | "UNKNOWN";

/** Tipo de email alinhado com `prospect_companies.email_type`. */
export type ExternalEmailType = "geral" | "comercial" | "suporte" | "outro";

/** Filtros de pesquisa aceites pelos providers. */
export type DiscoveryFilters = {
  /** CAE (exato ou prefixo, conforme a fonte). */
  cae?: string | null;
  /** Ramo/setor (texto livre, quando a fonte o disponibiliza). */
  sector?: string | null;
  /** Distrito. */
  district?: string | null;
  /** Concelho/município. */
  municipality?: string | null;
  /** Data de constituição — limite inferior (ISO `YYYY-MM-DD`). */
  incorporationFrom?: string | null;
  /** Data de constituição — limite superior (ISO `YYYY-MM-DD`). */
  incorporationTo?: string | null;
  /** Apenas empresas ativas (quando a fonte suporta). */
  activeOnly?: boolean;
  /** Dimensão pretendida (quando a fonte suporta). */
  size?: ExternalCompanySize | null;
  /** Intervalo mínimo de trabalhadores (quando a fonte suporta). */
  minEmployees?: number | null;
  /** Limite máximo de resultados (aplicado pelo provider). */
  limit: number;
};

/** Checkpoint de sincronização incremental por provider. */
export type DiscoveryCheckpoint = {
  provider: string;
  /** Cursor/valor opaco devolvido pela fonte (nunca interpretado pelo motor). */
  cursor?: string | null;
  /** Última data importada (ISO), quando a fonte suporta `updated_since`. */
  updatedSince?: string | null;
  /** Última execução (ISO). */
  lastRunAt?: string | null;
};

/** Metadados da fonte, documentados e auditáveis. */
export type SourceMetadata = {
  /** Identificador estável do provider. */
  id: string;
  /** Nome legível. */
  name: string;
  /** Tipo de fonte. */
  kind: "open_data" | "api" | "file" | "manual";
  /** Licença de reutilização (documentada, obrigatória). */
  license: string;
  /** URL dos termos/licença (informativo; nunca usado para scraping automático). */
  licenseUrl?: string | null;
  /** Página oficial da fonte (informativo). */
  homepage?: string | null;
  /** Se a fonte suporta sincronização incremental. */
  supportsIncrementalSync: boolean;
  /** Notas de conformidade/limites. */
  notes?: string | null;
};

/**
 * Resultado de uma pesquisa de um provider. `errors` recolhe falhas parciais
 * (a fonte pode devolver resultados e erros em simultâneo).
 */
export type ProviderSearchResult = {
  records: ExternalCompanyRecord[];
  /** Sinal de que a fonte tem mais resultados (paginação). */
  hasMore: boolean;
  /** Cursor para a próxima página/execução incremental, quando aplicável. */
  nextCursor?: string | null;
  /** Erros parciais, não fatais. */
  errors?: string[];
};

/**
 * Interface comum a TODOS os providers de descoberta externa.
 *
 * O restante sistema NUNCA depende de uma fonte específica: apenas desta
 * interface. Permite adicionar futuramente vários providers sem alterar o
 * pipeline principal.
 */
export interface CompanyDiscoveryProvider {
  /** Identificador estável do provider. */
  readonly id: string;
  /** Metadados documentados da fonte (licença, tipo, incremental). */
  getSourceMetadata(): SourceMetadata;
  /** A fonte suporta sincronização incremental (novas/alteadas desde data)? */
  supportsIncrementalSync(): boolean;
  /**
   * Pesquisa empresas na fonte. Nunca deve lançar para falhas de rede/parsing
   * parciais: devolve `records` com o que conseguiu e `errors` com o resto.
   */
  searchCompanies(filters: DiscoveryFilters, checkpoint?: DiscoveryCheckpoint | null): Promise<ProviderSearchResult>;
  /**
   * Obtém o detalhe de uma empresa pelo identificador NA fonte. Nesta fase a
   * maioria das fontes já devolve tudo em `searchCompanies`; este método existe
   * para fontes que expõem detalhe a pedido. Devolve `null` se desconhecido.
   */
  getCompanyDetails(identifier: string): Promise<ExternalCompanyRecord | null>;
}

/** Bucket de classificação de um registo descoberto. */
export type ExternalDiscoveryBucket = "new" | "duplicate" | "blocked" | "invalid";

export const externalDiscoveryBucketLabel: Record<ExternalDiscoveryBucket, string> = {
  new: "Novo",
  duplicate: "Já existe",
  blocked: "Bloqueado (opt-out)",
  invalid: "Inválido",
};

/**
 * Avaliação pura de um registo externo face ao estado interno. Produzida pelo
 * motor determinístico antes de qualquer inserção (dry-run ou real).
 */
export type ExternalRecordEvaluation = {
  record: ExternalCompanyRecord;
  bucket: ExternalDiscoveryBucket;
  /** Motivo legível (transparente). */
  reason: string;
  /** Chave de deduplicação usada (NIF ou chave conservadora). */
  dedupKey: string;
};

/** Contagens agregadas de uma execução de descoberta. */
export type ExternalDiscoveryCounters = {
  /** Registos devolvidos pela fonte. */
  found: number;
  /** Já existem na Adjudata (empresa e/ou prospect). */
  existing: number;
  /** Bloqueados por opt-out/suppression. */
  blocked: number;
  /** Inválidos (sem nome, duplicados internos, etc.). */
  invalid: number;
  /** Novos prospects criados (0 em dry-run). */
  created: number;
  /** Erros durante a execução. */
  errors: number;
  /** Duplicados dentro da própria fonte (ignorados). */
  sourceDuplicates: number;
};

/** Resultado completo de uma execução de descoberta externa. */
export type ExternalDiscoveryResult = {
  /** ID da execução registada. */
  run_id: string;
  provider: string;
  dry_run: boolean;
  counters: ExternalDiscoveryCounters;
  /** Avaliações (limitadas na resposta para não pesar). */
  evaluations: ExternalRecordEvaluation[];
  /** Metadados da fonte utilizada. */
  source: SourceMetadata;
  started_at: string;
  finished_at: string;
  errors: string[];
};

/** Registo de uma execução (histórico). */
export type ExternalDiscoveryRun = {
  id: string;
  provider: string;
  dry_run: boolean;
  filters: Record<string, unknown>;
  found: number;
  existing: number;
  blocked: number;
  invalid: number;
  created: number;
  errors: number;
  source_duplicates: number;
  created_by: string | null;
  started_at: string;
  finished_at: string | null;
};

/** Limites defensivos da descoberta externa. */
export const EXTERNAL_DISCOVERY_LIMITS = {
  /** Máximo de resultados por execução. */
  maxResults: 500,
  /** Máximo de avaliações devolvidas ao back-office. */
  maxEvaluationsReturned: 200,
  /** Máximo de registos por ficheiro importado. */
  maxFileRecords: 5000,
  /** Máximo de bytes de um ficheiro importado (5 MB). */
  maxFileBytes: 5_000_000,
} as const;
