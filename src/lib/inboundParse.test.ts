import { describe, expect, it } from "vitest";
import {
  classifyDeterministic,
  isAutoSubmitted,
  shouldAutoReply,
  stripQuotedReply,
} from "./inboundParse";

describe("inbound classification (deterministic)", () => {
  it("deteta unsubscribe (terminal, alta confiança)", () => {
    const r = classifyDeterministic("olá", "Por favor cancelem a subscrição. Não quero receber mais emails.");
    expect(r.classification).toBe("unsubscribe");
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it("deteta unsubscribe com 'remover da lista'", () => {
    expect(classifyDeterministic("", "Podem remover-me da lista de contactos?").classification).toBe("unsubscribe");
  });

  it("deteta bounce", () => {
    expect(classifyDeterministic("", "Delivery has failed. Mailbox full.").classification).toBe("bounce");
  });

  it("deteta out-of-office", () => {
    expect(classifyDeterministic("Ausência", "Estou fora do escritório até 2 de maio.").classification).toBe("out_of_office");
  });

  it("deteta contacto errado", () => {
    expect(classifyDeterministic("", "Já não trabalho aqui, o meu colega é o responsável.").classification).toBe("wrong_contact");
  });

  it("deteta não interessado", () => {
    expect(classifyDeterministic("", "Obrigado, mas não temos interesse.").classification).toBe("not_interested");
  });

  it("deteta pergunta de preço", () => {
    expect(classifyDeterministic("", "Quanto custa o plano anual?").classification).toBe("pricing_question");
  });

  it("deteta pedido de demo", () => {
    expect(classifyDeterministic("", "Podemos agendar uma demonstração?").classification).toBe("wants_demo");
  });

  it("deteta trial", () => {
    expect(classifyDeterministic("", "Gostaria de experimentar antes de decidir.").classification).toBe("wants_trial");
  });

  it("deteta interesse genérico", () => {
    expect(classifyDeterministic("", "Tenho interesse no vosso serviço.").classification).toBe("interested");
  });

  it("devolve null quando não consegue decidir (candidato a IA)", () => {
    const r = classifyDeterministic("Re: proposta", "Segue em anexo o documento solicitado.");
    expect(r.classification).toBeNull();
    expect(r.confidence).toBe(0);
  });

  it("unsubscribe tem prioridade sobre interesse", () => {
    const r = classifyDeterministic("", "Tenho interesse mas podem cancelar a subscrição e não me contactar mais.");
    expect(r.classification).toBe("unsubscribe");
  });

  it("ignora o texto citado da resposta anterior", () => {
    const body = "Sim, podemos falar.\n\n> Em 1 de maio escreveu:\n> Não quero receber mais emails.";
    // O "unsubscribe" está citado e não deve contar; "podemos falar" indica interesse.
    const r = classifyDeterministic("Re:", body);
    expect(r.classification).not.toBe("unsubscribe");
  });
});

describe("stripQuotedReply", () => {
  it("corta em linhas com >", () => {
    expect(stripQuotedReply("Linha 1\n> citado\nLinha 2")).toBe("Linha 1");
  });

  it("corta em 'On ... wrote:'", () => {
    expect(stripQuotedReply("Resposta\nOn Mon, X wrote:\ncitado")).toBe("Resposta");
  });

  it("corta em 'Em ... escreveu:'", () => {
    expect(stripQuotedReply("Resposta\nEm 1 de maio escreveu:\ncitado")).toBe("Resposta");
  });
});

describe("auto-reply policy", () => {
  it("nunca auto-responde a unsubscribe/bounce/out_of_office", () => {
    expect(shouldAutoReply("unsubscribe", 99, 80)).toBe(false);
    expect(shouldAutoReply("bounce", 99, 80)).toBe(false);
    expect(shouldAutoReply("out_of_office", 99, 80)).toBe(false);
  });

  it("não auto-responde a needs_human/wrong_contact", () => {
    expect(shouldAutoReply("needs_human", 99, 80)).toBe(false);
    expect(shouldAutoReply("wrong_contact", 99, 80)).toBe(false);
  });

  it("auto-responde só acima da confiança mínima", () => {
    expect(shouldAutoReply("interested", 80, 80)).toBe(true);
    expect(shouldAutoReply("interested", 79, 80)).toBe(false);
  });
});

describe("isAutoSubmitted", () => {
  it("deteta cabeçalhos de auto-reply", () => {
    expect(isAutoSubmitted({ "auto-submitted": "auto-replied" })).toBe(true);
    expect(isAutoSubmitted({ precedence: "bulk" })).toBe(true);
    expect(isAutoSubmitted({ "x-autoreply": "yes" })).toBe(true);
    expect(isAutoSubmitted({ "auto-submitted": "no" })).toBe(false);
    expect(isAutoSubmitted({})).toBe(false);
  });
});
