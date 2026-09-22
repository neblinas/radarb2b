import { describe, expect, it, vi } from "vitest";

import {
  applyFilters,
  dedupKeyForRecord,
  defaultFilters,
  emptyKnownCompanySnapshot,
  evaluateDiscoveryBatch,
  evaluateExternalRecord,
  normalizeCae,
  normalizeCompanyName,
  normalizeExternalRecord,
  normalizeExternalWebsite,
  normalizeIsoDate,
  normalizeNif,
  normalizeSize,
  normalizeState,
  normalizeEmail,
  classifyEmail,
  inferEmailType,
  sortEvaluations,
} from "./normalize";
import type { ExternalCompanyRecord } from "./types";

function record(overrides: Partial<ExternalCompanyRecord> = {}): ExternalCompanyRecord {
  return {
    name: "Empresa Exemplo Lda",
    nif: "123456789",
    cae: "62010",
    caeSecondary: null,
    state: "active",
    incorporationDate: "2010-05-01",
    district: "Lisboa",
    municipality: "Lisboa",
    localidade: "Lisboa",
    address: null,
    size: "pequeno",
    employees: 12,
    website: "https://exemplo.pt",
    source: "file_import",
    sourceId: null,
    collectedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("companyDiscovery — normalização", () => {
  it("normaliza NIF para dígitos", () => {
    expect(normalizeNif(" 222 184 680 ")).toBe("222184680");
    expect(normalizeNif("PT222184680")).toBe("222184680");
    expect(normalizeNif("N/A")).toBeNull();
    expect(normalizeNif(null)).toBeNull();
  });

  it("normaliza nome removendo sufixos societários e acentos", () => {
    expect(normalizeCompanyName("Empresa Exemplo, Lda.")).toBe("empresa exemplo");
    expect(normalizeCompanyName("CONSTRUÇÕES S.A.")).toBe("construcoes");
    expect(normalizeCompanyName("")).toBe("");
  });

  it("normaliza CAE para dígitos", () => {
    expect(normalizeCae("62010")).toBe("62010");
    expect(normalizeCae("CAE 62010")).toBe("62010");
    expect(normalizeCae("")).toBeNull();
  });

  it("normaliza CAE secundário removendo duplicados e inválidos", () => {
    const result = normalizeExternalRecord(
      { name: "X", caeSecondary: ["62010", " 62010 ", "abc", "62020"] },
      "file_import",
      "2026-10-01T00:00:00.000Z",
    );
    expect(result?.caeSecondary).toEqual(["62010", "62020"]);
  });

  it("valida datas ISO", () => {
    expect(normalizeIsoDate("2010-05-01")).toBe("2010-05-01");
    expect(normalizeIsoDate("2010-05-01T00:00:00Z")).toBe("2010-05-01");
    expect(normalizeIsoDate("2010-13-01")).toBeNull();
    expect(normalizeIsoDate("não é data")).toBeNull();
  });

  it("normaliza dimensão e estado", () => {
    expect(normalizeSize("Microempresa")).toBe("micro");
    expect(normalizeSize("PME")).toBeNull();
    expect(normalizeSize("grande")).toBe("grande");
    expect(normalizeState("Ativa")).toBe("active");
    expect(normalizeState("Cessada")).toBe("inactive");
    expect(normalizeState("Suspensa")).toBe("suspended");
    expect(normalizeState("??")).toBe("unknown");
  });

  it("normaliza website sem inventar esquema e recusando esquemas perigosos", () => {
    expect(normalizeExternalWebsite("www.Exemplo.pt/contactos")).toBe("https://exemplo.pt");
    expect(normalizeExternalWebsite("http://empresa.com")).toBe("https://empresa.com");
    expect(normalizeExternalWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalWebsite("semdominio")).toBeNull();
  });

  it("rejeita registos sem nome", () => {
    expect(normalizeExternalRecord({ name: "   " }, "file_import", "2026-10-01T00:00:00.000Z")).toBeNull();
    expect(normalizeExternalRecord({ name: null }, "file_import", "2026-10-01T00:00:00.000Z")).toBeNull();
  });
});

describe("companyDiscovery — email de contacto (import por ficheiro)", () => {
  it("normaliza email em minúsculas e valida o formato", () => {
    expect(normalizeEmail("Geral@Roninformatis.PT")).toBe("geral@roninformatis.pt");
    expect(normalizeEmail("  info@exemplo.pt  ")).toBe("info@exemplo.pt");
    expect(normalizeEmail("nao-e-email")).toBeNull();
    expect(normalizeEmail("sem@dominio")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("classifica caixas genéricas de empresa como GENERIC_BUSINESS", () => {
    expect(classifyEmail("geral@roninformatis.pt")).toBe("GENERIC_BUSINESS");
    expect(classifyEmail("info@empresa.pt")).toBe("GENERIC_BUSINESS");
    expect(classifyEmail("comercial@empresa.pt")).toBe("GENERIC_BUSINESS");
    expect(classifyEmail("contactos@empresa.pt")).toBe("GENERIC_BUSINESS");
  });

  it("classifica emails com padrão nome.sobrenome como NAMED_PERSON", () => {
    expect(classifyEmail("joao.silva@empresa.pt")).toBe("NAMED_PERSON");
    expect(classifyEmail("maria_santos@empresa.pt")).toBe("NAMED_PERSON");
    expect(classifyEmail("ana-costa@empresa.pt")).toBe("NAMED_PERSON");
  });

  it("infere o email_type a partir do prefixo", () => {
    expect(inferEmailType("geral@empresa.pt")).toBe("geral");
    expect(inferEmailType("info@empresa.pt")).toBe("geral");
    expect(inferEmailType("comercial@empresa.pt")).toBe("comercial");
    expect(inferEmailType("vendas@empresa.pt")).toBe("comercial");
    expect(inferEmailType("suporte@empresa.pt")).toBe("suporte");
    expect(inferEmailType("outro@empresa.pt")).toBe("outro");
  });

  it("transporta o email para o registo normalizado", () => {
    const normalizado = normalizeExternalRecord(
      { name: "Roninformatis", nif: "506705803", email: "geral@roninformatis.pt" },
      "file_import",
      "2026-10-01T00:00:00.000Z",
    );
    expect(normalizado?.email).toBe("geral@roninformatis.pt");
  });

  it("exclui (invalid) emails que aparentam ser de pessoa nomeada", () => {
    const evaluation = evaluateExternalRecord(
      record({ email: "joao.silva@empresa.pt" }),
      emptyKnownCompanySnapshot(),
    );
    expect(evaluation.bucket).toBe("invalid");
    expect(evaluation.reason).toMatch(/pessoa nomeada/i);
  });

  it("aceita emails genéricos de empresa como registos novos", () => {
    const evaluation = evaluateExternalRecord(
      record({ email: "geral@empresa.pt" }),
      emptyKnownCompanySnapshot(),
    );
    expect(evaluation.bucket).toBe("new");
  });

  it("importa o CSV real do utilizador (coluna 'contacto') com o email presente", async () => {
    const { runDiscoveryEngine } = await import("./engine");
    const { FileCompanyDiscoveryProvider } = await import("./providers/fileProvider");
    const csv = [
      "nome;nif;distrito;concelho;localidade;website;contacto;id",
      "Roninformatis;506705803;Braga;Braga;Braga;https://roninformatis.pt/;geral@roninformatis.pt;prospect_001",
    ].join("\n");
    const provider = new FileCompanyDiscoveryProvider(csv, "prospects.csv");
    const output = await runDiscoveryEngine({
      provider,
      filters: { ...defaultFilters(), limit: 10 },
      known: emptyKnownCompanySnapshot(),
      dryRun: true,
    });
        expect(output.newRecords).toHaveLength(1);
    expect(output.newRecords[0].record.email).toBe("geral@roninformatis.pt");
    expect(output.newRecords[0].record.nif).toBe("506705803");
    expect(output.newRecords[0].record.sourceId).toBe("prospect_001");
  });

  it("o payload de persistência deriva email_type e proveniência honesta", async () => {
    const { toPersistPayload } = await import("./engine");
    const evaluation = evaluateExternalRecord(
      record({ email: "comercial@empresa.pt", source: "file_import" }),
      emptyKnownCompanySnapshot(),
    );
    const payload = toPersistPayload(evaluation);
    expect(payload.email).toBe("comercial@empresa.pt");
    expect(payload.email_type).toBe("comercial");
    // A origem do contacto é o próprio provider — nunca um valor inventado.
    expect(payload.contact_source).toBe("file_import");
    expect(payload.company_source).toBe("file_import");
  });

  it("não atribui email_type quando não há email (sem dados inventados)", async () => {
    const { toPersistPayload } = await import("./engine");
    const evaluation = evaluateExternalRecord(record({ email: null }), emptyKnownCompanySnapshot());
    expect(toPersistPayload(evaluation).email_type).toBeNull();
  });
});

describe("companyDiscovery — deduplicação", () => {
  it("usa o NIF como chave preferida", () => {
    expect(dedupKeyForRecord(record())).toBe("nif:123456789");
  });

  it("usa nome + localidade (conservador) quando não há NIF", () => {
    const key = dedupKeyForRecord(record({ nif: null, name: "Empresa Exemplo Lda", localidade: "Porto" }));
    expect(key).toBe("name:empresa exemplo lda|porto");
  });

  it("cai para localidade vazia quando não há localidade (alinhado com a base)", () => {
    const key = dedupKeyForRecord(record({ nif: null, name: "Empresa X", localidade: null, municipality: null, district: "Braga" }));
    expect(key).toBe("name:empresa x|");
  });

  it("nunca funde empresas diferentes por nome genérico", () => {
    const a = dedupKeyForRecord(record({ nif: null, name: "Padaria Central Lda", localidade: "Lisboa" }));
    const b = dedupKeyForRecord(record({ nif: null, name: "Padaria Central Lda", localidade: "Porto" }));
    expect(a).not.toBe(b);
  });
});

describe("companyDiscovery — avaliação de registos", () => {
  it("classifica como novo quando desconhecido", () => {
    const evaluation = evaluateExternalRecord(record(), emptyKnownCompanySnapshot());
    expect(evaluation.bucket).toBe("new");
  });

  it("classifica como duplicado quando o NIF já existe", () => {
    const known = emptyKnownCompanySnapshot();
    known.knownNifs.add("123456789");
    const evaluation = evaluateExternalRecord(record(), known);
    expect(evaluation.bucket).toBe("duplicate");
  });

  it("classifica como duplicado por nome+localização quando não há NIF", () => {
    const known = emptyKnownCompanySnapshot();
    known.knownDedupKeys.add(dedupKeyForRecord(record({ nif: null })));
    const evaluation = evaluateExternalRecord(record({ nif: null }), known);
    expect(evaluation.bucket).toBe("duplicate");
  });

  it("bloqueia (opt-out) com prioridade sobre duplicação", () => {
    const known = emptyKnownCompanySnapshot();
    known.knownNifs.add("123456789");
    known.blockedNifs.add("123456789");
    const evaluation = evaluateExternalRecord(record(), known);
    expect(evaluation.bucket).toBe("blocked");
  });

  it("bloqueia por chave conservadora quando não há NIF", () => {
    const known = emptyKnownCompanySnapshot();
    known.blockedDedupKeys.add(dedupKeyForRecord(record({ nif: null })));
    const evaluation = evaluateExternalRecord(record({ nif: null }), known);
    expect(evaluation.bucket).toBe("blocked");
  });
});

describe("companyDiscovery — lote com amostra pequena", () => {
  const known = emptyKnownCompanySnapshot();

  it("conta invalid, sourceDuplicates, existing e blocked corretamente", () => {
    known.knownNifs.add("111111111"); // já existe
    known.blockedNifs.add("222222222"); // opt-out sinistral

    const sample: Array<Partial<ExternalCompanyRecord> & { name?: string | null }> = [
      // 3 novos (NIFs distintos)
      { name: "Alfa Lda", nif: "333333333", district: "Lisboa", localidade: "Lisboa" },
      { name: "Beta Lda", nif: "444444444", district: "Porto", localidade: "Porto" },
      { name: "Gama Lda", nif: null, district: "Braga", localidade: "Braga" },
      // 1 já existente
      { name: "Delta Lda", nif: "111111111" },
      // 1 bloqueado
      { name: "Epsilon Lda", nif: "222222222" },
      // 1 inválido (sem nome)
      { name: "   " },
      // 1 duplicado dentro da própria fonte (mesmo NIF que Alfa)
      { name: "Alfa Duplicada Lda", nif: "333333333" },
    ];

    const { evaluations, counters } = evaluateDiscoveryBatch(
      sample,
      "file_import",
      "2026-10-01T00:00:00.000Z",
      known,
    );

    expect(counters.found).toBe(7);
    expect(counters.invalid).toBe(1);
    expect(counters.sourceDuplicates).toBe(1);
    expect(counters.existing).toBe(1);
    expect(counters.blocked).toBe(1);
    expect(counters.created).toBe(0); // contador de criação só no backend
    expect(evaluations.filter((e) => e.bucket === "new")).toHaveLength(3);
  });

  it("ordena avaliações: novos primeiro", () => {
    const sample: Array<Partial<ExternalCompanyRecord> & { name?: string | null }> = [
      { name: "Zeta Lda", nif: "999999999" },
      { name: "Omega Lda", nif: null, localidade: "Faro" },
    ];
    const { evaluations } = evaluateDiscoveryBatch(sample, "file_import", "2026-10-01T00:00:00.000Z", emptyKnownCompanySnapshot());
    const sorted = sortEvaluations(evaluations);
    expect(sorted[0].record.name).toBe("Omega Lda");
    expect(sorted[1].record.name).toBe("Zeta Lda");
  });
});

describe("companyDiscovery — filtros", () => {
  const base = record();

  it("filtra por CAE (prefixo)", () => {
    const filters = { ...defaultFilters(), cae: "62" };
    expect(applyFilters([base], filters)).toHaveLength(1);
    expect(applyFilters([base], { ...filters, cae: "63" })).toHaveLength(0);
  });

  it("filtra por distrito (sem acentos)", () => {
    expect(applyFilters([base], { ...defaultFilters(), district: "lisboa" })).toHaveLength(1);
    expect(applyFilters([base], { ...defaultFilters(), district: "Porto" })).toHaveLength(0);
  });

  it("filtra apenas ativas", () => {
    expect(applyFilters([record({ state: "inactive" })], { ...defaultFilters(), activeOnly: true })).toHaveLength(0);
    expect(applyFilters([record({ state: "inactive" })], { ...defaultFilters(), activeOnly: false })).toHaveLength(1);
  });

  it("filtra por data de constituição", () => {
    expect(applyFilters([base], { ...defaultFilters(), incorporationFrom: "2020-01-01" })).toHaveLength(0);
    expect(applyFilters([base], { ...defaultFilters(), incorporationFrom: "2000-01-01", incorporationTo: "2020-01-01" })).toHaveLength(1);
  });

  it("filtra por número mínimo de trabalhadores", () => {
    expect(applyFilters([base], { ...defaultFilters(), minEmployees: 20 })).toHaveLength(0);
    expect(applyFilters([base], { ...defaultFilters(), minEmployees: 5 })).toHaveLength(1);
  });
});

describe("companyDiscovery — providers", () => {
  it("FileCompanyDiscoveryProvider faz parsing de CSV e devolve registos", async () => {
    const { FileCompanyDiscoveryProvider } = await import("./providers/fileProvider");
    const csv = ["Nome;NIF;CAE;Distrito", "Alfa Lda;333333333;62010;Lisboa", "Beta Lda;444444444;62020;Porto"].join("\n");
    const provider = new FileCompanyDiscoveryProvider(csv, "empresas.csv");
    const result = await provider.searchCompanies({ ...defaultFilters(), limit: 10 });
    expect(result.records).toHaveLength(2);
    expect(result.records[0].name).toBe("Alfa Lda");
    expect(result.records[0].source).toBe("file_import");
  });

  it("FileCompanyDiscoveryProvider não toca na rede e reporta ficheiro vazio", async () => {
    const { FileCompanyDiscoveryProvider } = await import("./providers/fileProvider");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new FileCompanyDiscoveryProvider("", "vazio.csv");
    const result = await provider.searchCompanies(defaultFilters());
    expect(result.records).toHaveLength(0);
    expect(result.errors?.[0]).toMatch(/vazio/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("ManualCompanyDiscoveryProvider devolve a lista fornecida", async () => {
    const { ManualCompanyDiscoveryProvider } = await import("./providers/manualProvider");
    const provider = new ManualCompanyDiscoveryProvider([{ name: "Gamma Lda", nif: "555555555" }]);
    const result = await provider.searchCompanies({ ...defaultFilters(), limit: 10 });
    expect(result.records).toHaveLength(1);
    expect(result.records[0].source).toBe("manual");
  });

  it("OpenDataCompanyDiscoveryProvider fica inativo sem endpoint configurado", async () => {
    const { OpenDataCompanyDiscoveryProvider } = await import("./providers/openDataProvider");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new OpenDataCompanyDiscoveryProvider({
      id: "open_test",
      name: "Fonte de teste",
      license: "CC0",
      endpoint: null,
      project: (item) => ({ name: String(item.name ?? "") }),
    });
    expect(provider.isConfigured()).toBe(false);
    const result = await provider.searchCompanies(defaultFilters());
    expect(result.records).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("OpenDataCompanyDiscoveryProvider recusa endpoint inseguro (SSRF)", async () => {
    const { OpenDataCompanyDiscoveryProvider } = await import("./providers/openDataProvider");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new OpenDataCompanyDiscoveryProvider({
      id: "open_bad",
      name: "Fonte perigosa",
      license: "CC0",
      endpoint: "http://localhost:8080/companies",
      project: (item) => ({ name: String(item.name ?? "") }),
    });
    const result = await provider.searchCompanies(defaultFilters());
    expect(result.records).toHaveLength(0);
    expect(result.errors?.[0]).toMatch(/segurança/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("companyDiscovery — motor", () => {
  it("runDiscoveryEngine produz contadores e candidatos novos", async () => {
    const { runDiscoveryEngine } = await import("./engine");
    const { ManualCompanyDiscoveryProvider } = await import("./providers/manualProvider");
    const provider = new ManualCompanyDiscoveryProvider([
      { name: "Alfa Lda", nif: "333333333" },
      { name: "Beta Lda", nif: "444444444" },
    ]);
    const output = await runDiscoveryEngine({
      provider,
      filters: { ...defaultFilters(), limit: 10 },
      known: emptyKnownCompanySnapshot(),
      dryRun: true,
    });
    expect(output.counters.found).toBe(2);
    expect(output.newRecords).toHaveLength(2);
    expect(output.dryRun).toBe(true);
  });

  it("motor em dry-run não cria nada (newRecords apenas pré-visualização)", async () => {
    const { runDiscoveryEngine } = await import("./engine");
    const { ManualCompanyDiscoveryProvider } = await import("./providers/manualProvider");
    const provider = new ManualCompanyDiscoveryProvider([{ name: "Alfa Lda", nif: "333333333" }]);
    const output = await runDiscoveryEngine({
      provider,
      filters: { ...defaultFilters(), limit: 10 },
      known: emptyKnownCompanySnapshot(),
      dryRun: true,
    });
    expect(output.counters.created).toBe(0);
  });

  it("motor contabiliza erros parciais da fonte sem lançar", async () => {
    const { runDiscoveryEngine } = await import("./engine");
    const { ManualCompanyDiscoveryProvider } = await import("./providers/manualProvider");
    const provider = new ManualCompanyDiscoveryProvider([]);
    vi.spyOn(provider, "searchCompanies").mockResolvedValueOnce({
      records: [],
      hasMore: false,
      errors: ["Fonte indisponível"],
    });
    const output = await runDiscoveryEngine({
      provider,
      filters: { ...defaultFilters(), limit: 10 },
      known: emptyKnownCompanySnapshot(),
      dryRun: true,
    });
    expect(output.counters.errors).toBe(1);
    expect(output.errors).toContain("Fonte indisponível");
  });
});
