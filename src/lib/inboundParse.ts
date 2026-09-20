/**
 * Inbound — parsing e classificação (puro, determinístico, testável).
 *
 * Regra de ouro: ações críticas de compliance e casos óbvios são resolvidos por
 * REGRAS, nunca por IA. A IA só é considerada quando as regras não decidem,
 * e mesmo aí com confiança mínima configurável.
 */

export type ReplyClassification =
  | "interested"
  | "not_interested"
  | "unsubscribe"
  | "wants_demo"
  | "wants_trial"
  | "pricing_question"
  | "product_question"
  | "objection"
  | "wrong_contact"
  | "out_of_office"
  | "bounce"
  | "needs_human";

export type DeterministicResult = {
  classification: ReplyClassification | null;
  confidence: number;
  method: "deterministic";
  rationale: string;
};

/** Normaliza texto para comparação (minúsculas, sem acentos, espaços colapsados). */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai o corpo de texto, removendo a parte citada (linhas com ">", "On ... wrote:"). */
export function stripQuotedReply(body: string): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*On .+ wrote:\s*$/i.test(line)) break;
    if (/^\s*Em .+ escreveu:\s*$/i.test(line)) break;
    if (/^\s*De:\s/i.test(line) || /^\s*From:\s/i.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

const UNSUBSCRIBE_PATTERNS = [
  /\bcancelar\b.*\b(subscri|inscri|receb)/,
  /\bremover\b.*\b(lista|contactos|emails)\b/,
  /\bnao\b.{0,10}\b(quero|desejo|pretendo)\b.{0,20}\b(receber|contactos|emails)\b/,
  /\bnao me contactem\b/,
  /\bpare(m)? de (enviar|contactar|mandar)\b/,
  /\bdeixem? de me contactar\b/,
  /\bunsubscribe\b/,
  /\bopt[ -]?out\b/,
  /\bremove me\b/,
  /\bstop (emailing|contacting|sending)\b/,
  /\bdo not contact\b/,
];

const OUT_OF_OFFICE_PATTERNS = [
  /\bausencia\b/,
  /\bfora do escritorio\b/,
  /\bout of (the )?office\b/,
  /\bauto[ -]?reply\b/,
  /\bresposta automatica\b/,
  /\bferias\b/,
  /\bvacation\b/,
  /\bde regresso a\b/,
  /\bregress(o|arei) (a|em)\b/,
];

const BOUNCE_PATTERNS = [
  /\bmailer[ -]?daemon\b/,
  /\bdelivery (status notification|has failed|failure)\b/,
  /\bundelivered\b/,
  /\bmailbox (is )?full\b/,
  /\bno such (user|recipient|address)\b/,
  /\bfalha na entrega\b/,
  /\bmensagem nao entregue\b/,
  /\breturned to sender\b/,
];

const WRONG_CONTACT_PATTERNS = [
  /\bnao (e|sou) (o|a) (responsavel|pessoa|contacto) (certo|correto|indicado)\b/,
  /\bno longer (work|working)\b/,
  /\bjá nao trabalh/,
  /\bja nao trabalh/,
  /\bnao trabalho (mais|aqui)\b/,
  /\bwrong (person|contact|address|department)\b/,
  /\bmudou de (funcoes|empresa)\b/,
];

const INTERESTED_PATTERNS = [
  /\btenho interesse\b/,
  /\bestou interessado\b/,
  /\bmuito interessante\b/,
  /\bvamos (avançar|falar|marcar)\b/,
  /\bpodemos (falar|agendar|marcar|conversar)\b/,
  /\bquer(o|emos) (saber|agendar|marcar)\b/,
  /\bsim,?\s*(quero|pretendo|estou)\b/,
  /\bi[' ]?m interested\b/,
];

const DEMO_PATTERNS = [
  /\bdemonstracao\b/,
  /\bdemo\b/,
  /\bapresentacao\b/,
  /\bchamada\b/,
  /\bmeeting\b/,
  /\bagendar (uma )?(reuniao|call|chamada)\b/,
];

const TRIAL_PATTERNS = [
  /\btest(e|ar)\b/,
  /\btrial\b/,
  /\bexperimentar\b/,
  /\bversao de teste\b/,
  /\bprovar\b/,
];

const PRICING_PATTERNS = [
  /\bprec(o|os)\b/,
  /\bquanto (custa|e|vale)\b/,
  /\bcusto(s)?\b/,
  /\btarifario\b/,
  /\borcamento\b/,
  /\bvalor(es)?\b.{0,15}\b(anual|mensal|subscricao)\b/,
  /\bpricing\b/,
  /\bplanos?\b.{0,15}\b(preco|custo|valor)\b/,
];

const NOT_INTERESTED_PATTERNS = [
  /\bnao (tenho|estou|temos|estamos) interess/,
  /\bsem interesse\b/,
  /\bnao (e|sera) (necessario|relevante)\b/,
  /\bnao obrigado\b/,
  /\bnot interested\b/,
  /\bja temos (solucao|fornecedor|parceiro)\b/,
];

function matches(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

/**
 * Classificação determinística. Devolve `null` quando não consegue decidir com
 * confiança suficiente (candidato a IA ou a revisão humana).
 *
 * Ordem importa: unsubscribe e bounce são terminais e têm prioridade máxima.
 */
export function classifyDeterministic(subject: string, body: string): DeterministicResult {
  const text = normalizeText(`${subject}\n${stripQuotedReply(body)}`);

  if (matches(text, UNSUBSCRIBE_PATTERNS)) {
    return { classification: "unsubscribe", confidence: 98, method: "deterministic", rationale: "pedido de cancelamento detetado" };
  }
  if (matches(text, BOUNCE_PATTERNS)) {
    return { classification: "bounce", confidence: 95, method: "deterministic", rationale: "notificação de bounce detetada" };
  }
  if (matches(text, OUT_OF_OFFICE_PATTERNS)) {
    return { classification: "out_of_office", confidence: 90, method: "deterministic", rationale: "resposta automática de ausência" };
  }
  if (matches(text, WRONG_CONTACT_PATTERNS)) {
    return { classification: "wrong_contact", confidence: 80, method: "deterministic", rationale: "contacto errado/desatualizado" };
  }
  if (matches(text, NOT_INTERESTED_PATTERNS)) {
    return { classification: "not_interested", confidence: 85, method: "deterministic", rationale: "recusa explícita" };
  }
  if (matches(text, PRICING_PATTERNS)) {
    return { classification: "pricing_question", confidence: 75, method: "deterministic", rationale: "pergunta sobre preço" };
  }
  if (matches(text, DEMO_PATTERNS)) {
    return { classification: "wants_demo", confidence: 78, method: "deterministic", rationale: "pedido de demonstração/reunião" };
  }
  if (matches(text, TRIAL_PATTERNS)) {
    return { classification: "wants_trial", confidence: 75, method: "deterministic", rationale: "pedido de teste/trial" };
  }
  if (matches(text, INTERESTED_PATTERNS)) {
    return { classification: "interested", confidence: 80, method: "deterministic", rationale: "manifestação de interesse" };
  }

  // Não decidiu com segurança — candidato a IA/revisão humana.
  return { classification: null, confidence: 0, method: "deterministic", rationale: "sem regra aplicável" };
}

/**
 * Decide se podemos auto-responder com base na classificação e confiança.
 * Unsubscribe/bounce NUNCA têm auto-reply (são ações, não conversas).
 */
export function shouldAutoReply(
  classification: ReplyClassification,
  confidence: number,
  minConfidence: number,
): boolean {
  if (classification === "unsubscribe" || classification === "bounce" || classification === "out_of_office") {
    return false;
  }
  // Estados que exigem validação humana não auto-respondem.
  if (classification === "needs_human" || classification === "wrong_contact") return false;
  return confidence >= minConfidence;
}

/** Extrai tentativas de auto-reply para evitar loops (headers comuns). */
export function isAutoSubmitted(headers: Record<string, string | undefined>): boolean {
  const autoSubmitted = headers["auto-submitted"]?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headers["x-autoreply"] || headers["x-autorespond"]) return true;
  const precedence = headers["precedence"]?.toLowerCase();
  if (precedence === "auto_reply" || precedence === "bulk" || precedence === "junk") return true;
  return false;
}
