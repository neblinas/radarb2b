import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import { supabase } from "@/lib/supabase";
import {
  assertSafeRedirect,
  assertSafeUrl,
  isNonOfficialDomain,
  isPrivateHostname,
  normalizeHost,
} from "./enrichmentSecurity";
import {
  buildCrawlPlan,
  classifyContact,
  companyNameTokens,
  discoverWebsites,
  domainGuessProvider,
  emailMatchesDomain,
  enrichCompany,
  extractEmails,
  extractPhones,
  extractRelevantLinks,
  genericBusinessPriority,
  isFreemail,
  isValidEmailSyntax,
  knownWebsiteProvider,
  normalizePhone,
  previewWebsiteCandidates,
  robotsDisallowsAll,
  scoreWebsiteCandidate,
  selectConfidentWebsite,
  toWebsiteCandidate,
  WEBSITE_CONFIDENCE_THRESHOLD,
  websiteFromDomain,
} from "./companyEnrichment";

// ---------------------------------------------------------------------------
// Segurança / SSRF
// ---------------------------------------------------------------------------

describe("enrichmentSecurity — proteção SSRF", () => {
  it("bloqueia localhost e variantes", () => {
    expect(isPrivateHostname("localhost")).toBe(true);
    expect(isPrivateHostname("localhost.localdomain")).toBe(true);
    expect(isPrivateHostname("algo.local")).toBe(true);
    expect(isPrivateHostname("servico.internal")).toBe(true);
  });

  it("bloqueia IPs privados, loopback e link-local", () => {
    expect(isPrivateHostname("127.0.0.1")).toBe(true);
    expect(isPrivateHostname("10.0.0.5")).toBe(true);
    expect(isPrivateHostname("192.168.1.1")).toBe(true);
    expect(isPrivateHostname("172.16.0.1")).toBe(true);
    expect(isPrivateHostname("172.31.255.255")).toBe(true);
    expect(isPrivateHostname("169.254.169.254")).toBe(true);
    expect(isPrivateHostname("100.64.0.1")).toBe(true);
    expect(isPrivateHostname("0.0.0.0")).toBe(true);
  });

  it("permite IPs públicos", () => {
    expect(isPrivateHostname("8.8.8.8")).toBe(false);
    expect(isPrivateHostname("172.32.0.1")).toBe(false);
    expect(isPrivateHostname("empresa.pt")).toBe(false);
  });

  it("bloqueia IPv6 loopback e privado", () => {
    expect(isPrivateHostname("::1")).toBe(true);
    expect(isPrivateHostname("fe80::1")).toBe(true);
    expect(isPrivateHostname("fd00::1")).toBe(true);
    expect(isPrivateHostname("::ffff:10.0.0.1")).toBe(true);
  });

  it("assertSafeUrl rejeita protocolos não HTTP/HTTPS", () => {
    expect(assertSafeUrl("ftp://empresa.pt")).toEqual({ ok: false, reason: "unsupported_protocol" });
    expect(assertSafeUrl("file:///etc/passwd")).toEqual({ ok: false, reason: "unsupported_protocol" });
    expect(assertSafeUrl("gopher://empresa.pt")).toEqual({ ok: false, reason: "unsupported_protocol" });
  });

  it("assertSafeUrl rejeita credenciais e hosts privados", () => {
    expect(assertSafeUrl("https://user:pass@empresa.pt").ok).toBe(false);
    expect(assertSafeUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(assertSafeUrl("https://empresa.pt/contactos").ok).toBe(true);
  });

  it("assertSafeUrl respeita expectedHost (mesmo domínio/subdomínio)", () => {
    expect(assertSafeUrl("https://empresa.pt/c", "empresa.pt").ok).toBe(true);
    expect(assertSafeUrl("https://www.empresa.pt/c", "empresa.pt").ok).toBe(true);
    expect(assertSafeUrl("https://outro.pt/c", "empresa.pt")).toEqual({ ok: false, reason: "cross_domain" });
    expect(assertSafeUrl("https://evil.com", "empresa.pt")).toEqual({ ok: false, reason: "cross_domain" });
  });

  it("assertSafeRedirect resolve relativos e bloqueia desvios", () => {
    expect(assertSafeRedirect("/contactos", "https://empresa.pt/", "empresa.pt").ok).toBe(true);
    expect(assertSafeRedirect("https://empresa.pt/x", "https://empresa.pt/", "empresa.pt").ok).toBe(true);
    expect(assertSafeRedirect("http://10.0.0.1/x", "https://empresa.pt/", "empresa.pt").ok).toBe(false);
    expect(assertSafeRedirect("https://evil.com/x", "https://empresa.pt/", "empresa.pt").ok).toBe(false);
    expect(assertSafeRedirect("javascript:alert(1)", "https://empresa.pt/", "empresa.pt").ok).toBe(false);
  });

  it("identifica domínios não oficiais", () => {
    expect(isNonOfficialDomain("facebook.com")).toBe(true);
    expect(isNonOfficialDomain("www.linkedin.com")).toBe(true);
    expect(isNonOfficialDomain("racius.com")).toBe(true);
    expect(isNonOfficialDomain("empresa.pt")).toBe(false);
  });

  it("normaliza host removendo www e maiúsculas", () => {
    expect(normalizeHost("WWW.Empresa.PT")).toBe("empresa.pt");
  });
});

// ---------------------------------------------------------------------------
// Descoberta de website
// ---------------------------------------------------------------------------

describe("companyEnrichment — descoberta de website", () => {
  it("extrai tokens significativos do nome", () => {
    expect(companyNameTokens("Wavecom - Soluções de Redes, Lda.")).toEqual(
      expect.arrayContaining(["wavecom", "solucoes", "redes"]),
    );
    expect(companyNameTokens("Lda")).toEqual([]);
  });

  it("constrói URL a partir do domínio (https, sem www)", () => {
    expect(websiteFromDomain("www.empresa.pt")).toBe("https://empresa.pt");
  });

  it("provider de website conhecido devolve candidato com confiança alta", async () => {
    const candidates = await knownWebsiteProvider.discover({
      name: "Empresa XPTO",
      knownWebsite: "https://www.empresaxpto.pt/contactos",
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].domain).toBe("empresaxpto.pt");
    expect(candidates[0].method).toBe("known_website");
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(80);
  });

  it("provider rejeita redes sociais e hosts privados", async () => {
    expect(await knownWebsiteProvider.discover({ name: "X", knownWebsite: "https://facebook.com/x" })).toEqual([]);
    expect(await knownWebsiteProvider.discover({ name: "X", knownWebsite: "http://10.0.0.1" })).toEqual([]);
  });

  it("conjetura de domínio tem confiança baixa", async () => {
    const candidates = await domainGuessProvider.discover({ name: "Wavecom", nif: "501234567" });
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.confidence).toBeLessThan(WEBSITE_CONFIDENCE_THRESHOLD);
      expect(candidate.method).toBe("domain_guess");
    }
  });

  it("pontuação penaliza nomes curtos/genéricos (homónimos)", () => {
    const long = scoreWebsiteCandidate("wavecomsolucoes.pt", "", { name: "Wavecom Soluções" }, "domain_guess");
    const short = scoreWebsiteCandidate("ace.pt", "", { name: "Ace" }, "domain_guess");
    expect(long).toBeGreaterThan(short);
  });

  it("deduplica candidatos por domínio e ordena por confiança", async () => {
    const candidates = await discoverWebsites({
      name: "Empresa XPTO",
      knownWebsite: "https://empresaxpto.pt",
    });
    const domains = candidates.map((c) => c.domain);
    expect(new Set(domains).size).toBe(domains.length);
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i - 1].confidence).toBeGreaterThanOrEqual(candidates[i].confidence);
    }
  });

  it("não escolhe arbitrariamente entre domínios em dúvida", () => {
    // Dois candidatos com confiança próxima (diferença < 10) → indecisão.
    expect(
      selectConfidentWebsite([
        { url: "https://a.pt", domain: "a.pt", confidence: 82, method: "domain_guess", reason: "" },
        { url: "https://b.pt", domain: "b.pt", confidence: 78, method: "domain_guess", reason: "" },
      ]),
    ).toBeNull();
  });

  it("escolhe quando há um candidato claramente melhor", () => {
    const chosen = selectConfidentWebsite([
      { url: "https://a.pt", domain: "a.pt", confidence: 90, method: "known_website", reason: "" },
      { url: "https://b.pt", domain: "b.pt", confidence: 30, method: "domain_guess", reason: "" },
    ]);
    expect(chosen?.domain).toBe("a.pt");
  });

  it("não escolhe abaixo do limiar de confiança", () => {
    expect(
      selectConfidentWebsite([
        { url: "https://a.pt", domain: "a.pt", confidence: 40, method: "domain_guess", reason: "" },
      ]),
    ).toBeNull();
  });

  it("previewWebsiteCandidates não persiste nada (só devolve candidatos)", async () => {
    const candidates = await previewWebsiteCandidates({ name: "Empresa XPTO", knownWebsite: "https://empresaxpto.pt" });
    expect(candidates.length).toBeGreaterThan(0);
    expect(vi.mocked(supabase.rpc)).not.toHaveBeenCalled();
  });

  it("toWebsiteCandidate devolve null para entradas inválidas", () => {
    expect(toWebsiteCandidate(null, { name: "X" }, "known_website")).toBeNull();
    expect(toWebsiteCandidate("http://127.0.0.1", { name: "X" }, "known_website")).toBeNull();
    expect(toWebsiteCandidate("https://facebook.com/x", { name: "X" }, "known_website")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Classificação e extração
// ---------------------------------------------------------------------------

describe("companyEnrichment — classificação de emails", () => {
  it("reconhece emails institucionais genéricos", () => {
    for (const prefix of ["geral", "info", "comercial", "contacto", "contato", "vendas", "sales", "office", "administracao", "admin"]) {
      expect(classifyContact(`${prefix}@empresa.pt`)).toBe("GENERIC_BUSINESS");
    }
  });

  it("atribui prioridade aos genéricos pela ordem definida", () => {
    expect(genericBusinessPriority("geral@empresa.pt")).toBe(0);
    expect(genericBusinessPriority("info@empresa.pt")).toBe(1);
    expect(genericBusinessPriority("admin@empresa.pt")).toBeGreaterThan(genericBusinessPriority("comercial@empresa.pt"));
    expect(genericBusinessPriority("joao.silva@empresa.pt")).toBe(-1);
  });

  it("classifica emails nominais como NAMED_PERSON (dado pessoal)", () => {
    expect(classifyContact("joao.silva@empresa.pt")).toBe("NAMED_PERSON");
    expect(classifyContact("maria-santos@empresa.pt")).toBe("NAMED_PERSON");
  });

  it("classifica como desconhecido o que não é decidível", () => {
    expect(classifyContact("xyz@empresa.pt")).toBe("UNKNOWN");
    expect(classifyContact("sem-arroba")).toBe("UNKNOWN");
  });
});

describe("companyEnrichment — extração de contactos", () => {
  const params = { sourceUrl: "https://empresa.pt/contactos", domain: "empresa.pt", collectedAt: "2026-09-30T00:00:00.000Z" };

  it("extrai emails do domínio e ignora terceiros", () => {
    const html = "Contacte-nos: comercial@empresa.pt ou support@outro.pt. Também info@empresa.pt.";
    const contacts = extractEmails(html, { ...params, isContactPage: true });
    const values = contacts.map((c) => c.normalizado);
    expect(values).toContain("comercial@empresa.pt");
    expect(values).toContain("info@empresa.pt");
    expect(values).not.toContain("support@outro.pt");
  });

  it("marca emails nominais com nota de dado pessoal e menor confiança", () => {
    const contacts = extractEmails("geral@empresa.pt joao.silva@empresa.pt", { ...params, isContactPage: true });
    const generic = contacts.find((c) => c.normalizado === "geral@empresa.pt")!;
    const named = contacts.find((c) => c.normalizado === "joao.silva@empresa.pt")!;
    expect(named.classification).toBe("NAMED_PERSON");
    expect(named.note).toMatch(/dado pessoal/i);
    expect(named.confidence).toBeLessThan(generic.confidence);
  });

  it("guarda a proveniência obrigatória (contacto, sourceUrl, domain, data, tipo, confidence, método)", () => {
    const [contact] = extractEmails("info@empresa.pt", { ...params, isContactPage: true });
    expect(contact).toMatchObject({
      contacto: "info@empresa.pt",
      normalizado: "info@empresa.pt",
      sourceUrl: params.sourceUrl,
      domain: params.domain,
      collectedAt: params.collectedAt,
      kind: "email",
      method: "official_website_crawl",
    });
    expect(contact.confidence).toBeGreaterThan(0);
  });

  it("páginas de contacto dão confiança superior a páginas genéricas", () => {
    const contactPage = extractEmails("info@empresa.pt", { ...params, isContactPage: true });
    const otherPage = extractEmails("info@empresa.pt", { ...params, isContactPage: false });
    expect(contactPage[0].confidence).toBeGreaterThan(otherPage[0].confidence);
  });

  it("não duplica emails repetidos", () => {
    const contacts = extractEmails("info@empresa.pt info@empresa.pt", params);
    expect(contacts).toHaveLength(1);
  });

  it("extrai e normaliza telefones portugueses", () => {
    const contacts = extractPhones("Tel: +351 210 123 456 · Móvel: 912 345 678", params);
    const values = contacts.map((c) => c.normalizado);
    expect(values).toContain("+351210123456");
    expect(values).toContain("+351912345678");
    expect(contacts[0].kind).toBe("phone");
  });

  it("ignora telefones inválidos", () => {
    expect(extractPhones("123 456", params)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

describe("companyEnrichment — validação", () => {
  it("valida sintaxe de email", () => {
    expect(isValidEmailSyntax("geral@empresa.pt")).toBe(true);
    expect(isValidEmailSyntax("geral@empresa")).toBe(false);
    expect(isValidEmailSyntax("a..b@empresa.pt")).toBe(false);
    expect(isValidEmailSyntax("sem-arroba")).toBe(false);
    expect(isValidEmailSyntax("x@mailinator.com")).toBe(false); // descartável
  });

  it("verifica correspondência com o domínio", () => {
    expect(emailMatchesDomain("info@empresa.pt", "empresa.pt")).toBe(true);
    expect(emailMatchesDomain("info@outro.pt", "empresa.pt")).toBe(false);
    expect(emailMatchesDomain("info@empresa.pt", null)).toBe(true);
  });

  it("normaliza telefones PT", () => {
    expect(normalizePhone("210 123 456")).toBe("+351210123456");
    expect(normalizePhone("+351 210 123 456")).toBe("+351210123456");
    expect(normalizePhone("00351 912 345 678")).toBe("+351912345678");
    expect(normalizePhone("123456789")).toBeNull();
    expect(normalizePhone("+34 600 000 000")).toBeNull(); // apenas números PT são aceites
  });

  it("identifica freemail", () => {
    expect(isFreemail("gmail.com")).toBe(true);
    expect(isFreemail("empresa.pt")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Crawling — plano e robots
// ---------------------------------------------------------------------------

describe("companyEnrichment — plano de crawling", () => {
  const home = `<!doctype html><html><body>
    <a href="/contactos">Contactos</a>
    <a href="/sobre">Sobre</a>
    <a href="https://facebook.com/empresa">Facebook</a>
    <a href="https://outro.pt/contact">Externo</a>
    <a href="mailto:info@empresa.pt">Email</a>
    <a href="/contactos/">Contactos dup</a>
    <a href="/documento.pdf">PDF</a>
    </body></html>`;

  it("extrai apenas links internos relevantes", () => {
    const links = extractRelevantLinks(home, "https://empresa.pt/", "empresa.pt");
    expect(links).toContain("https://empresa.pt/contactos");
    expect(links).toContain("https://empresa.pt/sobre");
    // Externos, redes sociais e ficheiros são ignorados.
    expect(links.some((l) => l.includes("facebook.com"))).toBe(false);
    expect(links.some((l) => l.includes("outro.pt"))).toBe(false);
    expect(links.some((l) => l.endsWith(".pdf"))).toBe(false);
  });

  it("respeita o limite de páginas", () => {
    const links = extractRelevantLinks(home, "https://empresa.pt/", "empresa.pt", 1);
    expect(links).toHaveLength(1);
  });

  it("constrói plano começando pela homepage e limita profundidade", () => {
    const plan = buildCrawlPlan("https://empresa.pt/", home);
    expect(plan[0]).toBe("https://empresa.pt/");
    expect(plan.length).toBeLessThanOrEqual(6);
  });

  it("deteta robots.txt que proíbe totalmente o crawling", () => {
    expect(robotsDisallowsAll("User-agent: *\nDisallow: /", "Adjudata-CompanyEnrichment")).toBe(true);
    expect(robotsDisallowsAll("User-agent: *\nDisallow: /admin", "Adjudata-CompanyEnrichment")).toBe(false);
    expect(robotsDisallowsAll("User-agent: Googlebot\nDisallow: /", "Adjudata-CompanyEnrichment")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// I/O — edge function
// ---------------------------------------------------------------------------

describe("companyEnrichment — I/O (edge function)", () => {
  it("enrichCompany invoca a função com o alvo correto", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { run_id: "r1", status: "COMPLETED", website: "https://empresa.pt", domain: "empresa.pt", contacts: [], candidates: [], pages_crawled: 1, skipped_reason: null },
      error: null,
    } as never);

    const result = await enrichCompany({ prospectId: "p1", name: "Empresa XPTO", knownWebsite: "https://empresa.pt" });
    expect(result.status).toBe("COMPLETED");
    expect(vi.mocked(supabase.functions.invoke)).toHaveBeenCalledWith("enrich-company", {
      body: expect.objectContaining({ prospect_id: "p1", name: "Empresa XPTO", force: false }),
    });
  });

  it("enrichCompany propaga erro devolvido pela função", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: { error: "opt_out" }, error: null } as never);
    await expect(enrichCompany({ name: "X" })).rejects.toThrow("opt_out");
  });
});

/**
 * Amostra pequena: alguns domínios públicos, exercita classificação e
 * validação exatamente como o motor as aplica — sem qualquer pedido de rede.
 */
describe("companyEnrichment — amostra de domínios públicos", () => {
  const sample = [
    { email: "geral@adjudata.pt", expected: "GENERIC_BUSINESS" },
    { email: "info@empresa-publica.pt", expected: "GENERIC_BUSINESS" },
    { email: "comercial@exemplo.pt", expected: "GENERIC_BUSINESS" },
    { email: "joao.silva@exemplo.pt", expected: "NAMED_PERSON" },
    { email: "abc@exemplo.pt", expected: "UNKNOWN" },
  ] as const;

  it("classifica a amostra como esperado", () => {
    for (const item of sample) {
      expect(classifyContact(item.email)).toBe(item.expected);
    }
  });

  it("valida sintaxe e domínio na amostra", () => {
    for (const item of sample) {
      expect(isValidEmailSyntax(item.email)).toBe(true);
      expect(emailMatchesDomain(item.email, "exemplo.pt")).toBe(item.email.endsWith("@exemplo.pt"));
    }
  });
});
