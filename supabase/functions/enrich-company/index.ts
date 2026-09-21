// Adjudata — Prospeção B2B: enriquecimento de empresas (FASE 4). Edge function.
//
// Descobre o website oficial de uma empresa e recolhe os contactos empresariais
// que a própria empresa publica, com proveniência auditável completa.
//
// Proteções de rede (espelham `src/lib/enrichmentSecurity.ts`):
//   * SSRF: bloqueia localhost, IPs privados, metadata endpoints, protocolos
//     que não sejam HTTP/HTTPS, credenciais em URL e redirects perigosos.
//   * Respeita robots.txt (não ignora `Disallow: /`).
//   * Rate limiting (intervalo mínimo entre pedidos ao mesmo host).
//   * Timeouts e limite de bytes por resposta.
//   * User-agent identificável.
//   * Profundidade e número de páginas limitados; não segue links externos.
//
// NÃO faz envio de emails, campanhas nem automação em larga escala (fora do
// âmbito desta fase).
//
// Importa Supabase via esm.sh (convenção do repositório).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USER_AGENT = "Adjudata-CompanyEnrichment/1.0 (+https://adjudata.pt)";
const MAX_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_PAGES = 6;
const MAX_REDIRECTS = 3;
const MIN_DELAY_MS = 400;
const CONFIDENCE_THRESHOLD = 70;

const ALLOWED_PROTOCOLS = ["http:", "https:"];
const PREFERRED_PATHS = ["/contactos", "/contact", "/contacts", "/sobre", "/about", "/empresa", "/quem-somos"];

const NON_OFFICIAL_DOMAINS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "tiktok.com", "pinterest.com", "wikipedia.org", "google.com",
  "google.pt", "bing.com", "bit.ly", "goo.gl", "t.co", "amazon.com", "amazon.es",
  "yelp.com", "glassdoor.com", "racius.com", "einforma.com", "informa.com", "dnb.com",
];

// --- SSRF helpers (espelho da lógica pura do back-office) ------------------

function isIPv4(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateIPv4(host: string) {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return true;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(host: string) {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80")) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateHostname(normalized.slice(7));
  return false;
}

function isPrivateHostname(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (["localhost", "localhost.localdomain", "metadata.google.internal", "metadata", "169.254.169.254", "fd00:ec2::254", "0.0.0.0", "::1"].includes(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return true;
  if (host.startsWith("[") || host.includes(":")) return isPrivateIPv6(host);
  if (isIPv4(host)) return isPrivateIPv4(host);
  return false;
}

function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

type SafeUrlResult = { ok: true; url: URL } | { ok: false; reason: string };

function assertSafeUrl(value: string, expectedHost?: string | null): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) return { ok: false, reason: "unsupported_protocol" };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  if (isPrivateHostname(url.hostname)) return { ok: false, reason: "private_host" };
  if (expectedHost) {
    const target = normalizeHost(url.hostname);
    const expected = normalizeHost(expectedHost);
    if (target !== expected && !target.endsWith(`.${expected}`)) return { ok: false, reason: "cross_domain" };
  }
  return { ok: true, url };
}

function isNonOfficialDomain(hostname: string) {
  const host = normalizeHost(hostname);
  return NON_OFFICIAL_DOMAINS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

// --- Descoberta de website (providers espelhados) --------------------------

function companyNameTokens(name: string) {
  const STOPWORDS = new Set(["lda", "sa", "s.a", "unipessoal", "limitada", "sociedade", "e", "the", "of", "and", "grupo", "group"]);
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function websiteFromDomain(domain: string) {
  return `https://${normalizeHost(domain)}`;
}

function scoreCandidate(domain: string, name: string, method: string) {
  const host = normalizeHost(domain);
  const tokens = companyNameTokens(name);
  const hostBase = host.split(".")[0];
  const tokenMatch = tokens.some((t) => hostBase.includes(t) || t.includes(hostBase));
  let score = method === "known_website" ? 85 : method === "open_data" ? 60 : 25;
  if (tokenMatch) score += 10;
  if (tokens.length <= 1 && tokens[0] && tokens[0].length < 5) score -= 10;
  if (host.endsWith(".pt")) score += 3;
  return Math.max(0, Math.min(100, score));
}

type WebsiteCandidate = { url: string; domain: string; confidence: number; method: string; reason: string };

function toCandidate(url: string | null | undefined, name: string, method: string): WebsiteCandidate | null {
  if (!url) return null;
  const check = assertSafeUrl(url);
  if (!check.ok) return null;
  const domain = normalizeHost(check.url.hostname);
  if (isNonOfficialDomain(domain)) return null;
  const confidence = scoreCandidate(domain, name, method);
  return {
    url: websiteFromDomain(domain),
    domain,
    confidence,
    method,
    reason: confidence >= 70 ? `Website com confiança elevada (${domain})` : `Website provável (${domain}) a confirmar`,
  };
}

function discoverCandidates(input: { name: string; knownWebsite?: string | null }): WebsiteCandidate[] {
  const out: WebsiteCandidate[] = [];
  const known = toCandidate(input.knownWebsite, input.name, "known_website");
  if (known) out.push(known);
  const tokens = companyNameTokens(input.name);
  if (tokens.length) {
    const base = tokens.join("");
    for (const tld of ["pt", "com"]) {
      const guess = toCandidate(websiteFromDomain(`${base}.${tld}`), input.name, "domain_guess");
      if (guess) out.push(guess);
    }
  }
  const byDomain = new Map<string, WebsiteCandidate>();
  for (const candidate of out) {
    const existing = byDomain.get(candidate.domain);
    if (!existing || candidate.confidence > existing.confidence) byDomain.set(candidate.domain, candidate);
  }
  return [...byDomain.values()].sort((a, b) => b.confidence - a.confidence);
}

function selectConfidentWebsite(candidates: WebsiteCandidate[]): WebsiteCandidate | null {
  const eligible = candidates.filter((c) => c.confidence >= CONFIDENCE_THRESHOLD);
  if (!eligible.length) return null;
  if (eligible[1] && eligible[0].confidence - eligible[1].confidence < 10) return null;
  return eligible[0];
}

// --- Extração (espelho) ----------------------------------------------------

const GENERIC_PREFIXES = ["geral", "info", "comercial", "contacto", "contato", "vendas", "sales", "office", "administracao", "admin"];

function classifyContact(email: string): "GENERIC_BUSINESS" | "NAMED_PERSON" | "UNKNOWN" {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "UNKNOWN";
  const local = email.slice(0, at).toLowerCase();
  if (!local) return "UNKNOWN";
  const base = local.split(/[._-]/)[0];
  if (GENERIC_PREFIXES.includes(base)) return "GENERIC_BUSINESS";
  if (/^[a-zà-ú]+[._-][a-zà-ú]+$/.test(local)) return "NAMED_PERSON";
  if (/^[a-zà-ú]{2,3}$/.test(local)) return "UNKNOWN";
  return "NAMED_PERSON";
}

const EMAIL_SYNTAX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "tempmail.com", "10minutemail.com", "yopmail.com", "trashmail.com"]);

function isValidEmail(email: string) {
  if (!EMAIL_SYNTAX.test(email) || email.includes("..")) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  if (!domain.includes(".") || DISPOSABLE.has(domain)) return false;
  return true;
}

function normalizePhone(value: string): string | null {
  let digits = value.replace(/[^\d+]/g, "").replace(/^00/, "+");
  if (digits.startsWith("+351")) digits = digits.slice(4);
  else if (digits.startsWith("351") && digits.length > 9) digits = digits.slice(3);
  digits = digits.replace(/\D/g, "");
  if (digits.length !== 9 || !/^(2|3|9)\d{8}$/.test(digits)) return null;
  return `+351${digits}`;
}

type Contact = {
  contacto: string;
  normalizado: string;
  sourceUrl: string;
  domain: string;
  collectedAt: string;
  kind: "email" | "phone";
  classification: "GENERIC_BUSINESS" | "NAMED_PERSON" | "UNKNOWN";
  confidence: number;
  method: string;
  note?: string;
};

function extractContacts(html: string, sourceUrl: string, domain: string, isContactPage: boolean): Contact[] {
  const collectedAt = new Date().toISOString();
  const method = "official_website_crawl";
  const out: Contact[] = [];

  const emails = html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  for (const raw of new Set(emails.map((e) => e.toLowerCase()))) {
    if (!isValidEmail(raw)) continue;
    if (raw.slice(raw.lastIndexOf("@") + 1) !== domain) continue; // apenas o domínio do site
    const classification = classifyContact(raw);
    const base = isContactPage ? 80 : 60;
    const penalty = classification === "GENERIC_BUSINESS" ? 0 : classification === "NAMED_PERSON" ? 25 : 15;
    out.push({
      contacto: raw,
      normalizado: raw,
      sourceUrl,
      domain,
      collectedAt,
      kind: "email",
      classification,
      confidence: Math.max(0, Math.min(100, base - penalty)),
      method,
      note: classification === "NAMED_PERSON" ? "Email nominativo — potencial dado pessoal" : undefined,
    });
  }

  const phones = html.match(/(?:\+351[\s.-]?)?(?:2\d{2}|9\d{2})[\s.-]?\d{3}[\s.-]?\d{3}/g) ?? [];
  for (const raw of phones) {
    const normalized = normalizePhone(raw);
    if (!normalized) continue;
    out.push({
      contacto: raw.trim(),
      normalizado: normalized,
      sourceUrl,
      domain,
      collectedAt,
      kind: "phone",
      classification: "GENERIC_BUSINESS",
      confidence: isContactPage ? 70 : 50,
      method,
    });
  }
  return out;
}

function relevantLinks(html: string, baseUrl: string, domain: string): string[] {
  const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
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
    const check = assertSafeUrl(resolved.toString(), domain);
    if (!check.ok) continue;
    const path = check.url.pathname.toLowerCase();
    if (!PREFERRED_PATHS.some((p) => path.startsWith(p))) continue;
    if (/\.[a-z0-9]{2,4}$/i.test(path)) continue;
    const normalized = `${check.url.origin}${path.replace(/\/$/, "")}`;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= MAX_PAGES - 1) break;
  }
  return out;
}

// --- Fetch seguro com redirects controlados e timeouts ---------------------

async function safeFetch(url: URL, expectedHost: string, redirectsLeft = MAX_REDIRECTS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html, text/plain;q=0.8" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectsLeft <= 0) return null;
      const redirect = assertSafeUrl(new URL(location, url).toString(), expectedHost);
      if (!redirect.ok) return null;
      return await safeFetch(redirect.url, expectedHost, redirectsLeft - 1);
    }
    if (!response.ok) return null;
    if (!(response.headers.get("content-type") || "").includes("text/html")) return null;
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_BYTES) return null;
    const text = await response.text();
    return text.slice(0, MAX_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRobots(origin: URL, expectedHost: string): Promise<string> {
  const robotsUrl = new URL("/robots.txt", origin);
  const check = assertSafeUrl(robotsUrl.toString(), expectedHost);
  if (!check.ok) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(robotsUrl, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    if (!response.ok) return "";
    return (await response.text()).slice(0, 100_000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function robotsDisallowsAll(robotsTxt: string): boolean {
  if (!robotsTxt) return false;
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.trim());
  let applies = false;
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") applies = value === "*" || USER_AGENT.toLowerCase().includes(value.toLowerCase());
    else if (key === "disallow" && applies && value === "/") return true;
  }
  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Handler ---------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let runId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Missing authorization");

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new Error("Nome da empresa obrigatório");

    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Invalid session");

    // 1. Inicia a execução (idempotente: opt-out e crawling recente → SKIPPED).
    const { data: runRow, error: startError } = await supabase.rpc("enrichment_run_start", {
      p_prospect_id: body.prospect_id ?? null,
      p_company_id: body.company_id ?? null,
      p_target_name: name,
      p_force: body.force ?? false,
    });
    if (startError) throw startError;
    const run = runRow as { id: string; status: string; skipped_reason: string | null };
    runId = run.id;

    if (run.status === "SKIPPED") {
      return Response.json(
        { run_id: run.id, status: "SKIPPED", website: null, domain: null, website_confidence: null, website_method: null, pages_crawled: 0, contacts: [], skipped_reason: run.skipped_reason, candidates: [] },
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Descobre candidatos de website (nunca escolhe arbitrariamente).
    const candidates = discoverCandidates({ name, knownWebsite: body.known_website ?? null });
    const chosen = selectConfidentWebsite(candidates);

    if (!chosen) {
      const { data: finished } = await supabase.rpc("enrichment_run_finish", {
        p_run_id: run.id,
        p_status: "PARTIAL",
        p_pages_crawled: 0,
        p_contacts: [],
      });
      return Response.json(
        {
          run_id: run.id,
          status: "PARTIAL",
          website: (finished as { website?: string | null })?.website ?? null,
          domain: null,
          website_confidence: null,
          website_method: null,
          pages_crawled: 0,
          contacts: [],
          skipped_reason: "Sem website com confiança suficiente — requer revisão humana",
          candidates,
        },
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Crawling respeitador (robots, rate limit, timeout, poucas páginas).
    const home = assertSafeUrl(chosen.url);
    if (!home.ok) throw new Error("Website inválido");
    const expectedHost = home.url.hostname;

    const robots = await fetchRobots(home.url, expectedHost);
    if (robotsDisallowsAll(robots)) {
      await supabase.rpc("enrichment_run_finish", {
        p_run_id: run.id,
        p_status: "SKIPPED",
        p_website: chosen.url,
        p_domain: chosen.domain,
        p_website_confidence: chosen.confidence,
        p_website_method: chosen.method,
        p_contacts: [],
        p_error: null,
      });
      return Response.json(
        {
          run_id: run.id,
          status: "SKIPPED",
          website: chosen.url,
          domain: chosen.domain,
          website_confidence: chosen.confidence,
          website_method: chosen.method,
          pages_crawled: 0,
          contacts: [],
          skipped_reason: "robots.txt proíbe crawling",
          candidates,
        },
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const homeHtml = await safeFetch(home.url, expectedHost);
    if (homeHtml === null) {
      await supabase.rpc("enrichment_run_finish", {
        p_run_id: run.id,
        p_status: "FAILED",
        p_website: chosen.url,
        p_domain: chosen.domain,
        p_website_confidence: chosen.confidence,
        p_website_method: chosen.method,
        p_error: "Homepage indisponível",
      });
      throw new Error("Homepage indisponível");
    }

    const plan = [home.url.toString(), ...relevantLinks(homeHtml, home.url.toString(), chosen.domain)].slice(0, MAX_PAGES);

    const contacts: Contact[] = [];
    let pagesCrawled = 0;
    for (const pageUrl of plan) {
      const isHome = pageUrl === home.url.toString();
      const html = isHome ? homeHtml : await safeFetch(new URL(pageUrl), expectedHost);
      if (html === null) continue;
      pagesCrawled += 1;
      contacts.push(...extractContacts(html, pageUrl, chosen.domain, !isHome));
      // Rate limiting entre pedidos ao mesmo host.
      if (pageUrl !== plan[plan.length - 1]) await sleep(MIN_DELAY_MS);
    }

    // Deduplica contactos (contacto + tipo).
    const unique = [...new Map(contacts.map((c) => [`${c.kind}:${c.normalizado}`, c])).values()];

    // 4. Persiste resultado + contactos (idempotente, deduplica no backend).
    const { data: finished, error: finishError } = await supabase.rpc("enrichment_run_finish", {
      p_run_id: run.id,
      p_status: unique.length ? "COMPLETED" : "PARTIAL",
      p_website: chosen.url,
      p_domain: chosen.domain,
      p_website_confidence: chosen.confidence,
      p_website_method: chosen.method,
      p_pages_crawled: pagesCrawled,
      p_contacts: unique,
    });
    if (finishError) throw finishError;

    return Response.json(
      {
        run_id: run.id,
        status: (finished as { status?: string })?.status ?? "COMPLETED",
        website: chosen.url,
        domain: chosen.domain,
        website_confidence: chosen.confidence,
        website_method: chosen.method,
        pages_crawled: pagesCrawled,
        contacts: unique,
        skipped_reason: null,
        candidates,
      },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    // Regista falha na execução, quando já existe.
    if (runId && supabase) {
      try {
        await supabase.rpc("enrichment_run_finish", {
          p_run_id: runId,
          p_status: "FAILED",
          p_error: error instanceof Error ? error.message : "Enriquecimento falhou",
        });
      } catch {
        // Ignora falha ao registar a falha.
      }
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Enriquecimento falhou" },
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
