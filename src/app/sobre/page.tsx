import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, Eye, ShieldCheck, Target } from "lucide-react";
import PublicPage from "@/components/PublicPage";

export const metadata: Metadata = {
  title: "Sobre nós",
  description: "Conhece o Radar B2B e a forma como transformamos dados públicos em inteligência comercial.",
};

const principles = [
  { icon: Database, title: "Dados públicos, contexto útil", text: "Organizamos informação pública de contratação para que equipas comerciais encontrem sinais relevantes com menos trabalho manual." },
  { icon: Target, title: "Foco em decisão", text: "Pesquisa, histórico, concorrência e alertas existem para apoiar decisões concretas, não para substituir o julgamento da tua equipa." },
  { icon: Eye, title: "Transparência", text: "Indicamos a origem BASE, as datas disponíveis e os limites dos dados. O Radar B2B não promete informação em tempo real." },
];

export default function AboutPage() {
  return (
    <PublicPage>
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Sobre o Radar B2B</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Mais contexto para vender ao mercado público.</h1>
        <p className="mt-6 text-lg leading-8 text-slate-400">O Radar B2B é uma plataforma de inteligência comercial dedicada à contratação pública portuguesa. Reunimos procedimentos, contratos, entidades e empresas num espaço de pesquisa feito para equipas B2B.</p>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {principles.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><Icon className="text-cyan-300" size={21} /><h2 className="mt-5 font-semibold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></article>)}
      </div>
      <section className="mt-12 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={21} /><div><h2 className="font-semibold text-white">Uma ferramenta de apoio, não uma promessa de resultado</h2><p className="mt-2 text-sm leading-6 text-slate-400">A informação deve ser confirmada na fonte oficial e avaliada à luz das regras do procedimento. O Radar B2B apoia prospeção e análise, mas não garante adjudicações, elegibilidade ou atualização instantânea.</p></div></div></section>
      <Link href="/pesquisa" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">Explorar a pesquisa <ArrowRight size={16} /></Link>
    </PublicPage>
  );
}
