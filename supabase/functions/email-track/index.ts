import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Tracking de abertura/clique (FASE 3).
 *
 * Endpoint PÚBLICO (verify_jwt=false). Recebe `token` e `e` (type).
 * - `open`: devolve um pixel GIF transparente (1x1) e registra evento.
 * - `click`: redireciona para `url` (validado) e registra evento.
 *
 * Nunca expõe dados; apenas registra. Robusto: falhas de registo não quebram
 * a resposta ao lead (o pixel/redirect acontece sempre).
 */

const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function pixelResponse() {
  return new Response(PIXEL, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

function isSafeRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const eventType = url.searchParams.get("e") ?? "open";
  const target = url.searchParams.get("url");

  // Registo best-effort: nunca bloqueia a resposta visual.
  if (token) {
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("RADAR_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const ua = request.headers.get("user-agent");
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const type = eventType === "click" ? "click" : "open";
      await admin.rpc("automation_record_email_event", {
        p_token: token,
        p_event_type: type,
        p_url: type === "click" ? target : null,
        p_user_agent: ua,
        p_ip: ip,
        p_metadata: {},
      });
    } catch {
      // silencioso
    }
  }

  if (eventType === "click") {
    if (target && isSafeRedirect(target)) return Response.redirect(target, 302);
    return new Response("ok", { status: 200 });
  }
  return pixelResponse();
});
