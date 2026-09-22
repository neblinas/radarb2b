/**
 * Adjudata — Prospeção B2B: External Company Discovery Engine (FASE 8).
 * Leitura de ficheiros estruturados (CSV / JSON). Lógica PURA, sem I/O.
 *
 * Permite que qualquer fonte externa (exportação de dataset, lista do
 * administrador, resultados de uma API colada num ficheiro) alimente o sistema
 * sem alterar o pipeline. Mapeia colunas comuns em português e inglês.
 *
 * Segurança:
 *   * Não executa URLs nem conteúdo do ficheiro.
 *   * Não segue hiperligações.
 *   * Limita o número de registos e o tamanho.
 *
 * XLSX não é lido diretamente (para não acrescentar uma dependência pesada sem
 * benefício proporcional). O administrador deve exportar para CSV. Esta decisão
 * está documentada em `FASE8.md`.
 */

import type { ExternalCompanyRecord } from "./types";
import { EXTERNAL_DISCOVERY_LIMITS } from "./types";

/** Formato de ficheiro suportado. */
export type StructuredFileFormat = "csv" | "json";

export type ParsedFileResult = {
  /** Registos extraídos (parcialmente normalizados; `source`/`collectedAt` no motor). */
  records: Array<Partial<ExternalCompanyRecord> & { name?: string | null }>;
  /** Erros de parsing/validação (não fatais). */
  errors: string[];
  /** Formato detetado. */
  format: StructuredFileFormat;
};

/** Deteta o formato pelo nome do ficheiro ou pelo conteúdo. */
export function detectFileFormat(fileName: string, content: string): StructuredFileFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "csv";
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.includes(",") || trimmed.includes(";") || trimmed.includes("\t")) return "csv";
  return null;
}

/**
 * Mapa de cabeçalhos reconhecidos → campo interno. Aceita variações comuns em
 * português e inglês. Comparação feita sobre cabeçalhos normalizados.
 */
const HEADER_ALIASES: Record<string, string> = {
  nome: "name",
  name: "name",
  empresa: "name",
  razao: "name",
  razaosocial: "name",
  "razao social": "name",
  nif: "nif",
  nipc: "nif",
  nuit: "nif",
  cae: "cae",
  caeprincipal: "cae",
  "cae principal": "cae",
  caes: "caeSecondary",
  "cae secundarios": "caeSecondary",
  caesecundario: "caeSecondary",
  estado: "state",
  situacao: "state",
  activity: "state",
  status: "state",
  constituicao: "incorporationDate",
  dataconstituicao: "incorporationDate",
  "data de constituicao": "incorporationDate",
  data_constituicao: "incorporationDate",
  incorporation: "incorporationDate",
  fundacao: "incorporationDate",
  distrito: "district",
  district: "district",
  concelho: "municipality",
  municipio: "municipality",
  municipality: "municipality",
  localidade: "localidade",
  freguesia: "localidade",
  address: "address",
  morada: "address",
  sede: "address",
  dimensao: "size",
  size: "size",
  trabalhadores: "employees",
  employees: "employees",
  website: "website",
  site: "website",
  url: "website",
  contacto: "email",
  contactos: "email",
  email: "email",
  "e mail": "email",
  correio: "email",
  id: "sourceId",
  sourceid: "sourceId",
  identificador: "sourceId",
};

/** Normaliza um cabeçalho (minúsculas, sem acentos/pontuação). */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mapeia um cabeçalho para o campo interno (ou null). */
export function mapHeaderToField(header: string): string | null {
  const normalized = normalizeHeader(header);
  if (HEADER_ALIASES[normalized]) return HEADER_ALIASES[normalized];
  const compact = normalized.replace(/\s+/g, "");
  return HEADER_ALIASES[compact] ?? null;
}

/**
 * Faz parsing de CSV/TSV simples (sem aspas complexas nem campos multi-linha,
 * suficiente para exportações de datasets). Deteta o delimitador automaticamente.
 */
export function parseDelimited(content: string, delimiter?: string): { headers: string[]; rows: string[][] } {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const detected =
    delimiter ??
    (firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",");

  // Parser com suporte a campos entre aspas duplas.
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === detected) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows: rows.filter((r) => r.some((cell) => cell.trim() !== "")) };
}

/** Converte uma linha CSV (cabeçalhos + valores) num registo parcial. */
function rowToRecord(headers: string[], values: string[]): Partial<ExternalCompanyRecord> & { name?: string | null } {
  const out: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    const field = mapHeaderToField(header);
    if (!field) return;
    const value = (values[index] ?? "").trim();
    if (!value) return;
    if (field === "caeSecondary") {
      out.caeSecondary = value.split(/[;|,]/).map((v) => v.trim()).filter(Boolean);
    } else if (field === "employees") {
      const digits = value.replace(/\D/g, "");
      if (digits) out.employees = Number(digits);
    } else {
      out[field] = value;
    }
  });
  return out as Partial<ExternalCompanyRecord> & { name?: string | null };
}

/** Faz parsing de JSON (array de objetos ou objeto com `records`/`data`/`results`). */
export function parseJson(content: string): { records: Array<Record<string, unknown>>; error?: string } {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return { records: parsed as Record<string, unknown>[] };
    if (parsed && typeof parsed === "object") {
      for (const key of ["records", "data", "results", "companies", "empresas"]) {
        const value = (parsed as Record<string, unknown>)[key];
        if (Array.isArray(value)) return { records: value as Record<string, unknown>[] };
      }
    }
    return { records: [], error: "JSON sem lista de empresas reconhecível." };
  } catch (error) {
    return { records: [], error: `JSON inválido: ${error instanceof Error ? error.message : "erro"}` };
  }
}

/** Mapeia um objeto JSON (por chaves) para um registo parcial. */
function objectToRecord(item: Record<string, unknown>): Partial<ExternalCompanyRecord> & { name?: string | null } {
  const out: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(item)) {
    const field = mapHeaderToField(key);
    if (!field) continue;
    if (rawValue == null) continue;
    if (field === "caeSecondary" && Array.isArray(rawValue)) {
      out.caeSecondary = rawValue.map((v) => String(v));
    } else if (field === "employees") {
      const digits = String(rawValue).replace(/\D/g, "");
      if (digits) out.employees = Number(digits);
    } else if (typeof rawValue === "string" || typeof rawValue === "number") {
      out[field] = String(rawValue);
    }
  }
  return out as Partial<ExternalCompanyRecord> & { name?: string | null };
}

/**
 * Faz parsing de conteúdo de ficheiro (CSV ou JSON). Devolve registos e erros;
 * nunca lança. Aplica o limite de registos do ficheiro.
 */
export function parseStructuredFile(fileName: string, content: string): ParsedFileResult {
  const errors: string[] = [];
  if (content.length > EXTERNAL_DISCOVERY_LIMITS.maxFileBytes) {
    return { records: [], errors: ["Ficheiro demasiado grande (limite 5 MB)."], format: "csv" };
  }

  const format = detectFileFormat(fileName, content);
  if (!format) {
    return { records: [], errors: ["Formato não reconhecido. Use CSV ou JSON."], format: "csv" };
  }

  let records: Array<Partial<ExternalCompanyRecord> & { name?: string | null }> = [];

  if (format === "json") {
    const { records: rawRecords, error } = parseJson(content);
    if (error) errors.push(error);
    records = rawRecords.map(objectToRecord);
  } else {
    const { headers, rows } = parseDelimited(content);
    if (!headers.some((h) => (mapHeaderToField(h) ?? "") === "name")) {
      errors.push("Coluna de nome/empresa não encontrada no cabeçalho.");
    }
    records = rows.map((values) => rowToRecord(headers, values));
  }

  if (records.length > EXTERNAL_DISCOVERY_LIMITS.maxFileRecords) {
    errors.push(`Ficheiro com ${records.length} registos; apenas os primeiros ${EXTERNAL_DISCOVERY_LIMITS.maxFileRecords} são considerados.`);
    records = records.slice(0, EXTERNAL_DISCOVERY_LIMITS.maxFileRecords);
  }

  return { records, errors, format };
}
