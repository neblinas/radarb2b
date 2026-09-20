import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Sales Autopilot — worker de outbound (FASE 3).
 *
 * Processa jobs `send_outreach`. Para cada enrollment devido:
 *   1. resolve o próximo passo da sequência;
 *   2. verifica flags (autopilot/outreach/kill switch/dry-run);
 *   3. verifica janela de envio, suppression e rate limits;
 *   4. personaliza com dados REAIS (sem inventar);
 *   5. envia via Resend (ou simula em dry-run);
 *   6. registra mensagem, token de tracking/unsubscribe e eventos.
 *
 * Corre com SERVICE ROLE. Protegido por AUTOPILOT_CRON_SECRET.
 */

const SENDER_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "Adjudata <comercial@adjudata.pt>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://adjudata.pt";
const FUNCTIONS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

type Settings = Record<string, unknown>;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function asBool(v: unknown, f = false) { return typeof v === "boolean" ? v : f; }
function asInt(v: unknown, f: number) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : f; }

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).toLowerCase().trim();
}

/** Substituição de variáveis com dados REAIS. Nunca inventa valores. */
function personalize(
  template: string,
  facts: Record<string, unknown>,
  companyName: string,
): string {
  const awards = facts["award_count"] != null ? String(facts["award_count"]) : "—";
  const value = facts["total_award_value"] != null
    ? Number(facts["total_award_value"]).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })
    : "—";
  const cpv = Array.isArray(facts["cpv_codes"]) && facts["cpv_codes"].length
    ? (facts["cpv_codes"] as string[]).slice(0, 3).join(", ")
    : "—";
  return template
    .replaceAll("{company}", companyName)
    .replaceAll("{nif}", String(facts["nif"] ?? "—"))
    .replaceAll("{awards}", awards)
    .replaceAll("{value}", value)
    .replaceAll("{cpv}", cpv)
    .replaceAll("{participation_12m}", String(facts["participation_12m"] ?? "0"));
}

function renderHtml(body: string, unsubscribeUrl: string, trackingPixel: string): string {
  const paragraphs = escapeHtml(body.trim())
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">
${paragraphs}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
<p style="color:#64748b;font-size:12px">
Não quer receber estes contactos? <a href="${unsubscribeUrl}">Cancelar subscrição</a>.
</p>
<img src="${trackingPixel}" width="1" height="1" alt="" style="display:none"/>
</div>`;
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
    if (!asBool(settings["sales_autopilot_enabled"]) || !asBool(settings["auto_outreach_enabled"])) {
      return json({ ok: true, stopped: "flags_off" });
    }
    const dryRun = asBool(settings["autopilot_dry_run"], true);
    const requireApproval = asBool(settings["autopilot_require_approval"], true);

    // Enfileira enrollments devidos e reclama jobs.
    await admin.rpc("automation_enqueue_due_outreach", { p_organization_id: organizationId, p_limit: 20 });
    const workerId = `outreach-${crypto.randomUUID().slice(0, 8)}`;
    const { data: jobs } = await admin.rpc("automation_claim_jobs", { p_worker_id: workerId, p_limit: 5 });

    let sent = 0, skipped = 0, failed = 0, pending = 0;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    for (const job of (jobs ?? []) as { id: string; job_type: string; entity_type: string | null; entity_id: string | null; correlation_id: string }[]) {
      try {
        if (job.job_type === "send_outreach" && job.entity_type === "message" && job.entity_id) {
          // Mensagem já aprovada por um humano → envio efetivo.
          const result = await sendApprovedMessage(admin, organizationId, job.entity_id, {
            dryRun, resendApiKey: resendApiKey ?? null,
          });
          if (result === "skipped") skipped += 1; else sent += 1;
          await admin.rpc("automation_complete_job", { p_job_id: job.id });
          continue;
        }
        if (job.job_type === "send_outreach" && job.entity_type === "enrollment" && job.entity_id) {
          const result = await prepareStep(admin, organizationId, job.entity_id, settings, {
            dryRun, requireApproval, resendApiKey: resendApiKey ?? null,
          });
          if (result === "pending") pending += 1;
          else if (result === "skipped") skipped += 1;
          else sent += 1;
          await admin.rpc("automation_complete_job", { p_job_id: job.id });
          continue;
        }
        await admin.rpc("automation_complete_job", { p_job_id: job.id });
      } catch (error) {
        failed += 1;
        await admin.rpc("automation_fail_job", {
          p_job_id: job.id,
          p_error: error instanceof Error ? error.message : "erro desconhecido",
        });
      }
    }

    return json({ ok: true, dryRun, requireApproval, sent, skipped, failed, pending });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Outreach falhou" }, 500);
  }
});

/**
 * Prepara o próximo passo de um enrollment. Consoante as flags, o email é:
 *   - enviado já (approval off / dry-run false);
 *   - deixado em `pending_approval` (approval on) — não envia nem avança;
 *   - simulado (dry-run).
 */
async function prepareStep(
  admin: SupabaseClient,
  organizationId: string,
  enrollmentId: string,
  settings: Settings,
  options: { dryRun: boolean; requireApproval: boolean; resendApiKey: string | null },
): Promise<"sent" | "skipped" | "pending"> {
  const { data: stepRows } = await admin.rpc("automation_next_outreach_step", { p_enrollment_id: enrollmentId });
  const step = (Array.isArray(stepRows) ? stepRows[0] : stepRows) as {
    enrollment_id: string; company_id: string; prospect_id: string; campaign_id: string;
    next_step: number; to_email: string; subject: string; body: string; is_last: boolean;
  } | null;
  if (!step) {
    await admin.from("outreach_enrollments").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", enrollmentId);
    return "skipped";
  }

  const domain = emailDomain(step.to_email);
  // Suppression (fail-safe).
  const { data: suppressed } = await admin.rpc("is_suppressed", {
    p_organization_id: organizationId, p_email: step.to_email, p_domain: domain, p_company_id: step.company_id,
  });
  if (suppressed === true) {
    await admin.from("outreach_enrollments").update({ status: "unsubscribed", updated_at: new Date().toISOString() }).eq("id", enrollmentId);
    return "skipped";
  }

  // Rate limiting (verificado só quando vamos enviar de facto).
  if (!options.requireApproval && !options.dryRun) {
    const { data: canSend } = await admin.rpc("outreach_can_send", {
      p_organization_id: organizationId, p_domain: domain, p_campaign_daily_limit: null, p_campaign_domain_limit: null,
    });
    if (canSend !== true) {
      await admin.rpc("automation_enqueue_service", {
        p_organization_id: organizationId, p_job_type: "send_outreach", p_entity_type: "enrollment",
        p_entity_id: enrollmentId, p_dedup_key: `outreach:${enrollmentId}:${Date.now()}`,
        p_scheduled_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), p_priority: 50,
      });
      return "skipped";
    }
  }

  // Personalização com dados reais.
  const { data: facts } = await admin.rpc("automation_prospect_facts", { p_company_id: step.company_id });
  const { data: company } = await admin.from("companies").select("name").eq("id", step.company_id).maybeSingle();
  const companyName = (company?.name as string) ?? "a sua empresa";
  const factsObj = (facts ?? {}) as Record<string, unknown>;

  const subject = personalize(step.subject, factsObj, companyName);
  const bodyText = personalize(step.body, factsObj, companyName);

  const token = crypto.randomUUID().replace(/-/g, "");
  const initialStatus = options.dryRun ? "queued" : options.requireApproval ? "pending_approval" : "queued";
  const { data: message, error: messageError } = await admin
    .from("outreach_messages")
    .insert({
      organization_id: organizationId, enrollment_id: enrollmentId, step_position: step.next_step,
      to_email: step.to_email, subject, body: bodyText, token, status: initialStatus,
    })
    .select("id")
    .single();
  if (messageError) throw messageError;

  // Dry-run: não envia.
  if (options.dryRun || !options.resendApiKey) {
    await admin.from("outreach_messages").update({ status: "skipped", error: "dry-run" }).eq("id", message.id);
    await admin.rpc("automation_log", {
      p_level: "info", p_step: "outreach_dry_run",
      p_message: `[dry-run] ${step.to_email}: ${subject}`,
      p_metadata: { enrollment_id: enrollmentId, step: step.next_step },
    });
    return "skipped";
  }

  // Aprovação humana: deixa pendente e para aqui (a aprovação re-enfileira).
  if (options.requireApproval) {
    await admin.rpc("automation_log", {
      p_level: "info", p_step: "outreach_pending_approval",
      p_message: `À espera de aprovação: ${step.to_email} (passo ${step.next_step})`,
      p_metadata: { enrollment_id: enrollmentId, message_id: message.id },
    });
    return "pending";
  }

  // Envio direto (sem aprovação).
  return await deliverMessage(admin, organizationId, settings, message.id, step, token);
}

/**
 * Envia uma mensagem JÁ aprovada (job entity_type = 'message').
 */
async function sendApprovedMessage(
  admin: SupabaseClient,
  organizationId: string,
  messageId: string,
  options: { dryRun: boolean; resendApiKey: string | null },
): Promise<"sent" | "skipped"> {
  const { data: rows } = await admin.rpc("automation_approved_message_service", { p_message_id: messageId });
  const row = (Array.isArray(rows) ? rows[0] : rows) as {
    message_id: string; enrollment_id: string; company_id: string; prospect_id: string;
    to_email: string; subject: string; body: string; token: string; step_position: number;
  } | null;
  if (!row) {
    // Já não está aprovada (ex.: rejeitada/alterada) — nada a fazer.
    return "skipped";
  }

  const settings = await loadSettings(admin, organizationId);
  const domain = emailDomain(row.to_email);

  // Reinche suppression (fail-safe) — pode ter mudado entre aprovação e envio.
  const { data: suppressed } = await admin.rpc("is_suppressed", {
    p_organization_id: organizationId, p_email: row.to_email, p_domain: domain, p_company_id: row.company_id,
  });
  if (suppressed === true) {
    await admin.from("outreach_messages").update({ status: "skipped", error: "suppressed" }).eq("id", row.message_id);
    await admin.from("outreach_enrollments").update({ status: "unsubscribed", updated_at: new Date().toISOString() }).eq("id", row.enrollment_id);
    return "skipped";
  }

  if (!options.dryRun && options.resendApiKey) {
    const { data: canSend } = await admin.rpc("outreach_can_send", {
      p_organization_id: organizationId, p_domain: domain, p_campaign_daily_limit: null, p_campaign_domain_limit: null,
    });
    if (canSend !== true) {
      // Volta a approved e reagenda para daqui a 1 dia.
      await admin.from("outreach_messages").update({ status: "approved" }).eq("id", row.message_id);
      await admin.rpc("automation_enqueue_service", {
        p_organization_id: organizationId, p_job_type: "send_outreach", p_entity_type: "message",
        p_entity_id: row.message_id, p_dedup_key: `outreach_approved:${row.message_id}:${Date.now()}`,
        p_scheduled_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), p_priority: 20,
      });
      return "skipped";
    }
  }

  // Reutiliza o mesmo token (a mensagem já o tinha).
  const step = {
    enrollment_id: row.enrollment_id, company_id: row.company_id, prospect_id: row.prospect_id,
    campaign_id: "", next_step: row.step_position, to_email: row.to_email,
    subject: row.subject, body: row.body, is_last: false,
  };
  return await deliverMessage(admin, organizationId, settings, row.message_id, step, row.token);
}

/**
 * Efetiva o envio via Resend e avança a sequência. Partilhado pelos dois caminhos.
 */
async function deliverMessage(
  admin: SupabaseClient,
  organizationId: string,
  settings: Settings,
  messageId: string,
  step: { enrollment_id: string; company_id: string; prospect_id: string; next_step: number; to_email: string; subject: string; body: string; is_last: boolean },
  token: string,
): Promise<"sent"> {
  const unsubscribeUrl = `${FUNCTIONS_URL}/email-unsubscribe?token=${token}`;
  const trackingPixel = `${FUNCTIONS_URL}/email-track?token=${token}&e=open`;
  const html = renderHtml(step.body, unsubscribeUrl, trackingPixel);

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  // Reply-To com token (reply+TOKEN@dominio): permite correlacionar a resposta
  // com o prospect no inbound-email. Deriva o domínio do remetente.
  const fromDomain = emailDomain(SENDER_FROM.replace(/.*<|>.*/g, "")) || "adjudata.pt";
  const replyTo = `reply+${token}@${fromDomain}`;
  const resend = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SENDER_FROM, to: [step.to_email], subject: step.subject, html, reply_to: replyTo }),
  });

  if (!resend.ok) {
    const providerError = await resend.text();
    await admin.from("outreach_messages").update({ status: "failed", error: providerError.slice(0, 500) }).eq("id", messageId);
    throw new Error(`Resend falhou: ${providerError}`);
  }
  const resendResult = await resend.json();

  await admin.from("outreach_messages")
    .update({ status: "sent", provider_message_id: resendResult?.id ?? null, sent_at: new Date().toISOString() })
    .eq("id", messageId);

  const domain = emailDomain(step.to_email);
  const gapDays = asInt(settings["autopilot_followup_gap_days"], 4);
  await admin.from("outreach_enrollments").update({
    current_step: step.next_step,
    last_sent_at: new Date().toISOString(),
    next_send_at: new Date(Date.now() + gapDays * 24 * 3600 * 1000).toISOString(),
    status: "active",
    updated_at: new Date().toISOString(),
  }).eq("id", step.enrollment_id);

  await admin.rpc("outreach_register_send", { p_organization_id: organizationId, p_domain: domain });
  await admin.rpc("automation_record_email_event", { p_token: token, p_event_type: "sent" });
  await admin.rpc("automation_mark_contacted_service", {
    p_prospect_id: step.prospect_id,
    p_state: step.next_step <= 1 ? "contacted" : `followup_${step.next_step - 1}`,
    p_to_email: step.to_email,
    p_subject: step.subject,
    p_step_position: step.next_step,
  });
  await admin.rpc("automation_log", {
    p_level: "info", p_step: "outreach_sent",
    p_message: `enviado para ${step.to_email} (passo ${step.next_step})`,
    p_metadata: { enrollment_id: step.enrollment_id, message_id: messageId },
  });

  void SITE_URL;
  return "sent";
}
