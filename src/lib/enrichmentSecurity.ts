/**
 * Prospeção B2B — Enriquecimento (FASE 4). Segurança de rede (lógica pura).
 *
 * Este módulo concentra as proteções contra SSRF e os limites de rede usados
 * tanto pelo back-office (validação antes de chamar o backend) como pelo
 * edge function (`enrich-company`), que espelha estas regras porque corre em
 * Deno e não pode importar de `src/`.
 *
 * Não faz I/O nenhum. É determinístico e testável isoladamente.
 *
 * Princípios (AGENTS.md):
 *   * Nunca contornar bloqueios, CAPTCHA, autenticação, robots.txt, rate limits
 *     ou termos de utilização.
 *   * Nunca expor secrets nem confiar em input do utilizador para decidir a que
 *     host se liga o servidor.
 */

/** Protocolos permitidos para qualquer pedido de rede do enriquecimento. */
export const ALLOWED_PROTOCOLS = ["http:", "https:"] as const;
export type AllowedProtocol = (typeof ALLOWED_PROTOCOLS)[number];

/** Limites de rede (defensivos, conservadores). */
export const ENRICHMENT_LIMITS = {
  /** Bytes máximos lidos de uma resposta HTML. */
  maxResponseBytes: 1_000_000,
  /** Timeout por pedido (ms). */
  requestTimeoutMs: 7_000,
  /** Máximo de páginas visitadas por website (homepage + relevantes). */
  maxPagesPerSite: 6,
  /** Profundidade máxima de crawling (a partir da homepage). */
  maxDepth: 1,
  /** Máximo de redirecionamentos seguidos. */
  maxRedirects: 3,
  /** Intervalo mínimo entre pedidos ao mesmo host (ms) — rate limiting. */
  minDelayBetweenRequestsMs: 400,
} as const;

/** User-agent identificável e responsável do serviço. */
export const ENRICHMENT_USER_AGENT = "Adjudata-CompanyEnrichment/1.0 (+https://adjudata.pt)";

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "169.254.169.254", // metadata endpoint (link-local AWS/GCP/Azure)
  "fd00:ec2::254",
  "0.0.0.0",
  "::1",
]);

function isIPv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateIPv4(host: string): boolean {
  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    // Formato inválido: tratar como inseguro por precaução.
    return true;
  }
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 privado
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast/reservado
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80")) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // unique local
  if (normalized.startsWith("::ffff:")) return isPrivateHostname(normalized.slice("::ffff:".length));
  return false;
}

/**
 * Determina se um hostname aponta para a própria máquina, para rede privada,
 * para um endpoint de metadata ou para um domínio interno. Devolve `true` para
 * tudo o que não deve ser contactado (fail-closed).
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (PRIVATE_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return true;
  if (host.startsWith("[") || host.includes(":")) return isPrivateIPv6(host);
  if (isIPv4(host)) return isPrivateIPv4(host);
  return false;
}

/** Normaliza um domínio/host para comparação (minúsculas, sem `www.`). */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

/** Resultado de uma validação de URL para pedidos do servidor. */
export type SafeUrlResult = { ok: true; url: URL } | { ok: false; reason: SafeUrlReason };

export type SafeUrlReason =
  | "invalid_url"
  | "unsupported_protocol"
  | "credentials_in_url"
  | "private_host"
  | "cross_domain";

/**
 * Valida uma URL para pedido server-side. Quando `expectedHost` é fornecido,
 * exige que o host corresponda (mesmo domínio ou subdomínio do esperado),
 * impedindo desvios para domínios arbitrários.
 */
export function assertSafeUrl(value: string, expectedHost?: string | null): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (!(ALLOWED_PROTOCOLS as readonly string[]).includes(url.protocol)) {
    return { ok: false, reason: "unsupported_protocol" };
  }
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  if (isPrivateHostname(url.hostname)) return { ok: false, reason: "private_host" };
  if (expectedHost) {
    const target = normalizeHost(url.hostname);
    const expected = normalizeHost(expectedHost);
    if (target !== expected && !target.endsWith(`.${expected}`)) {
      return { ok: false, reason: "cross_domain" };
    }
  }
  return { ok: true, url };
}

/**
 * Valida um redirecionamento: tem de permanecer no protocolo permitido, no
 * mesmo domínio e nunca apontar para host privado. `Location` relativo é
 * resolvido contra a URL base.
 */
export function assertSafeRedirect(location: string, baseUrl: string, expectedHost: string): SafeUrlResult {
  let resolved: URL;
  try {
    resolved = new URL(location, baseUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  return assertSafeUrl(resolved.toString(), expectedHost);
}

/**
 * Domínios que nunca são o website oficial da empresa (redes sociais,
 * agregadores, motores de busca, encurtadores). Não são candidatos a website.
 */
const NON_OFFICIAL_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "wikipedia.org",
  "google.com",
  "google.pt",
  "bing.com",
  "bit.ly",
  "goo.gl",
  "t.co",
  "amazon.com",
  "amazon.es",
  "yelp.com",
  "glassdoor.com",
  "racius.com",
  "einforma.com",
  "informa.com",
  "dnb.com",
];

export function isNonOfficialDomain(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return NON_OFFICIAL_DOMAINS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}
