import { describe, expect, it } from "vitest";
import {
  AUTOMATION_DEFAULTS,
  canSendRealEmail,
  isWithinSendWindow,
  settingsFromRows,
  shouldRequireApproval,
} from "./automationConfig";
import {
  canTransition,
  classifyContactConfidence,
  isTerminal,
  stateForReply,
} from "./automationState";

describe("automation settings", () => {
  it("aplica defaults quando faltam valores", () => {
    const settings = settingsFromRows([]);
    expect(settings.sales_autopilot_enabled).toBe(false);
    expect(settings.autopilot_dry_run).toBe(true);
    expect(settings.autopilot_min_score).toBe(AUTOMATION_DEFAULTS.autopilot_min_score);
  });

  it("faz override com valores da BD", () => {
    const settings = settingsFromRows([
      { key: "sales_autopilot_enabled", value: true },
      { key: "autopilot_min_score", value: 75 },
    ]);
    expect(settings.sales_autopilot_enabled).toBe(true);
    expect(settings.autopilot_min_score).toBe(75);
  });

  it("ignora chaves desconhecidas", () => {
    const settings = settingsFromRows([{ key: "chave_desconhecida", value: "x" }]);
    expect(settings).not.toHaveProperty("chave_desconhecida");
  });

  it("só permite envio real com todas as condições", () => {
    expect(canSendRealEmail(AUTOMATION_DEFAULTS)).toBe(false);
    expect(
      canSendRealEmail({
        ...AUTOMATION_DEFAULTS,
        sales_autopilot_enabled: true,
        auto_outreach_enabled: true,
        autopilot_dry_run: false,
      }),
    ).toBe(true);
    expect(
      canSendRealEmail({
        ...AUTOMATION_DEFAULTS,
        sales_autopilot_enabled: true,
        auto_outreach_enabled: true,
        autopilot_dry_run: false,
        autopilot_kill_switch: true,
      }),
    ).toBe(false);
  });

  it("exige aprovação humana por omissão no envio real", () => {
    // Default exige aprovação e está em dry-run.
    expect(AUTOMATION_DEFAULTS.autopilot_require_approval).toBe(true);

    const live = { ...AUTOMATION_DEFAULTS, autopilot_dry_run: false };
    expect(shouldRequireApproval(live)).toBe(true);

    // Com aprovação desligada e envio real, não exige.
    expect(shouldRequireApproval({ ...live, autopilot_require_approval: false })).toBe(false);

    // Em dry-run nunca fica pendente (é simulado).
    expect(shouldRequireApproval({ ...AUTOMATION_DEFAULTS, autopilot_dry_run: true })).toBe(false);
  });

  it("respeita a janela de envio", () => {
    const settings = { ...AUTOMATION_DEFAULTS, autopilot_send_weekdays_only: true };
    // 2024-01-03 é uma quarta-feira.
    expect(isWithinSendWindow(settings, new Date("2024-01-03T10:00:00"))).toBe(true);
    expect(isWithinSendWindow(settings, new Date("2024-01-03T20:00:00"))).toBe(false);
    // 2024-01-06 é sábado.
    expect(isWithinSendWindow(settings, new Date("2024-01-06T10:00:00"))).toBe(false);
  });
});

describe("automation state machine", () => {
  it("permite transições válidas do fluxo principal", () => {
    expect(canTransition("discovered", "qualification_pending")).toBe(true);
    expect(canTransition("qualified", "enrichment_pending")).toBe(true);
    expect(canTransition("contact_ready", "outreach_queued")).toBe(true);
    expect(canTransition("outreach_queued", "contacted")).toBe(true);
    expect(canTransition("contacted", "followup_1")).toBe(true);
    expect(canTransition("replied", "interested")).toBe(true);
    expect(canTransition("signup", "activated")).toBe(true);
    expect(canTransition("activated", "paying")).toBe(true);
  });

  it("bloqueia transições inválidas", () => {
    expect(canTransition("discovered", "paying")).toBe(false);
    expect(canTransition("not_qualified", "qualified")).toBe(false);
    expect(canTransition("unsubscribed", "contacted")).toBe(false);
  });

  it("marca estados terminais", () => {
    expect(isTerminal("unsubscribed")).toBe(true);
    expect(isTerminal("do_not_contact")).toBe(true);
    expect(isTerminal("paying")).toBe(true);
    expect(isTerminal("contacted")).toBe(false);
    expect(isTerminal("human_review")).toBe(false);
  });

  it("classifica respostas em estados determinísticos", () => {
    expect(stateForReply("unsubscribe")).toBe("unsubscribed");
    expect(stateForReply("not_interested")).toBe("not_interested");
    expect(stateForReply("wrong_contact")).toBe("human_review");
    expect(stateForReply("bounce")).toBe("bounced");
    expect(stateForReply("needs_human")).toBe("human_review");
    expect(stateForReply("interested")).toBe("interested");
    expect(stateForReply("wants_demo")).toBe("interested");
    expect(stateForReply("pricing_question")).toBe("replied");
    expect(stateForReply("out_of_office")).toBe("contacted");
  });

  it("classifica a confiança do contacto de forma conservadora", () => {
    expect(classifyContactConfidence(85)).toEqual({ level: "high", state: "contact_ready" });
    expect(classifyContactConfidence(70)).toEqual({ level: "high", state: "contact_ready" });
    expect(classifyContactConfidence(55)).toEqual({ level: "medium", state: "contact_ready" });
    expect(classifyContactConfidence(40)).toEqual({ level: "medium", state: "contact_ready" });
    expect(classifyContactConfidence(39)).toEqual({ level: "low", state: "human_review" });
    expect(classifyContactConfidence(0)).toEqual({ level: "low", state: "human_review" });
  });
});

