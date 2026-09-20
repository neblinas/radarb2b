import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Cancelamento de subscrição (FASE 3).
 *
 * Endpoint PÚBLICO (verify_jwt=false). Recebe `token` (via query).
 * - GET: registra o unsubscribe e devolve uma página de confirmação simples.
 * - POST (One-Click RFC 8058): registra e devolve 200 sem corpo.
 *
 * Idempotente: cancelar duas vezes é seguro.
 */

const SITE_URL = Deno.env.get("SITE_URL") || "https://adjudata.pt";

function page(title: string, message: string) {
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#0b1524;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:480px;padding:32px;text-align:center">
<h1 style="font-size:20px">${title}</h1>
<p style="color:#94a3b8;line-height:1.6">${message}</p>
<p><a href="${SITE_URL}" style="color:#22d3ee">Voltar a adjudata.pt</a></p>
</div></body></html>`;
}

async function unsubscribe(token: string | null): Promise<boolean> {
  if (!token) return false;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("RADAR_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await admin.rpc("automation_record_email_event", {
    p_token: token, p_event_type: "unsubscribe", p_metadata: { source: "unsubscribe_endpoint" },
  });
  return !error;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const ok = await unsubscribe(token);

  if (request.method === "POST") {
    return new Response(null, { status: ok ? 200 : 400 });
  }

  return new Response(
    page(
      ok ? "Subscrição cancelada" : "Não foi possível processar",
      ok
        ? "Não voltará a receber contactos comerciais da nossa parte. Obrigado pelo seu tempo."
        : "O link pode ter expirado ou ser inválido.",
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
});
