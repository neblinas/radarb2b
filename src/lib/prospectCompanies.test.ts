import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));

import {
  classifyEmailType,
  extractDomain,
  isBlockedFromCampaigns,
  normalizeNif,
} from "./prospectCompanies";

describe("prospectCompanies — normalização de NIF", () => {
  it("normaliza NIF para dígitos", () => {
    expect(normalizeNif(" 222 184 680 ")).toBe("222184680");
    expect(normalizeNif("PT222184680")).toBe("222184680");
  });

  it("devolve null quando não há dígitos", () => {
    expect(normalizeNif("")).toBeNull();
    expect(normalizeNif(null)).toBeNull();
    expect(normalizeNif("N/A")).toBeNull();
  });
});

describe("prospectCompanies — extração de domínio", () => {
  it("extrai domínio de email (sem www)", () => {
    expect(extractDomain("Comercial@Empresa.PT")).toBe("empresa.pt");
    expect(extractDomain("info@www.exemplo.pt")).toBe("exemplo.pt");
  });

  it("extrai domínio de URL", () => {
    expect(extractDomain("https://www.Exemplo.pt/contactos")).toBe("exemplo.pt");
    expect(extractDomain("http://empresa.pt")).toBe("empresa.pt");
  });

  it("devolve null para valores sem domínio válido", () => {
    expect(extractDomain("semdominio")).toBeNull();
    expect(extractDomain("")).toBeNull();
  });
});

describe("prospectCompanies — classificação de tipo de email", () => {
  it("classifica emails institucionais genéricos", () => {
    expect(classifyEmailType("geral@empresa.pt")).toBe("geral");
    expect(classifyEmailType("info@empresa.pt")).toBe("geral");
    expect(classifyEmailType("contacto@empresa.pt")).toBe("geral");
  });

  it("classifica emails comerciais e de suporte", () => {
    expect(classifyEmailType("comercial@empresa.pt")).toBe("comercial");
    expect(classifyEmailType("vendas@empresa.pt")).toBe("comercial");
    expect(classifyEmailType("suporte@empresa.pt")).toBe("suporte");
  });

  it("classifica emails nominais como outro", () => {
    expect(classifyEmailType("joao.silva@empresa.pt")).toBe("outro");
  });

  it("devolve null para valores inválidos", () => {
    expect(classifyEmailType("nao-e-email")).toBeNull();
    expect(classifyEmailType(null)).toBeNull();
  });
});

describe("prospectCompanies — salvaguarda de campanhas", () => {
  it("bloqueia prospects com opt-out", () => {
    expect(isBlockedFromCampaigns({ opt_out: true, commercial_status: "OPTED_OUT" })).toBe(true);
    expect(isBlockedFromCampaigns({ opt_out: true, commercial_status: "NEW" })).toBe(true);
  });

  it("bloqueia prospects com estado OPTED_OUT mesmo sem flag", () => {
    expect(isBlockedFromCampaigns({ opt_out: false, commercial_status: "OPTED_OUT" })).toBe(true);
  });

  it("permite prospects elegíveis sem opt-out", () => {
    expect(isBlockedFromCampaigns({ opt_out: false, commercial_status: "READY_FOR_AUTOPILOT" })).toBe(false);
  });
});
