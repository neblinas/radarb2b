import type { Metadata } from "next";
import Link from "next/link";
import PublicPage from "@/components/PublicPage";
import {
  isLegalIdentityComplete,
  legalOperator,
  pendingLegalFields,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Informação legal",
  description:
    "Identificação do operador do Adjudata e informação legal, nos termos do artigo 10.º do Decreto-Lei n.º 7/2004.",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <li>
      <span className="font-medium text-white">{label}: </span>
      <span>{value || "a publicar com a designação legal definitiva"}</span>
    </li>
  );
}

export default function LegalInfoPage() {
  const complete = isLegalIdentityComplete();

  return (
    <PublicPage>
      <article className="prose prose-invert max-w-3xl prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-white prose-p:text-slate-400 prose-li:text-slate-400">
        <p className="not-prose text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
          Identificação
        </p>
        <h1>Informação legal</h1>
        <p className="lead">
          Última atualização: {legalOperator.lastUpdated}
        </p>
        <p>
          Nos termos do artigo 10.º do Decreto-Lei n.º 7/2004 (comércio
          eletrónico), disponibilizamos a identificação do prestador de serviços
          e a informação relevante sobre a utilização do Adjudata.
        </p>

        {!complete ? (
          <div
            role="note"
            className="not-prose rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm leading-6 text-amber-100"
          >
            <p className="font-semibold text-amber-200">
              Contactos em fase de finalização
            </p>
            <p className="mt-2 text-amber-100/80">
              Os contactos profissionais abaixo estão a ser configurados. Até
              estarem disponíveis, qualquer pedido pode ser dirigido através dos
              canais de suporte indicados no produto:
            </p>
            <ul className="mt-2 list-disc pl-5 text-amber-100/80">
              {pendingLegalFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <h2>Prestador de serviços</h2>
        <ul>
          <Field label="Nome comercial" value={legalOperator.brand} />
          <Field label="Titular" value={legalOperator.legalName} />
          <Field label="Forma jurídica" value={legalOperator.legalForm} />
          <Field label="NIF" value={legalOperator.nif} />
          <Field label="Estabelecimento (sede)" value={legalOperator.address} />
          <Field label="País de estabelecimento" value={legalOperator.country} />
          <Field label="Registo comercial" value={legalOperator.registry} />
        </ul>

        <h2>Contactos</h2>
        <ul>
          <Field label="Suporte" value={legalOperator.supportEmail} />
          <Field label="Privacidade e proteção de dados" value={legalOperator.privacyEmail} />
          <Field label="Resolução de litígios" value={legalOperator.disputeEmail} />
          <Field label="Encarregado de proteção de dados" value={legalOperator.dpo} />
          <Field label="Sítio" value={legalOperator.siteUrl} />
        </ul>

        <h2>Documentos aplicáveis</h2>
        <ul>
          <li><Link href="/termos">Termos de utilização</Link></li>
          <li><Link href="/privacidade">Política de privacidade</Link></li>
          <li><Link href="/cookies">Política de cookies</Link></li>
        </ul>

        <h2>Resolução de litígios de consumo</h2>
        <p>
          Em caso de litígio de consumo, o consumidor pode recorrer a uma
          entidade de resolução alternativa de litígios. A lista de entidades
          competentes está disponível no Portal do Consumidor, em{" "}
          <a
            href="https://www.consumidor.gov.pt"
            target="_blank"
            rel="noreferrer"
          >
            consumidor.gov.pt
          </a>
          , e no Portal da Justiça. Existe ainda o Livro de Reclamações
          eletrónico, disponível em{" "}
          <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noreferrer">
            livroreclamacoes.pt
          </a>
          .
        </p>

        <h2>Autoridade de controlo</h2>
        <p>
          Em matéria de proteção de dados pessoais, a autoridade de controlo
          competente em Portugal é a Comissão Nacional de Proteção de Dados
          (CNPD), em{" "}
          <a href="https://www.cnpd.pt" target="_blank" rel="noreferrer">
            cnpd.pt
          </a>
          .
        </p>
      </article>
    </PublicPage>
  );
}
