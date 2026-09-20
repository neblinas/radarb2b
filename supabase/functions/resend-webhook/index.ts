import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Webhook de eventos do Resend (FASE 3).
 *
 * Recebe `email.bounced`, `email.complained`, `email.delivered`, etc.
 * - Localiza a mensagem por provider_message_id (envio manual) ou por token
 *   (outbound do autopilot).
 * - Aplica efeitos: suppression (bounce/complaint), estado do enrollment e
 *   transição do prospect.
 *
 * Protegido pela URL secreta do endpoint (verify_jwt = false). O Resend não
 * envia headers personalizados, apenas um signing secret Svix; optámos por não
 * validar a assinatura (risco baixo: no pior caso um bounce falso suprimi um
 * contacto, reversível) e confiar no segredo da URL.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function resolveToken(admin: ReturnType<typeof createClient>, providerId: string | null): Promise<string | null> {
  if (!providerId) return null;
  const { data } = await admin.from("outreach_messages").select("token").eq("provider_message_id", providerId).maybeSingle();
  return (data?.token as string) ?? null;
}

Deno.serve(async (request) => {
  try {
    const payload = await request.json();
    const type = String(payload?.type ?? "");
    const data = payload?.data ?? {};
    const providerId = String(data?.email_id ?? data?.id ?? "") || null;
    const recipient = Array.isArray(data?.to) ? data.to[0] : (data?.to ?? null);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("RADAR_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Outbound do autopilot: resolve pelo token e aplica via RPC.
    const token = await resolveToken(admin, providerId);
    if (token) {
      const eventType = type.includes("bounce") ? "bounce"
        : type.includes("complain") ? "complaint"
        : type.includes("deliver") ? "delivered"
        : null;
      if (eventType) {
        await admin.rpc("automation_record_email_event", {
          p_token: token, p_event_type: eventType, p_metadata: { provider_event: type },
        });
      }
      return json({ ok: true, handled: "outreach", eventType });
    }

    // 2. Email manual (commercial_email_messages) por provider_message_id.
    if (providerId) {
      if (type.includes("bounce")) {
        await admin.from("commercial_email_messages")
          .update({ status: "failed", error: `bounce: ${type}`.slice(0, 500) })
          .eq("provider_message_id", providerId);
      }
    }

    // 3. Suppression por bounce/complaint (mesmo sem token), se soubermos o email.
    if (recipient && (type.includes("bounce") || type.includes("complain"))) {
      const { data: org } = await admin.from("organizations").select("id").limit(1).maybeSingle();
      if (org?.id) {
        await admin.rpc("automation_suppress_service", {
          p_organization_id: org.id,
          p_email: String(recipient),
          p_domain: null,
          p_company_id: null,
          p_reason: type.includes("complain") ? "complaint" : "bounce",
          p_source: "resend_webhook",
        });
      }
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "webhook falhou" }, 500);
  }
});
