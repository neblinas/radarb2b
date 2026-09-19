import { describe, expect, it } from "vitest";
import { calculateProspectScore, isPublicHttpUrl, normalizeEmail, normalizePhone, scoreHeat } from "./prospecting";

describe("prospecting score", () => {
  it("calculates a deterministic capped score", () => {
    expect(calculateProspectScore({ participation12Months: 12, participationTotal: 40, totalAwardValue: 600000, competitorCount: 20, cpvCount: 8, lastParticipation: "2026-09-01" }, new Date("2026-09-17"))).toBe(87);
  });

  it("classifies score thresholds", () => {
    expect(scoreHeat(80)).toBe("Muito quente");
    expect(scoreHeat(60)).toBe("Quente");
    expect(scoreHeat(40)).toBe("Médio");
    expect(scoreHeat(39)).toBe("Baixo");
  });
});

describe("contact normalization and SSRF guard", () => {
  it("normalizes institutional contact keys", () => {
    expect(normalizeEmail(" Comercial@Empresa.PT ")).toBe("comercial@empresa.pt");
    expect(normalizePhone("+351 912 345 678")).toBe("351912345678");
  });

  it("blocks private or unsafe URL targets", () => {
    expect(isPublicHttpUrl("https://empresa.pt/contactos")).toBe(true);
    expect(isPublicHttpUrl("http://127.0.0.1/admin")).toBe(false);
    expect(isPublicHttpUrl("http://192.168.1.1")).toBe(false);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
  });
});
