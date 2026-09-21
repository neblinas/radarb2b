import { supabase } from "@/lib/supabase";
import {
  assertSafeUrl,
  ENRICHMENT_LIMITS,
  isNonOfficialDomain,
  normalizeHost,
} from "@/lib/enrichmentSecurity";

/**
 * Prospeção B2B — Enriquecimento empresarial (FASE 4). Camada de domínio + I/O.
 *
 * Objetivo: descobrir o website oficial de uma empresa e recolher os contactos
 * empresariais que a própria empresa disponibiliza publicamente, com
 * proveniência auditável.
 *
 * Princípio (AGENTS.md + requisitos da fase):
 *   * Privilegia dados abertos com licença de reutilização, o website oficial
 *     e páginas públicas explicitamente destinadas a contacto empresarial.
 *   * NÃO contorna bloqueios, CAPTCHA, autenticação, robots.txt, rate limits ou
 *     termos de utilização. NÃO faz scraping de fontes que o proíbam.
 *
 * NÃO implementado nesta fase (deliberado):
 *   * envio de emails, integração com o Autopilot, campanhas;
 *   * cron automático em larga escala.
 *
 * O crawling/orquestração de rede corre no edge function `enrich-company`
 * (Deno). Aqui vive a lógica determinística (candidatos de website, confidence,
 * classificação, extração, validação) e a camada de I/O com Supabase. As
 * mesmas regras são espelhadas no edge function quando correm no servidor.
 */

// ---------------------------------------------------------------------------
// 1. Descoberta do website — providers modulares
// ---------------------------------------------------------------------------

/** Entrada fornecida aos providers de descoberta de website. */
export type WebsiteDiscoveryInput = {
  /** Nome da empresa (obrigatório). */
  name: string;
  /** NIF (opcional; ajuda a desambiguar). */
  nif?: string | null;
  /** Localidade/distrito (opcional; ajuda a desambiguar homónimos). */
  localidade?: string | null;
  /** Website já conhecido, se existir. */
  knownWebsite?: string | null;
};

/** Candidato de website devolvido por um provider. */
export type WebsiteCandidate = {
  /** URL normalizada (https quando possível). */
  url: string;
  /** Domínio (sem `www.`). */
  domain: string;
  /** Confiança 0-100 atribuída pelo provider. */
  confidence: number;
  /** Método/provenição da descoberta. */
  method: WebsiteDiscoveryMethod;
  /** Explicação legível do rationale. */
  reason: string;
};

export type WebsiteDiscoveryMethod =
  | "known_website" // já existia no sistema
  | "domain_guess" // conjetura a partir do nome/NIF (nunca escolhida sem verificação)
  | "open_data"; // dados abertos com licença de reutilização (ex.: registo público)

/** Provider de descoberta de websites. Modular e substituível. */
export interface WebsiteDiscoveryProvider {
  /** Identificador estável do provider. */
  readonly id: string;
  /** Método associado (para proveniência). */
  readonly method: WebsiteDiscoveryMethod;
  /**
   * Devolve candidatos de website. PODE ser assíncrono (fonte de dados aberta).
   * Nunca deve lançar: em caso de falha, devolve lista vazia.
   */
  discover(input: WebsiteDiscoveryInput): Promise<WebsiteCandidate[]>;
}

/** Extrai tokens significativos do nome da empresa. */
export function companyNameTokens(name: string): string[] {
  const STOPWORDS = new Set(["lda", "sa", "s.a", "unipessoal", "limitada", "sociedade", "e", "the", "of", "and", "grupo", "group"]);
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/** Constrói uma URL de website a partir de um domínio. */
export function websiteFromDomain(domain: string): string {
  return `https://${normalizeHost(domain)}`;
}

/** Transforma uma URL candidata em candidato válido (ou null se não aplicável). */
export function toWebsiteCandidate(
  url: string | null | undefined,
  input: WebsiteDiscoveryInput,
  method: WebsiteDiscoveryMethod,
): WebsiteCandidate | null {
  if (!url) return null;
  const check = assertSafeUrl(url);
  if (!check.ok) return null;
  const domain = normalizeHost(check.url.hostname);
  if (isNonOfficialDomain(domain)) return null;
  const confidence = scoreWebsiteCandidate(domain, check.url.toString(), input, method);
  return {
    url: websiteFromDomain(domain),
    domain,
    confidence,
    method,
    reason: candidateReason(domain, input, confidence),
  };
}

/**
 * Provider: website já conhecido no sistema. Maior confiança, mas nunca 100
 * (confiança exige verificação de acessibilidade, feita no crawler).
 */
export const knownWebsiteProvider: WebsiteDiscoveryProvider = {
  id: "known_website",
  method: "known_website",
  async discover(input) {
    const candidate = toWebsiteCandidate(input.knownWebsite, input, "known_website");
    return candidate ? [candidate] : [];
  },
};

/**
 * Provider: conjetura de domínio a partir do nome (+ TLD `.pt`/`.com`). É um
 * PALPITE: confiança baixa e nunca escolhido arbitrariamente entre vários.
 * Existe para alimentar a lista de "possíveis websites" para verificação.
 */
export const domainGuessProvider: WebsiteDiscoveryProvider = {
  id: "domain_guess",
  method: "domain_guess",
  async discover(input) {
    const tokens = companyNameTokens(input.name);
    if (!tokens.length) return [];
    const base = tokens.join("");
    const candidates: WebsiteCandidate[] = [];
    for (const tld of ["pt", "com"]) {
      const candidate = toWebsiteCandidate(websiteFromDomain(`${base}.${tld}`), input, "domain_guess");
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  },
};

/**
 * Provider: dados abertos com licença de reutilização (ex.: registo público de
 * empresas). Nesta fase não há uma fonte externa integrada — o provider é
 * registado para que futuras fontes abertas se liguem sem alterar o motor.
 * Devolve sempre lista vazia (nenhum dado é inventado).
 */
export const openDataWebsiteProvider: WebsiteDiscoveryProvider = {
  id: "open_data",
  method: "open_data",
  async discover() {
    return [];
  },
};

/** Registro de providers por omissão (ordem = prioridade de avaliação). */
export const DEFAULT_WEBSITE_PROVIDERS: WebsiteDiscoveryProvider[] = [
  knownWebsiteProvider,
  openDataWebsiteProvider,
  domainGuessProvider,
];

/**
 * Confidence de um candidato de website.
 *   * website já conhecido → alta confiança base (85), ajustável por tokens.
 *   * conjetura de domínio → baixa confiança (25-45), ajustável por tokens.
 * Homónimos (nome curto) reduzem a confiança — nunca se escolhe arbitrariamente.
 */
export function scoreWebsiteCandidate(
  domain: string,
  _url: string,
  input: WebsiteDiscoveryInput,
  method: WebsiteDiscoveryMethod,
): number {
  const host = normalizeHost(domain);
  const tokens = companyNameTokens(input.name);
  const hostBase = host.split(".")[0];
  const tokenMatch = tokens.some((token) => hostBase.includes(token) || token.includes(hostBase));

  let score = method === "known_website" ? 85 : method === "open_data" ? 60 : 25;
  if (tokenMatch) score += 10;
  // Nome muito curto/genérico → risco de homónimo, penalizar.
  if (tokens.length <= 1 && tokens[0] && tokens[0].length < 5) score -= 10;
  // TLD português ligeiramente mais provável, mas sem exagero.
  if (host.endsWith(".pt")) score += 3;
  return Math.max(0, Math.min(100, score));
}

function candidateReason(domain: string, input: WebsiteDiscoveryInput, confidence: number): string {
  if (confidence >= 70) return `Website com confiança elevada (${domain})`;
  if (confidence >= 40) return `Website provável (${domain}) a confirmar`;
  return `Palpite de domínio (${domain}) — requer verificação humana`;
}

/**
 * Executa todos os providers e devolve candidatos deduplicados por domínio,
 * ordenados por confiança. NUNCA escolhe um vencedor: a decisão exige
 * confiança suficiente OU revisão humana.
 */
export async function discoverWebsites(
  input: WebsiteDiscoveryInput,
  providers: WebsiteDiscoveryProvider[] = DEFAULT_WEBSITE_PROVIDERS,
): Promise<WebsiteCandidate[]> {
  const results = await Promise.all(
    providers.map((provider) => provider.discover(input).catch(() => [] as WebsiteCandidate[])),
  );
  const byDomain = new Map<string, WebsiteCandidate>();
  for (const candidate of results.flat()) {
    const existing = byDomain.get(candidate.domain);
    if (!existing || candidate.confidence > existing.confidence) {
      byDomain.set(candidate.domain, candidate);
    }
  }
  return [...byDomain.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Limiar de confiança a partir do qual se pode avançar para crawling sem
 * revisão humana. Abaixo disso, o website é apenas "possível" e requer
 * confirmação — nunca se escolhe arbitrariamente entre vários domínios.
 */
export const WEBSITE_CONFIDENCE_THRESHOLD = 70;

export function selectConfidentWebsite(candidates: WebsiteCandidate[]): WebsiteCandidate | null {
  const eligible = candidates.filter((candidate) => candidate.confidence >= WEBSITE_CONFIDENCE_THRESHOLD);
  // Só avança automaticamente se houver UM domínio claramente melhor.
  if (!eligible.length) return null;
  const [best, second] = eligible;
  if (second && best.confidence - second.confidence < 10) return null; // dúvida → humano
  return best;
}

// ---------------------------------------------------------------------------
// 2. Classificação e extração de contactos
// ---------------------------------------------------------------------------

/** Classificação de um contacto empresarial. */
export type ContactClassification = "GENERIC_BUSINESS" | "NAMED_PERSON" | "UNKNOWN";

/** Tipo de contacto. */
export type ContactKind = "email" | "phone";

/**
 * Emails genéricos empresariais por ordem de prioridade (índice = prioridade:
 * menor é melhor). Prefixos nominais não constam aqui.
 */
export const GENERIC_BUSINESS_PREFIXES = [
  "geral",
  "info",
  "comercial",
  "contacto",
  "contato",
  "vendas",
  "sales",
  "office",
  "administracao",
  "admin",
] as const;

/** Contacto empresarial extraído, com proveniência completa. */
export type ExtractedContact = {
  /** Valor original (tal como apresentado). */
  contacto: string;
  /** Valor normalizado (minúsculas para email; dígitos para telefone). */
  normalizado: string;
  /** URL exata da página de origem. */
  sourceUrl: string;
  /** Domínio do website onde foi encontrado. */
  domain: string;
  /** Data de recolha (ISO). */
  collectedAt: string;
  /** Tipo de contacto. */
  kind: ContactKind;
  /** Classificação (GENERIC_BUSINESS / NAMED_PERSON / UNKNOWN). */
  classification: ContactClassification;
  /** Confiança 0-100. */
  confidence: number;
  /** Método de descoberta (ex.: "official_website_crawl"). */
  method: string;
  /** Nota sobre prioridade (ex.: "email nominativo — potencial dado pessoal"). */
  note?: string;
};

/** Email genérico empresarial? Devolve a prioridade (índice) ou -1. */
export function genericBusinessPriority(email: string): number {
  const local = email.slice(0, email.lastIndexOf("@")).toLowerCase().trim();
  const base = local.split(/[._-]/)[0];
  const index = (GENERIC_BUSINESS_PREFIXES as readonly string[]).indexOf(base);
  return index;
}

/**
 * Classifica um email empresarial:
 *   * GENERIC_BUSINESS — endereços institucionais (geral@, info@, comercial@…).
 *   * NAMED_PERSON — endereço nominal (ex.: joao.silva@empresa.pt). Potencial
 *     dado pessoal — prioridade MUITO inferior.
 *   * UNKNOWN — não é possível decidir com confiança.
 */
export function classifyContact(email: string): ContactClassification {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "UNKNOWN";
  const local = email.slice(0, at).toLowerCase();
  if (!local) return "UNKNOWN";
  if (genericBusinessPriority(email) >= 0) return "GENERIC_BUSINESS";
  // Heurística conservadora para nomes: duas partes separadas por . _ - ou
  // local curto alfabético que não seja palavra institucional comum.
  if (/^[a-zà-ú]+[._-][a-zà-ú]+$/.test(local)) return "NAMED_PERSON";
  if (/^[a-zà-ú]{2,3}$/.test(local)) return "UNKNOWN"; // iniciais/ambiguo
  return "NAMED_PERSON";
}

/** Cache simples do último timestamp por host, para rate limiting determinístico. */
export type RateLimiter = { lastRequestAt: number };

/**
 * Decide se um pedido pode avançar agora (rate limiting) e devolve o atraso
 * necessário em ms. Puro — o caller é que aguarda.
 */
export function rateLimitDelay(lastRequestAt: number, now: number, minDelay = ENRICHMENT_LIMITS.minDelayBetweenRequestsMs): number {
  const elapsed = now - lastRequestAt;
  return elapsed >= minDelay ? 0 : minDelay - elapsed;
}

/**
 * Extrai emails de HTML e devolve contactos classificados.
 *   * Só emails com sintaxe válida.
 *   * Páginas de contacto explícitas recebem confiança mais alta.
 */
export function extractEmails(
  html: string,
  params: { sourceUrl: string; domain: string; collectedAt: string; method?: string; isContactPage?: boolean },
): ExtractedContact[] {
  const method = params.method ?? "official_website_crawl";
  const matches = html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  const seen = new Set<string>();
  const out: ExtractedContact[] = [];
  for (const raw of matches) {
    const email = raw.toLowerCase();
    if (!isValidEmailSyntax(email) || seen.has(email)) continue;
    seen.add(email);
    const classification = classifyContact(email);
    // Só aceitamos emails do domínio do website (institucionais) por omissão;
    // emails de terceiros são ignorados nesta fase.
    if (emailDomainOf(email) !== normalizeHost(params.domain)) continue;
    const baseConfidence = params.isContactPage ? 80 : 60;
    const priorityPenalty = classification === "GENERIC_BUSINESS" ? 0 : classification === "NAMED_PERSON" ? 25 : 15;
    out.push({
      contacto: raw,
      normalizado: email,
      sourceUrl: params.sourceUrl,
      domain: normalizeHost(params.domain),
      collectedAt: params.collectedAt,
      kind: "email",
      classification,
      confidence: Math.max(0, Math.min(100, baseConfidence - priorityPenalty)),
      method,
      note: classification === "NAMED_PERSON" ? "Email nominativo — potencial dado pessoal" : undefined,
    });
  }
  return out;
}

/**
 * Extrai telefones empresariais (formato português) de HTML e normaliza-os.
 */
export function extractPhones(
  html: string,
  params: { sourceUrl: string; domain: string; collectedAt: string; method?: string; isContactPage?: boolean },
): ExtractedContact[] {
  const method = params.method ?? "official_website_crawl";
  const matches = html.match(/(?:\+351[\s.-]?)?(?:2\d{2}|9\d{2})[\s.-]?\d{3}[\s.-]?\d{3}/g) ?? [];
  const seen = new Set<string>();
  const out: ExtractedContact[] = [];
  for (const raw of matches) {
    const normalized = normalizePhone(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({
      contacto: raw.trim(),
      normalizado: normalized,
      sourceUrl: params.sourceUrl,
      domain: normalizeHost(params.domain),
      collectedAt: params.collectedAt,
      kind: "phone",
      classification: "GENERIC_BUSINESS",
      confidence: params.isContactPage ? 70 : 50,
      method,
    });
  }
  return out;
}

/** Domínio de um email válido (minúsculas) ou "". */
export function emailDomainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// 3. Validação
// ---------------------------------------------------------------------------

const EMAIL_SYNTAX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "trashmail.com",
]);

/** Valida a sintaxe de um email. */
export function isValidEmailSyntax(email: string): boolean {
  if (!EMAIL_SYNTAX.test(email)) return false;
  if (email.includes("..")) return false;
  const domain = emailDomainOf(email);
  if (!domain.includes(".")) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return false;
  return true;
}

/**
 * O email pertence (ou está alinhado com) o domínio do website? Quando `domain`
 * é nulo, apenas valida a sintaxe.
 */
export function emailMatchesDomain(email: string, domain: string | null | undefined): boolean {
  if (!isValidEmailSyntax(email)) return false;
  if (!domain) return true;
  return emailDomainOf(email) === normalizeHost(domain);
}

/**
 * Normaliza um telefone português para o formato internacional canónico
 * (`+351NNNNNNNNN`) ou devolve `null` se não for reconhecível.
 */
export function normalizePhone(value: string): string | null {
  let digits = value.replace(/[^\d+]/g, "");
  digits = digits.replace(/^00/, "+");
  if (digits.startsWith("+351")) digits = digits.slice(4);
  else if (digits.startsWith("351") && digits.length > 9) digits = digits.slice(3);
  digits = digits.replace(/\D/g, "");
  if (digits.length !== 9) return null;
  if (!/^(2|3|9)\d{8}$/.test(digits)) return null; // fixo/móvel/nómada PT
  return `+351${digits}`;
}

/**
 * Resultado da verificação DNS/MX. Nesta fase NÃO se implementa SMTP probing
 * agressivo — apenas se verifica (se possível) a existência de registos MX do
 * domínio. O transporte real corre no edge function ou num backend autorizado.
 */
export type MxValidation = {
  domain: string;
  hasMx: boolean | null; // null = indeterminado (não verificado)
  reason: string;
};

/** Domínios obviamente não-empresariais (freemail) para sinalizar risco. */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "outlook.pt",
  "yahoo.com",
  "yahoo.es",
  "live.com",
  "icloud.com",
  "sapo.pt",
  "protonmail.com",
  "proton.me",
]);

export function isFreemail(domain: string): boolean {
  return FREEMAIL_DOMAINS.has(normalizeHost(domain));
}

// ---------------------------------------------------------------------------
// 4. Orquestração de crawling (validação de input / mapeamento de páginas)
// ---------------------------------------------------------------------------

/** Caminhos preferenciais para contacto empresarial, por ordem de prioridade. */
export const PREFERRED_CONTACT_PATHS = [
  "/contactos",
  "/contactos/",
  "/contact",
  "/contacts",
  "/sobre",
  "/about",
  "/empresa",
  "/quem-somos",
] as const;

/**
 * Extrai links internos relevantes (contacto/sobre/empresa) de uma homepage.
 * Resolve relativos, mantém-se no mesmo domínio e ignora âncoras/ficheiros.
 * Devolve no máximo `limit` URLs, sem duplicados.
 */
export function extractRelevantLinks(
  html: string,
  baseUrl: string,
  domain: string,
  limit: number = ENRICHMENT_LIMITS.maxPagesPerSite,
): string[] {
  const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((match) => match[1]);
  const expected = normalizeHost(domain);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const href of hrefs) {
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    const check = assertSafeUrl(resolved.toString(), expected);
    if (!check.ok) continue;
    const path = check.url.pathname.toLowerCase();
    if (!PREFERRED_CONTACT_PATHS.some((preferred) => path.startsWith(preferred))) continue;
    // Ignora âncoras na mesma página e ficheiros.
    if (/\.[a-z0-9]{2,4}$/i.test(path)) continue;
    const normalized = `${check.url.origin}${path.replace(/\/$/, "")}`;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

/** Constrói a lista de URLs a visitar (homepage + páginas de contacto). */
export function buildCrawlPlan(website: string, html: string): string[] {
  const check = assertSafeUrl(website);
  if (!check.ok) return [];
  const domain = normalizeHost(check.url.hostname);
  const home = check.url.toString();
  const links = extractRelevantLinks(html, home, domain, ENRICHMENT_LIMITS.maxPagesPerSite - 1);
  return [home, ...links].slice(0, ENRICHMENT_LIMITS.maxPagesPerSite);
}

/** Verifica se o robots.txt proíbe totalmente o crawling (`Disallow: /`). */
export function robotsDisallowsAll(robotsTxt: string, userAgentPath: string): boolean {
  if (!robotsTxt) return false;
  // Procura um bloco relevante (User-agent: * ou que contenha o nosso agente)
  // com `Disallow: /` sem exceções específicas.
  const lines = robotsTxt.split(/\r?\n/).map((line) => line.trim());
  let applies = false;
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*" || userAgentPath.toLowerCase().includes(value.toLowerCase());
    } else if (key === "disallow" && applies && value === "/") {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 5. I/O — Supabase (RPCs / edge function)
// ---------------------------------------------------------------------------

/** Alvo do enriquecimento. */
export type EnrichmentTarget = {
  /** ID do prospecto (prospect_companies.id), quando aplicável. */
  prospectId?: string | null;
  /** ID da empresa do Radar (companies.id), quando aplicável. */
  companyId?: string | null;
  name: string;
  nif?: string | null;
  localidade?: string | null;
  knownWebsite?: string | null;
};

/** Estado de uma execução de enriquecimento. */
export type EnrichmentRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "SKIPPED";

/** Execução de enriquecimento registada (auditoria). */
export type EnrichmentRun = {
  id: string;
  target_name: string;
  prospect_id: string | null;
  company_id: string | null;
  website: string | null;
  domain: string | null;
  website_confidence: number | null;
  website_method: string | null;
  status: EnrichmentRunStatus;
  pages_crawled: number;
  contacts_found: number;
  emails_found: number;
  phones_found: number;
  skipped_reason: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
};

/** Contacto empresarial recolhido e persistido. */
export type EnrichmentContact = {
  id: string;
  run_id: string;
  prospect_id: string | null;
  company_id: string | null;
  contacto: string;
  normalizado: string;
  source_url: string;
  domain: string;
  contact_type: ContactKind;
  classification: ContactClassification;
  confidence: number;
  method: string;
  collected_at: string;
  note: string | null;
  is_opt_out: boolean;
};

/** Resultado devolvido pelo edge function `enrich-company`. */
export type EnrichmentResult = {
  run_id: string;
  status: EnrichmentRunStatus;
  website: string | null;
  domain: string | null;
  website_confidence: number | null;
  website_method: string | null;
  pages_crawled: number;
  contacts: ExtractedContact[];
  skipped_reason: string | null;
  candidates: WebsiteCandidate[];
  error?: string;
};

/**
 * Executa o enriquecimento de uma empresa através do edge function
 * `enrich-company`. O crawling real acontece no servidor, que aplica as mesmas
 * proteções (SSRF, robots, rate limit, timeouts).
 *
 * Idempotente: o backend ignora crawling recente sem necessidade e não
 * processa prospects com opt-out quando o objetivo é marketing.
 */
export async function enrichCompany(
  target: EnrichmentTarget,
  options: { force?: boolean } = {},
): Promise<EnrichmentResult> {
  const { data, error } = await supabase.functions.invoke("enrich-company", {
    body: {
      prospect_id: target.prospectId ?? null,
      company_id: target.companyId ?? null,
      name: target.name,
      nif: target.nif ?? null,
      localidade: target.localidade ?? null,
      known_website: target.knownWebsite ?? null,
      force: options.force ?? false,
    },
  });
  if (error) throw error;
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as EnrichmentResult;
}

/** Lista as últimas execuções de enriquecimento da organização. */
export async function listEnrichmentRuns(limit = 20): Promise<EnrichmentRun[]> {
  const { data, error } = await supabase.rpc("enrichment_runs_list", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as EnrichmentRun[];
}

/** Lista contactos empresariais recolhidos (opcionalmente por prospecto). */
export async function listEnrichmentContacts(params: {
  prospectId?: string | null;
  companyId?: string | null;
  limit?: number;
} = {}): Promise<EnrichmentContact[]> {
  const { data, error } = await supabase.rpc("enrichment_contacts_list", {
    p_prospect_id: params.prospectId ?? null,
    p_company_id: params.companyId ?? null,
    p_limit: params.limit ?? 50,
  });
  if (error) throw error;
  return (data ?? []) as EnrichmentContact[];
}

/**
 * Descobre websites sem crawling (apenas a lista de candidatos) — usado na UI
 * para revisão humana antes de avançar. Não persiste nada.
 */
export async function previewWebsiteCandidates(
  input: WebsiteDiscoveryInput,
): Promise<WebsiteCandidate[]> {
  return discoverWebsites(input);
}

export const contactClassificationLabel: Record<ContactClassification, string> = {
  GENERIC_BUSINESS: "Email institucional",
  NAMED_PERSON: "Pessoa identificada (dado pessoal)",
  UNKNOWN: "Indeterminado",
};

export const websiteMethodLabel: Record<WebsiteDiscoveryMethod, string> = {
  known_website: "Website já conhecido",
  domain_guess: "Conjetura de domínio",
  open_data: "Dados abertos",
};

export const enrichmentStatusLabel: Record<EnrichmentRunStatus, string> = {
  PENDING: "Pendente",
  RUNNING: "Em curso",
  COMPLETED: "Concluído",
  PARTIAL: "Parcial",
  FAILED: "Falhou",
  SKIPPED: "Ignorado",
};
