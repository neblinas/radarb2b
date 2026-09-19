import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Sender único (Opção A). A individualidade está na assinatura.
const SENDER_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "Adjudata <comercial@adjudata.pt>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://adjudata.pt";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const allowedRoles = new Set(["admin", "commercial_manager", "commercial"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Converte o texto simples (com quebras de linha) em HTML e acrescenta a assinatura. */
function renderBody(body: string, sender: { display_name: string; reply_to: string | null; signature_note: string }) {
  const paragraphs = escapeHtml(body.trim())
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  const contact = sender.reply_to
    ? `Contacto: <a href="mailto:${escapeHtml(sender.reply_to)}">${escapeHtml(sender.reply_to)}</a> · `
    : "";

  const signature = `
    <p>Com os melhores cumprimentos,<br/><strong>${escapeHtml(sender.display_name)}</strong><br/>
    ${contact}<a href="${SITE_URL}">adjudata.pt</a></p>
    <p style="color:#64748b;font-size:12px">${escapeHtml(sender.signature_note)}</p>`;

  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">
${paragraphs}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
${signature}
</div>`;
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    if (!supabaseUrl || !anonKey || !resendApiKey) throw new Error("Supabase function secrets are not configured");

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    // Client com o JWT do utilizador: as RPCs validam role/org internamente.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: actor } } = await userClient.auth.getUser();
    const actorRole = typeof actor?.app_metadata?.role === "string" ? actor.app_metadata.role : "";
    if (!actor) throw new Error("Not authenticated");

    // Aceita qualquer role CRM (members via organization_members podem não ter app_metadata.role).
    const { data: isCrm, error: roleError } = await userClient.rpc("crm_has_role", {});
    if (roleError) throw roleError;
    if (isCrm !== true && !allowedRoles.has(actorRole)) throw new Error("CRM access denied");

    const payload = await request.json();
    const to = String(payload.to || "").trim();
    const subject = String(payload.subject || "").trim();
    const body = String(payload.body || "").trim();
    const cc = payload.cc ? String(payload.cc).trim() : null;
    const companyId = payload.company_id ? String(payload.company_id) : null;
    const clientUserId = payload.client_user_id ? String(payload.client_user_id) : null;
    const prospectId = payload.prospect_id ? String(payload.prospect_id) : null;

    if (!EMAIL_RE.test(to)) throw new Error("Destinatário inválido");
    if (subject.length < 2) throw new Error("Assunto demasiado curto");
    if (body.length < 5) throw new Error("Mensagem demasiado curta");
    if (cc && !EMAIL_RE.test(cc)) throw new Error("CC inválido");

    // Identidade de envio (assinatura) — cria se não existir.
    const { data: senderData, error: senderError } = await userClient.rpc("commercial_ensure_sender");
    if (senderError || !senderData) throw senderError || new Error("Could not resolve sender");
    const sender = Array.isArray(senderData) ? senderData[0] : senderData;

    const renderedBody = renderBody(body, {
      display_name: sender.display_name,
      reply_to: sender.reply_to,
      signature_note: sender.signature_note,
    });

    // Log inicial (queued) para histórico mesmo em caso de falha.
    const { data: logged, error: logError } = await userClient.rpc("commercial_log_email", {
      p_to_email: to,
      p_subject: subject,
      p_body: body,
      p_rendered_body: renderedBody,
      p_status: "queued",
      p_company_id: companyId,
      p_client_user_id: clientUserId,
      p_prospect_id: prospectId,
    });
    if (logError) throw logError;
    const message = Array.isArray(logged) ? logged[0] : logged;

    // Envio via Resend.
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: SENDER_FROM,
        to: [to],
        ...(cc ? { cc: [cc] } : {}),
        ...(sender.reply_to ? { reply_to: sender.reply_to } : {}),
        subject,
        html: renderedBody,
      }),
    });

    // O service role atualiza o estado final (não exposto ao utilizador).
    const serviceRoleKey = Deno.env.get("RADAR_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (!resendResponse.ok) {
      const providerError = await resendResponse.text();
      await adminClient
        .from("commercial_email_messages")
        .update({ status: "failed", error: providerError.slice(0, 500) })
        .eq("id", message.id);
      throw new Error(`Resend falhou: ${providerError}`);
    }

    const resendResult = await resendResponse.json();
    await adminClient
      .from("commercial_email_messages")
      .update({ status: "sent", provider_message_id: resendResult?.id ?? null, sent_at: new Date().toISOString() })
      .eq("id", message.id);

    return new Response(
      JSON.stringify({ ok: true, id: message.id, provider_message_id: resendResult?.id ?? null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Email failed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
