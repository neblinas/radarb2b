import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Sales Autopilot — ciclo de vida de clientes (FASE 5).
 *
 * Corre com SERVICE ROLE, protegido por AUTOPILOT_CRON_SECRET. Cada invocação:
 *   1. lê as flags (kill switch, lifecycle_enabled, dry-run);
 *   2. seleciona clientes-alvo (RPC automation_select_lifecycle_targets);
 *   3. para cada um, recolhe sinais REAIS, decide o estágio (regras) e registra;
 *   4. gera relatórios de valor e envia emails (dry-run não envia).
 *
 * Nunca usa IA para decidir elegibilidade — só para redigir (opcional).
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const SITE_URL = Deno.env.get("SITE_URL") || "https://adjudata.pt";
const SENDER_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "Adjudata <comercial@adjudata.pt>";

type Settings = Record<string, unknown>;
const asBool = (v: unknown, f = false) => (typeof v === "boolean" ? v : f);

// ---------------------------------------------------------------------------
// Lógica pura (espelha customerLifecycle.ts — frontend não é importável aqui).
// ---------------------------------------------------------------------------
type LifecycleStage = "onboarding" | "activated" | "engaged" | "at_risk" | "dormant" | "renewal_due" | "renewed" | "churned" | "winback";
type LifecycleAction = "nudge_onboarding" | "value_report" | "renewal_reminder" | "reactivate" | "check_in";

function computeHealthScore(s: {
  searches30d: number; logins30d: number; daysSinceLastSeen: number | null;
  onboardingIncomplete: boolean; subscriptionStatus: string | null;
}): number {
  let score = 50;
  score += Math.min(30, s.searches30d * 3);
  score += Math.min(20, s.logins30d * 4);
  if (s.daysSinceLastSeen === null) score -= 25;
  else if (s.daysSinceLastSeen <= 7) score += 10;
  else if (s.daysSinceLastSeen <= 30) score += 0;
  else if (s.daysSinceLastSeen <= 60) score -= 15;
  else score -= 30;
  if (s.onboardingIncomplete) score -= 10;
  if (s.subscriptionStatus && ["expired", "canceled", "past_due"].includes(s.subscriptionStatus)) score -= 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function decideLifecycle(signals: {
  searches30d: number; logins30d: number; daysSinceLastSeen: number | null;
  daysToRenewal: number | null; onboardingIncomplete: boolean; subscriptionStatus: string | null;
}): { stage: LifecycleStage; healthScore: number; action: LifecycleAction; reason: string } {
  const healthScore = computeHealthScore(signals);
  const subInactive = signals.subscriptionStatus != null && ["expired", "canceled", "past_due"].includes(signals.subscriptionStatus);
  if (subInactive) return { stage: signals.daysSinceLastSeen !== null && signals.daysSinceLastSeen > 90 ? "churned" : "at_risk", healthScore, action: "reactivate", reason: `subscrição ${signals.subscriptionStatus}` };
  if (signals.daysToRenewal !== null && signals.daysToRenewal <= 14 && signals.daysToRenewal >= 0) return { stage: "renewal_due", healthScore, action: "renewal_reminder", reason: `renovação em ${signals.daysToRenewal} dias` };
  if (signals.daysSinceLastSeen !== null && signals.daysSinceLastSeen > 60) return { stage: "dormant", healthScore, action: "reactivate", reason: `inativo há ${signals.daysSinceLastSeen} dias` };
  if (healthScore < 40) return { stage: "at_risk", healthScore, action: "check_in", reason: `health score baixo (${healthScore})` };
  if (signals.onboardingIncomplete) return { stage: "onboarding", healthScore, action: "nudge_onboarding", reason: "onboarding incompleto" };
  const engaged = signals.searches30d >= 5 || signals.logins30d >= 5;
  if (engaged) return { stage: "engaged", healthScore, action: "value_report", reason: "cliente ativo e engajado" };
  return { stage: "activated", healthScore, action: "value_report", reason: "cliente ativado" };
}

async function loadSettings(admin: SupabaseClient, organizationId: string): Promise<Settings> {
  const { data: rows } = await admin.from("app_settings").select("key,value").eq("organization_id", organizationId);
  const map: Settings = {};
  for (const row of (rows ?? []) as { key: string; value: unknown }[]) map[row.key] = row.value;
  return map;
}

Deno.serve(async (request) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("RADAR_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const expectedSecret = Deno.env.get("AUTOPILOT_CRON_SECRET");
  if (expectedSecret && request.headers.get("x-autopilot-secret") !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const { data: org } = await admin.from("organizations").select("id").limit(1).maybeSingle();
    const organizationId = org?.id as string | undefined;
    if (!organizationId) return json({ error: "Organização não encontrada" }, 400);

    const settings = await loadSettings(admin, organizationId);
    if (asBool(settings["autopilot_kill_switch"])) return json({ ok: true, stopped: "kill_switch" });
    if (!asBool(settings["customer_lifecycle_enabled"])) return json({ ok: true, stopped: "flags_off" });
    const dryRun = asBool(settings["autopilot_dry_run"], true);

    const { data: targets } = await admin.rpc("automation_select_lifecycle_targets", {
      p_organization_id: organizationId, p_limit: 50,
    });

    let processed = 0, reports = 0, skipped = 0;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    for (const target of (targets ?? []) as { user_id: string }[]) {
      try {
        const outcome = await processClient(admin, organizationId, target.user_id, settings, {
          dryRun, resendKey: resendKey ?? null,
        });
        processed += 1;
        if (outcome === "report") reports += 1;
        if (outcome === "skipped") skipped += 1;
      } catch (error) {
        await admin.rpc("automation_log", {
          p_level: "error", p_step: "lifecycle_process",
          p_message: error instanceof Error ? error.message : "erro desconhecido",
          p_metadata: { user_id: target.user_id },
        });
      }
    }

    return json({ ok: true, dryRun, processed, reports, skipped });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Lifecycle falhou" }, 500);
  }
});

async function processClient(
  admin: SupabaseClient,
  organizationId: string,
  userId: string,
  settings: Settings,
  options: { dryRun: boolean; resendKey: string | null },
): Promise<"report" | "notified" | "skipped"> {
  // Sinais reais (fonte canónica): usage_monthly, user_activity, subscriptions
  // e onboarding_tasks, agregados pela RPC lifecycle_signals_service.
  const { data: signalRows } = await admin.rpc("lifecycle_signals_service", {
    p_organization_id: organizationId, p_user_id: userId,
  });
  const row = (Array.isArray(signalRows) ? signalRows[0] : signalRows) as {
    searches_30d: number; logins_30d: number; days_since_last_seen: number | null;
    days_to_renewal: number | null; onboarding_incomplete: boolean; subscription_status: string | null;
  } | null;

  const signals = {
    searches30d: row?.searches_30d ?? 0,
    logins30d: row?.logins_30d ?? 0,
    daysSinceLastSeen: row?.days_since_last_seen ?? null,
    daysToRenewal: row?.days_to_renewal ?? null,
    onboardingIncomplete: row?.onboarding_incomplete ?? false,
    subscriptionStatus: row?.subscription_status ?? null,
  };

  const decision = decideLifecycle(signals);

  await admin.rpc("automation_set_lifecycle_service", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_stage: decision.stage,
    p_health_score: decision.healthScore,
    p_reason: decision.reason,
    p_source: "automation",
    p_metadata: { searches_30d: signals.searches30d, days_since_last_seen: daysSinceLastSeen },
  });

  // Relatório de valor (gera + envia conforme ação).
  if (decision.action === "value_report" || decision.action === "renewal_reminder") {
    const body = buildValueReport(signals, decision.reason);
    const { data: report } = await admin.from("value_reports").insert({
      organization_id: organizationId, user_id: userId,
      period_start: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      period_end: new Date().toISOString().slice(0, 10),
      metrics: { searches_30d: signals.searches30d, health_score: decision.healthScore },
      body, status: "generated",
    }).select("id").single();

    if (!options.dryRun && options.resendKey) {
      const { data: user } = await admin.auth.admin.getUserById(userId);
      const to = user?.user?.email;
      if (to && report) {
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${body.split("\n").map((p) => `<p>${p}</p>`).join("")}
<p style="color:#64748b;font-size:12px">Adjudata · <a href="${SITE_URL}">adjudata.pt</a></p></div>`;
        const resend = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${options.resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: SENDER_FROM, to: [to], subject: "O seu resumo de valor na Adjudata", html }),
        });
        await admin.from("value_reports").update({ status: resend.ok ? "sent" : "failed", sent_at: resend.ok ? new Date().toISOString() : null }).eq("id", report.id);
      }
    }
    return "report";
  }

  if (options.dryRun) return "skipped";
  return "notified";
}

function buildValueReport(signals: { searches30d: number }, reason: string): string {
  return `Resumo do valor da Adjudata\n\n` +
    `Nas últimas semanas registou ${signals.searches30d} pesquisas na plataforma.\n` +
    `Motivo deste contacto: ${reason}.\n\n` +
    `Se precisar de ajuda a tirar mais partido dos dados, responda a este email.`;
}
