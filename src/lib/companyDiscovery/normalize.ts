/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Normalização e deduplicação (lógica PURA, sem I/O, testável).
 *
 * Estas funções preparam os registos externos para o pipeline interno:
 *   * normalizam NIF, nome, CAE, localização e datas;
 *   * calculam a chave de deduplicação (NIF quando existe, caso contrário uma
 *     chave CONSERVADORA baseada em nome normalizado + localização);
 *   * classificam cada registo (novo / duplicado / bloqueado / inválido).
 *
 * Não fazem pedidos de rede nem tocam no Supabase. A decisão final de inserção
 * (e a deduplicação autoritativa contra a base) é sempre validada no backend.
 */

import type {
  DiscoveryFilters,
  ExternalCompanyRecord,
  ExternalCompanySize,
  ExternalDiscoveryBucket,
  ExternalDiscoveryCounters,
  ExternalEmailClassification,
  ExternalEmailType,
  ExternalRecordEvaluation,
} from "./types";
import { EXTERNAL_DISCOVERY_LIMITS } from "./types";

/**
 * Forma de entrada aceite pelos helpers de normalização/avaliação. Permite
 * `name` nulo (registos de fontes externas podem vir sem nome — são marcados
 * inválidos) e todos os campos opcionais.
 */
export type ExternalCompanyInput = Omit<Partial<ExternalCompanyRecord>, "name"> & {
  name?: string | null;
};

/** Mantém apenas dígitos de um valor (ou null quando não há). */
export function normalizeNif(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length ? digits : null;
}

/**
 * Normaliza um nome de empresa para comparação:
 * minúsculas, sem acentos, sem pontuação, espaços colapsados e sem sufixos
 * societários comuns (Lda, S.A., Unipessoal…). Determinístico.
 */
export function normalizeCompanyName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !COMPANY_SUFFIX_TOKENS.has(token))
    .join(" ")
    .trim();
}

// Apenas sufixos societários inequívocos. NÃO removemos palavras com valor
// semântico no nome (ex.: "empresa", "comercial", "grupo") para não colapsar
// empresas distintas na mesma chave de deduplicação.
const COMPANY_SUFFIX_TOKENS = new Set([
  "lda",
  "limitada",
  "sa",
  "sad",
  "unipessoal",
  "sociedade",
  // Fragmentos de siglas societárias ("S.A." → tokens "s", "a").
  "s",
  "a",
]);

/** Normaliza um CAE (só dígitos, mantendo o formato canónico de 5 dígitos). */
export function normalizeCae(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length ? digits : null;
}

/** Normaliza uma localidade para comparação (minúsculas, sem acentos). */
export function normalizeLocality(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Valida uma data ISO `YYYY-MM-DD` (formato aceite pela base). */
export function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1800 || year > 2200) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Normaliza a dimensão para a escala interna (ou null se desconhecida). */
export function normalizeSize(value: string | null | undefined): ExternalCompanySize | null {
  if (!value) return null;
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (/(^|\b)(micro|microempresa|micro-empresa)(\b|$)/.test(normalized)) return "micro";
  if (/(pequen)/.test(normalized)) return "pequeno";
  if (/(medi|média|media)/.test(normalized)) return "medio";
  if (/(grande|grand)/.test(normalized)) return "grande";
  return null;
}

/** Normaliza o estado de atividade para a escala interna. */
export function normalizeState(value: string | null | undefined): ExternalCompanyRecord["state"] {
  if (!value) return null;
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (/(ativ|active|em atividade)/.test(normalized)) return "active";
  if (/(inativ|inactive|cessad|encerrad|dissolvid|extinct)/.test(normalized)) return "inactive";
  if (/(suspend|suspens)/.test(normalized)) return "suspended";
  return "unknown";
}

/**
 * Normaliza um website de um registo externo. NUNCA inventa esquema; aceita
 * apenas http/https e devolve a origem normalizada. Não é usado para pedidos
 * automáticos nesta fase (é apenas um atributo da empresa).
 */
export function normalizeExternalWebsite(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Bloqueia esquemas perigosos (javascript:, data:, file:).
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return `https://${url.hostname.replace(/^www\./, "")}`;
  } catch {
    return null;
  }
}

/**
 * Normaliza um email de um registo externo. NUNCA inventa nem corrige o email;
 * apenas valida o formato e devolve a forma canónica em minúsculas. Devolve
 * `null` quando o valor não é um email plausível.
 */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  // Validação conservadora: algo@dominio.tld, sem espaços. Não tenta corrigir.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

// Prefixos de caixa institucional/genérica de empresa. Comparados com o local-part
// normalizado (só letras). Inclui variantes comuns em PT e EN.
const GENERIC_EMAIL_LOCALPARTS = new Set([
  "geral",
  "info",
  "informacao",
  "informacoes",
  "contacto",
  "contactos",
  "contact",
  "comercial",
  "vendas",
  "sales",
  "marketing",
  "suporte",
  "support",
  "ajuda",
  "help",
  "admin",
  "administracao",
  "rh",
  "recrutamento",
  "gerencia",
  "direcao",
  "escritorio",
  "geralpt",
  "geral2",
  "empresa",
  "office",
  "hello",
  "mail",
  "email",
  "atendimento",
]);

/**
 * Classifica a natureza de um email (genérico de empresa vs. pessoa nomeada).
 * Heurística DETERMINÍSTICA e transparente, baseada apenas no local-part:
 *   * caixas institucionais conhecidas → `GENERIC_BUSINESS`;
 *   * padrão `nome.sobrenome`/`nome_sobrenome`/`nome-sobrenome` (dois tokens
 *     alfabéticos ≥2 letras) → `NAMED_PERSON`;
 *   * restante → `UNKNOWN` (não assumimos, e por omissão no import exclui-se).
 * Não faz lookups externos nem IA: o mesmo email classifica-se sempre igual.
 */
export function classifyEmail(value: string | null | undefined): ExternalEmailClassification {
  const email = normalizeEmail(value);
  if (!email) return "UNKNOWN";
  const localPart = email.slice(0, email.lastIndexOf("@"));
  const compact = localPart.replace(/[^a-z0-9]/g, "");
  // Caixa institucional conhecida (ex.: geral@, comercial@, geral.pt@).
  if (GENERIC_EMAIL_LOCALPARTS.has(localPart) || GENERIC_EMAIL_LOCALPARTS.has(compact)) {
    return "GENERIC_BUSINESS";
  }
  // Padrão nome.sobrenome (dois tokens alfabéticos com ≥2 letras cada).
  const tokens = localPart.split(/[._-]+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.every((token) => /^[a-z]{2,}$/.test(token))) {
    return "NAMED_PERSON";
  }
  return "UNKNOWN";
}

/** Deriva o `email_type` (alinhado com `prospect_companies.email_type`). */
export function inferEmailType(value: string | null | undefined): ExternalEmailType {
  const email = normalizeEmail(value);
  if (!email) return "outro";
  const localPart = email.slice(0, email.lastIndexOf("@"));
  const compact = localPart.replace(/[^a-z0-9]/g, "");
  if (
    localPart === "comercial" ||
    localPart === "vendas" ||
    compact.startsWith("comercial") ||
    compact.startsWith("vendas") ||
    compact.startsWith("sales")
  ) {
    return "comercial";
  }
  if (
    localPart === "suporte" ||
    localPart === "support" ||
    compact.startsWith("suporte") ||
    compact.startsWith("support") ||
    compact.startsWith("ajuda") ||
    compact.startsWith("help")
  ) {
    return "suporte";
  }
  if (
    localPart === "geral" ||
    localPart === "info" ||
    localPart === "contacto" ||
    localPart === "contactos" ||
    compact.startsWith("geral") ||
    compact.startsWith("info") ||
    compact.startsWith("contact")
  ) {
    return "geral";
  }
  return "outro";
}

/**
 * Normaliza um registo externo bruto. Devolve `null` quando o registo é
 * irrecuperável (sem nome após normalização).
 */
export function normalizeExternalRecord(
  input: ExternalCompanyInput,
  source: string,
  collectedAt: string,
): ExternalCompanyRecord | null {
  const name = (input.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;

  const employees =
    typeof input.employees === "number" && Number.isFinite(input.employees) && input.employees >= 0
      ? Math.floor(input.employees)
      : null;

  const caeSecondary = Array.isArray(input.caeSecondary)
    ? input.caeSecondary.map((code) => normalizeCae(code)).filter((code): code is string => Boolean(code))
    : null;

  return {
    name,
    nif: normalizeNif(input.nif ?? null),
    cae: normalizeCae(input.cae ?? null),
    caeSecondary: caeSecondary && caeSecondary.length ? [...new Set(caeSecondary)] : null,
    state: normalizeState(input.state ?? null),
    incorporationDate: normalizeIsoDate(input.incorporationDate ?? null),
    district: (input.district ?? "").trim() || null,
    municipality: (input.municipality ?? "").trim() || null,
    localidade: (input.localidade ?? "").trim() || null,
    address: (input.address ?? "").trim() || null,
    size: input.size ? normalizeSize(input.size) : null,
    employees,
    website: normalizeExternalWebsite(input.website ?? null),
    email: normalizeEmail(input.email ?? null),
    source,
    sourceId: (input.sourceId ?? "").toString().trim() || null,
    collectedAt,
  };
}

/**
 * Chave de deduplicação de um registo.
 *   * Preferida: `nif:<dígitos>` (identificador lógico).
 *   * Sem NIF: `name:<nome>|<localidade>` seguindo EXATAMENTE a mesma regra da
 *     coluna gerada `prospect_companies.dedup_key` na base
 *     (`lower(name)|lower(localidade)`, espaços colapsados). Manter os dois
 *     formatos idênticos garante que a pré-visualização (dry-run) coincide com
 *     a deduplicação autoritativa do backend. Nunca funde empresas com
 *     localizações diferentes.
 */
export function dedupKeyForRecord(record: ExternalCompanyRecord): string {
  if (record.nif) return `nif:${record.nif}`;
  const name = record.name.replace(/\s+/g, " ").trim().toLowerCase();
  const place = (record.localidade ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return `name:${name}|${place}`;
}

/** Dados mínimos do estado interno necessários para avaliar um registo. */
export type KnownCompanySnapshot = {
  /** NIFs (normalizados) já existentes como empresa e/ou prospect. */
  knownNifs: Set<string>;
  /** Chaves conservadoras (nome|localização) já existentes como prospect. */
  knownDedupKeys: Set<string>;
  /** NIFs bloqueados por opt-out/suppression. */
  blockedNifs: Set<string>;
  /** Chaves conservadoras bloqueadas. */
  blockedDedupKeys: Set<string>;
};

/** Snapshot vazio (usado quando não há dados internos carregados). */
export function emptyKnownCompanySnapshot(): KnownCompanySnapshot {
  return {
    knownNifs: new Set(),
    knownDedupKeys: new Set(),
    blockedNifs: new Set(),
    blockedDedupKeys: new Set(),
  };
}

/**
 * Avalia um registo externo face ao estado conhecido. Puro e determinístico.
 * A ordem de decisão é: inválido → bloqueado (opt-out) → duplicado → novo.
 * `invalid` só acontece aqui para registos sem nome (já filtrados antes).
 */
export function evaluateExternalRecord(
  record: ExternalCompanyRecord,
  known: KnownCompanySnapshot,
): ExternalRecordEvaluation {
  const dedupKey = dedupKeyForRecord(record);

  // Bloqueio por opt-out (a suppression tem prioridade sobre deduplicação).
  if (record.nif && known.blockedNifs.has(record.nif)) {
    return { record, bucket: "blocked", reason: "NIF em opt-out/suppression — não contactar", dedupKey };
  }
  if (known.blockedDedupKeys.has(dedupKey)) {
    return { record, bucket: "blocked", reason: "Registo em opt-out/suppression — não contactar", dedupKey };
  }

  // Deduplicação por NIF (identificador lógico).
  if (record.nif && known.knownNifs.has(record.nif)) {
    return { record, bucket: "duplicate", reason: "NIF já existe na Adjudata", dedupKey };
  }
  // Deduplicação conservadora (nome + localização) apenas quando não há NIF.
  if (!record.nif && known.knownDedupKeys.has(dedupKey)) {
    return { record, bucket: "duplicate", reason: "Nome + localização já existem na Adjudata", dedupKey };
  }

  // RGPD (Opção A): no import por ficheiro, só entram emails de caixa genérica de
  // empresa. Emails que aparentam ser de uma pessoa nomeada (ex.: `joao.silva@`)
  // são excluídos — não há base adequada para marketing B2B a um titular.
  // Determinístico e transparente; contabilizado como inválido.
  if (record.email && classifyEmail(record.email) === "NAMED_PERSON") {
    return {
      record,
      bucket: "invalid",
      reason: "Email aparenta ser de pessoa nomeada — excluído por omissão (apenas caixas genéricas de empresa)",
      dedupKey,
    };
  }

  return { record, bucket: "new", reason: "Empresa nova — candidata a prospect", dedupKey };
}

/**
 * Processa uma lista de registos: normaliza, remove duplicados DENTRO da própria
 * fonte e avalia cada um face ao estado conhecido. Devolve as avaliações e os
 * contadores (sem `created`, que só existe em execução real).
 */
export function evaluateDiscoveryBatch(
  records: ExternalCompanyInput[],
  source: string,
  collectedAt: string,
  known: KnownCompanySnapshot,
): { evaluations: ExternalRecordEvaluation[]; counters: ExternalDiscoveryCounters } {
  const counters: ExternalDiscoveryCounters = {
    found: records.length,
    existing: 0,
    blocked: 0,
    invalid: 0,
    created: 0,
    errors: 0,
    sourceDuplicates: 0,
  };

  const seenKeys = new Set<string>();
  const evaluations: ExternalRecordEvaluation[] = [];

  for (const raw of records) {
    const normalized = normalizeExternalRecord(raw, source, collectedAt);
    if (!normalized) {
      counters.invalid += 1;
      continue;
    }
    const key = dedupKeyForRecord(normalized);
    // Duplicado dentro da própria fonte: ignora (mas não é erro).
    if (seenKeys.has(key)) {
      counters.sourceDuplicates += 1;
      continue;
    }
    seenKeys.add(key);

    const evaluation = evaluateExternalRecord(normalized, known);
    switch (evaluation.bucket) {
      case "duplicate":
        counters.existing += 1;
        break;
      case "blocked":
        counters.blocked += 1;
        break;
      case "invalid":
        counters.invalid += 1;
        break;
      default:
        break;
    }
    evaluations.push(evaluation);
  }

  return { evaluations, counters };
}

/** Mapeia os filtros para um objeto serializável (para auditoria). */
export function filtersToObject(filters: DiscoveryFilters): Record<string, unknown> {
  return {
    cae: filters.cae ?? null,
    sector: filters.sector ?? null,
    district: filters.district ?? null,
    municipality: filters.municipality ?? null,
    incorporationFrom: filters.incorporationFrom ?? null,
    incorporationTo: filters.incorporationTo ?? null,
    activeOnly: filters.activeOnly ?? false,
    size: filters.size ?? null,
    minEmployees: filters.minEmployees ?? null,
    limit: Math.min(Math.max(filters.limit || 1, 1), EXTERNAL_DISCOVERY_LIMITS.maxResults),
  };
}

/**
 * Aplica os filtros a uma lista de registos já normalizados.
 * Usado pelo `FileCompanyDiscoveryProvider` (que não tem uma API que filtre) e
 * como defesa em profundidade para qualquer provider.
 */
export function applyFilters(records: ExternalCompanyRecord[], filters: DiscoveryFilters): ExternalCompanyRecord[] {
  return records.filter((record) => {
    if (filters.cae && !(record.cae ?? "").startsWith(filters.cae)) return false;
    if (filters.district && normalizeLocality(record.district ?? "") !== normalizeLocality(filters.district)) {
      return false;
    }
    if (
      filters.municipality &&
      normalizeLocality(record.municipality ?? "") !== normalizeLocality(filters.municipality)
    ) {
      return false;
    }
    if (filters.activeOnly && record.state && record.state !== "active") return false;
    if (filters.size && record.size !== filters.size) return false;
    if (typeof filters.minEmployees === "number" && (record.employees ?? 0) < filters.minEmployees) return false;
    if (filters.incorporationFrom && (!record.incorporationDate || record.incorporationDate < filters.incorporationFrom)) {
      return false;
    }
    if (filters.incorporationTo && (!record.incorporationDate || record.incorporationDate > filters.incorporationTo)) {
      return false;
    }
    if (filters.sector) {
      const needle = normalizeLocality(filters.sector);
      const haystack = normalizeLocality([record.cae, record.name].filter(Boolean).join(" "));
      if (needle && !haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Filtros por omissão seguros. */
export function defaultFilters(limit = 50): DiscoveryFilters {
  return {
    cae: null,
    sector: null,
    district: null,
    municipality: null,
    incorporationFrom: null,
    incorporationTo: null,
    activeOnly: true,
    size: null,
    minEmployees: null,
    limit: Math.min(Math.max(limit, 1), EXTERNAL_DISCOVERY_LIMITS.maxResults),
  };
}

/** Ordem de prioridade para apresentação (novo primeiro). */
export const BUCKET_PRIORITY: Record<ExternalDiscoveryBucket, number> = {
  new: 0,
  duplicate: 1,
  blocked: 2,
  invalid: 3,
};

export function sortEvaluations(evaluations: ExternalRecordEvaluation[]): ExternalRecordEvaluation[] {
  return [...evaluations].sort((a, b) => {
    const byBucket = BUCKET_PRIORITY[a.bucket] - BUCKET_PRIORITY[b.bucket];
    if (byBucket !== 0) return byBucket;
    return a.record.name.localeCompare(b.record.name, "pt");
  });
}
