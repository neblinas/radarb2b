import { describe, expect, it } from "vitest";
import {
  computeHealthScore,
  decideLifecycle,
  type LifecycleSignals,
} from "./customerLifecycle";

const base: LifecycleSignals = {
  searches30d: 0,
  logins30d: 0,
  daysSinceLastSeen: null,
  daysToRenewal: null,
  onboardingIncomplete: false,
  subscriptionStatus: "active",
};

describe("computeHealthScore", () => {
  it("cliente ativo e engajado tem score alto", () => {
    const score = computeHealthScore({ ...base, searches30d: 8, logins30d: 6, daysSinceLastSeen: 2 });
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("cliente inativo tem score baixo", () => {
    const score = computeHealthScore({ ...base, daysSinceLastSeen: 90 });
    expect(score).toBeLessThan(40);
  });

  it("subscrição expirada penaliza", () => {
    const active = computeHealthScore({ ...base, searches30d: 5 });
    const expired = computeHealthScore({ ...base, searches30d: 5, subscriptionStatus: "expired" });
    expect(expired).toBeLessThan(active);
  });

  it("onboarding incompleto penaliza", () => {
    const complete = computeHealthScore({ ...base, searches30d: 5 });
    const incomplete = computeHealthScore({ ...base, searches30d: 5, onboardingIncomplete: true });
    expect(incomplete).toBeLessThan(complete);
  });

  it("mantém o score entre 0 e 100", () => {
    expect(computeHealthScore({ ...base, searches30d: 100, logins30d: 100, daysSinceLastSeen: 0 })).toBeLessThanOrEqual(100);
    expect(computeHealthScore({ ...base, daysSinceLastSeen: 999, subscriptionStatus: "expired" })).toBeGreaterThanOrEqual(0);
  });
});

describe("decideLifecycle", () => {
  it("subscrição cancelada recente → at_risk / reactivate", () => {
    const d = decideLifecycle({ ...base, subscriptionStatus: "canceled", daysSinceLastSeen: 10 });
    expect(d.stage).toBe("at_risk");
    expect(d.action).toBe("reactivate");
  });

  it("subscrição cancelada há muito tempo → churned", () => {
    const d = decideLifecycle({ ...base, subscriptionStatus: "canceled", daysSinceLastSeen: 120 });
    expect(d.stage).toBe("churned");
  });

  it("renovação em 7 dias → renewal_due / renewal_reminder", () => {
    const d = decideLifecycle({ ...base, daysToRenewal: 7 });
    expect(d.stage).toBe("renewal_due");
    expect(d.action).toBe("renewal_reminder");
  });

  it("inativo há 70 dias → dormant / reactivate", () => {
    const d = decideLifecycle({ ...base, daysSinceLastSeen: 70 });
    expect(d.stage).toBe("dormant");
    expect(d.action).toBe("reactivate");
  });

  it("onboarding incompleto → nudge_onboarding", () => {
    const d = decideLifecycle({ ...base, onboardingIncomplete: true, daysSinceLastSeen: 2, searches30d: 3 });
    expect(d.stage).toBe("onboarding");
    expect(d.action).toBe("nudge_onboarding");
  });

  it("cliente engajado → value_report", () => {
    const d = decideLifecycle({ ...base, searches30d: 10, logins30d: 8, daysSinceLastSeen: 1 });
    expect(d.stage).toBe("engaged");
    expect(d.action).toBe("value_report");
  });

  it("renovação tem prioridade sobre onboarding", () => {
    const d = decideLifecycle({ ...base, onboardingIncomplete: true, daysToRenewal: 5 });
    expect(d.stage).toBe("renewal_due");
  });
});
