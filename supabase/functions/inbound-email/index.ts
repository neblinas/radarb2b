import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Inbound — receção e classificação de respostas (FASE 4).
 *
 * Endpoint PÚBLICO (verify_jwt=false) pensado para:
 *   (a) webhook de inbound do Resend; ou
 *   (b) bridge IMAP que faça POST com o mesmo esquema.
 *
 * Fluxo:
 *   1. valida segredo partilhado;
 *   2. extrai remetente/assunto/corpo e o token (reply+TOKEN@dominio);
 *   3. evita loops (auto-reply headers);
 *   4. registra a mensagem (dedup por Message-ID);
 *   5. classifica: REGRAS primeiro; IA só se habilitada, dentro do orçamento e
 *      quando as regras não decidem;
 *   6. aplica transição de estado e (opcional) auto-reply.
 *
 * Compliance: unsubscribe/bounce são ações locais — nunca dependem de LLM.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const SITE_URL = Deno.env.get("SITE_URL") || "https://adjudata.pt";
const SENDER_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "Adjudata <comercial@adjudata.pt>";

type Classification =
  | "interested" | "not_interested" | "unsubscribe" | "wants_demo" | "wants_trial"
  | "pricing_question" | "product_question" | "objection" | "wrong_contact"
  | "out_of_office" | "bounce" | "needs_human";

// ---------------------------------------------------------------------------
// Classificação determinística (espelha web/src/lib/inboundParse.ts)
// ---------------------------------------------------------------------------
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
function stripQuoted(body: string): string {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*On .+ wrote:\s*$/i.test(line)) break;
    if (/^\s*Em .+ escreveu:\s*$/i.test(line)) break;
    if (/^\s*De:\s/i.test(line) || /^\s*From:\s/i.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}
function any(text: string, patterns: RegExp[]): boolean { return patterns.some((re) => re.test(text)); }

const P = {
  unsubscribe: [/\bcancelar\b.*\b(subscri|inscri|receb)/, /\bremover\b.*\b(lista|contactos|emails)\b/, /\bnao me contactem\b/, /\bpare(m)? de (enviar|contactar|mandar)\b/, /\bunsubscribe\b/, /\bopt[ -]?out\b/, /\bremove me\b/, /\bstop (emailing|contacting|sending)\b/, /\bdo not contact\b/],
  out_of_office: [/\bausencia\b/, /\bfora do escritorio\b/, /\bout of (the )?office\b/, /\bauto[ -]?reply\b/, /\bresposta automatica\b/, /\bferias\b/, /\bvacation\b/, /\bde regresso a\b/],
  bounce: [/\bmailer[ -]?daemon\b/, /\bdelivery (status notification|has failed|failure)\b/, /\bundelivered\b/, /\bmailbox (is )?full\b/, /\bno such (user|recipient|address)\b/, /\bfalha na entrega\b/, /\bmensagem nao entregue\b/, /\breturned to sender\b/],
  wrong_contact: [/\bnao (e|sou) (o|a) (responsavel|pessoa|contacto) (certo|correto|indicado)\b/, /\bno longer (work|working)\b/, /\bjá nao trabalh/, /\bja nao trabalh/, /\bnao trabalho (mais|aqui)\b/, /\bwrong (person|contact|address|department)\b/, /\bmudou de (funcoes|empresa)\b/],
  not_interested: [/\bnao (tenho|estou|temos|estamos) interess/, /\bsem interesse\b/, /\bnao (e|sera) (necessario|relevante)\b/, /\bnao obrigado\b/, /\bnot interested\b/, /\bja temos (solucao|fornecedor|parceiro)\b/],
  pricing: [/\bprec(o|os)\b/, /\bquanto (custa|e|vale)\b/, /\bcusto(s)?\b/, /\btarifario\b/, /\borcamento\b/, /\bpricing\b/],
  demo: [/\bdemonstracao\b/, /\bdemo\b/, /\bapresentacao\b/, /\bchamada\b/, /\bmeeting\b/, /\bagendar (uma )?(reuniao|call|chamada)\b/],
  trial: [/\btest(e|ar)\b/, /\btrial\b/, /\bexperimentar\b/, /\bversao de teste\b/, /\bprovar\b/],
  interested: [/\btenho interesse\b/, /\bestou interessado\b/, /\bmuito interessante\b/, /\bvamos (avançar|falar|marcar)\b/, /\bpodemos (falar|agendar|marcar|conversar)\b/, /\bsim,?\s*(quero|pretendo|estou)\b/, /\bi[' ]?m interested\b/],
};

function classifyDeterministic(subject: string, body: string): { classification: Classification | null; confidence: number } {
  const text = normalize(`${subject}\n${stripQuoted(body)}`);
  if (any(text, P.unsubscribe)) return { classification: "unsubscribe", confidence: 98 };
  if (any(text, P.bounce)) return { classification: "bounce", confidence: 95 };
  if (any(text, P.out_of_office)) return { classification: "out_of_office", confidence: 90 };
  if (any(text, P.wrong_contact)) return { classification: "wrong_contact", confidence: 80 };
  if (any(text, P.not_interested)) return { classification: "not_interested", confidence: 85 };
  if (any(text, P.pricing)) return { classification: "pricing_question", confidence: 75 };
  if (any(text, P.demo)) return { classification: "wants_demo", confidence: 78 };
  if (any(text, P.trial)) return { classification: "wants_trial", confidence: 75 };
  if (any(text, P.interested)) return { classification: "interested", confidence: 80 };
  return { classification: null, confidence: 0 };
}

function stateFor(classification: Classification): string {
  switch (classification) {
    case "unsubscribe": return "unsubscribed";
    case "not_interested": return "not_interested";
    case "wrong_contact": return "human_review";
    case "out_of_office": return "contacted";
    case "bounce": return "bounced";
    case "needs_human": return "human_review";
    case "interested": case "wants_demo": case "wants_trial": return "interested";
    default: return "replied";
  }
}

const ALLOWED: Classification[] = ["interested","not_interested","unsubscribe","wants_demo","wants_trial","pricing_question","product_question","objection","wrong_contact","out_of_office","bounce","needs_human"];

// ---------------------------------------------------------------------------
// IA (opcional)
// ---------------------------------------------------------------------------
async function classifyWithAI(
  admin: SupabaseClient,
  organizationId: string,
  subject: string,
  body: string,
  apiKey: string,
): Promise<{ classification: Classification | null; confidence: number; model: string; inputTokens: number; outputTokens: number }> {
  const model = "gpt-4o-mini";
  const prompt = `Classifica a resposta de email comercial numa destas categorias: ${ALLOWED.join(", ")}.
Responde APENAS com JSON: {"classification":"...","confidence":0-100}.
Assunto: ${subject}
Corpo: ${body.slice(0, 4000)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    return { classification: null, confidence: 0, model, inputTokens: 0, outputTokens: 0 };
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  const inputTokens = Number(data?.usage?.prompt_tokens ?? 0);
  const outputTokens = Number(data?.usage?.completion_tokens ?? 0);

  let classification: Classification | null = null;
  let confidence = 0;
  try {
    const parsed = JSON.parse(content);
    if (ALLOWED.includes(parsed.classification)) classification = parsed.classification;
    confidence = Math.max(0, Math.min(100, Number(parsed.confidence ?? 0)));
  } catch { /* ignora */ }

  await admin.rpc("ai_usage_register", {
    p_organization_id: organizationId, p_purpose: "classify", p_model: model,
    p_input_tokens: inputTokens, p_output_tokens: outputTokens,
  });

  return { classification, confidence, model, inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get("INBOUND_WEBHOOK_SECRET");
  if (expectedSecret && request.headers.get("x-inbound-secret") !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("RADAR_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = await request.json();
    // Aceita o esquema do Resend inbound e um esquema genérico (bridge IMAP).
    const fromEmail = String(payload.from ?? payload.from_email ?? "").match(/<([^>]+)>/)?.[1] ?? String(payload.from ?? payload.from_email ?? "");
    const toEmail = String(payload.to ?? payload.to_email ?? "");
    const subject = String(payload.subject ?? "");
    const bodyText = String(payload.text ?? payload.body_text ?? "");
    const bodyHtml = String(payload.html ?? payload.body_html ?? "");
    const messageId = payload.message_id ?? payload.messageId ?? null;
    const inReplyTo = payload.in_reply_to ?? payload.inReplyTo ?? null;
    const headers = (payload.headers ?? {}) as Record<string, string | undefined>;

    if (!fromEmail || (!bodyText && !bodyHtml)) {
      return json({ error: "payload inválido" }, 400);
    }

    // Loop guard: ignora auto-replies/bounces gerados por nós.
    const autoSubmitted = (headers["auto-submitted"] || "").toLowerCase();
    const precedence = (headers["precedence"] || "").toLowerCase();
    if ((autoSubmitted && autoSubmitted !== "no") || precedence === "auto_reply") {
      return json({ ok: true, skipped: "auto_submitted" });
    }

    // Token via reply+TOKEN@dominio
    const replyToken = toEmail.match(/reply\+([A-Za-z0-9]+)@/)?.[1] ?? null;

    const { data: org } = await admin.from("organizations").select("id").limit(1).maybeSingle();
    const organizationId = org?.id as string | undefined;
    if (!organizationId) return json({ error: "Organização não encontrada" }, 400);

    const { data: messageRows, error: messageError } = await admin.rpc("inbound_record_message_service", {
      p_organization_id: organizationId,
      p_from_email: fromEmail,
      p_to_email: toEmail,
      p_subject: subject,
      p_body_text: bodyText,
      p_body_html: bodyHtml,
      p_message_id: messageId,
      p_in_reply_to: inReplyTo,
      p_reply_token: replyToken,
      p_raw: payload,
    });
    if (messageError) throw messageError;
    const recorded = (Array.isArray(messageRows) ? messageRows[0] : messageRows) as { message_id: string; inserted: boolean } | null;
    if (!recorded) return json({ error: "falha ao registar" }, 500);
    if (recorded.inserted === false) return json({ ok: true, skipped: "duplicate" });

    // Flags + fila de IA.
    const { data: settingsRows } = await admin.from("app_settings").select("key,value").eq("organization_id", organizationId);
    const settings: Record<string, unknown> = {};
    for (const row of (settingsRows ?? []) as { key: string; value: unknown }[]) settings[row.key] = row.value;
    const killSwitch = settings["autopilot_kill_switch"] === true;
    const aiEnabled = settings["autopilot_ai_enabled"] === true;

    // 1. Regras primeiro.
    let result = classifyDeterministic(subject, bodyText || bodyHtml);
    let method: "deterministic" | "ai" = "deterministic";
    let rationale = "classificação por regras";

    // 2. IA só se necessário, habilitada e dentro do orçamento.
    if (!killSwitch && result.classification === null && aiEnabled) {
      const aiKey = Deno.env.get("OPENAI_API_KEY");
      if (aiKey) {
        const { data: withinBudget } = await admin.rpc("ai_usage_within_budget", { p_organization_id: organizationId, p_max_calls: null });
        if (withinBudget === true) {
          const ai = await classifyWithAI(admin, organizationId, subject, bodyText || bodyHtml, aiKey);
          if (ai.classification) {
            result = { classification: ai.classification, confidence: ai.confidence };
            method = "ai";
            rationale = `classificação por IA (${ai.model})`;
          }
        }
      }
    }

    // 3. Fallback final: revisão humana.
    const classification: Classification = result.classification ?? "needs_human";
    const confidence = result.confidence;

    await admin.rpc("inbound_record_classification_service", {
      p_organization_id: organizationId,
      p_message_id: recorded.message_id,
      p_classification: classification,
      p_confidence: confidence,
      p_method: method,
      p_rationale: rationale,
      p_target_state: stateFor(classification),
    });

    // 4. Auto-reply opcional, conservador.
    let autoReplied = false;
    const minConfidence = Number(settings["autopilot_ai_reply_confidence"] ?? 80);
    if (!killSwitch && settings["auto_reply_enabled"] === true
        && classification !== "unsubscribe" && classification !== "bounce"
        && classification !== "out_of_office" && classification !== "needs_human"
        && classification !== "wrong_contact" && confidence >= minConfidence) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px">
<p>Obrigado pelo seu contacto. Recebemos a sua mensagem e vamos responder com detalhe em breve.</p>
<p style="color:#64748b;font-size:12px">Adjudata · <a href="${SITE_URL}">adjudata.pt</a></p></div>`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: SENDER_FROM, to: [fromEmail], subject: `Re: ${subject}`, html }),
        });
        autoReplied = true;
      }
    }

    return json({ ok: true, classification, confidence, method, autoReplied });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "inbound falhou" }, 500);
  }
});
