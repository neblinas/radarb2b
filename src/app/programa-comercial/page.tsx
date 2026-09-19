import type { Metadata } from "next";
import PublicPage from "@/components/PublicPage";
import { supabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Programa Comercial — Condições",
  description: "Condições do programa de comissões para comerciais do Adjudata.",
};

type ProgramTerms = {
  version: number;
  title: string;
  body: string;
  effective_from: string;
};

async function fetchTerms(): Promise<ProgramTerms | null> {
  const { data, error } = await supabase.rpc("commercial_program_terms_public");
  if (error) return null;
  const rows = (data ?? []) as ProgramTerms[];
  return rows[0] ?? null;
}

export default async function CommercialProgramPage() {
  const terms = await fetchTerms();

  return (
    <PublicPage>
      <article className="prose prose-invert max-w-3xl prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-white prose-p:text-slate-400 prose-li:text-slate-400">
        <p className="not-prose text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
          Programa comercial
        </p>
        <h1>{terms?.title || "Condições do Programa Comercial"}</h1>
        {terms ? (
          <p className="lead">
            Versão {terms.version} · em vigor desde{" "}
            {new Date(terms.effective_from).toLocaleDateString("pt-PT")}
          </p>
        ) : null}
        {terms ? (
          <pre className="not-prose whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-900/60 p-6 font-sans text-sm leading-6 text-slate-300">
            {terms.body}
          </pre>
        ) : (
          <p>
            As condições do programa ainda não estão publicadas. Contacta a equipa
            para mais informações.
          </p>
        )}
      </article>
    </PublicPage>
  );
}
