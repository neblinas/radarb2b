import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Building2,
  Check,
  CircleDollarSign,
  Gavel,
  Landmark,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: `${brand.name} — Inteligência comercial para contratação pública`,
  description:
    "Encontra oportunidades em concursos públicos, percebe quem compra e quem ganha, e organiza a tua prospeção num único espaço. Dados públicos do BASE, prontos para decidir. Começa grátis.",
  alternates: { canonical: "/" },
  openGraph: {
    title: `${brand.name} — Inteligência comercial para contratação pública`,
    description:
      "Encontra oportunidades em concursos públicos, percebe quem compra e quem ganha, e organiza a tua prospeção num único espaço. Começa grátis.",
    url: siteUrl,
    type: "website",
  },
};

const valueProps = [
  {
    icon: SearchCheck,
    title: "Encontra oportunidades antes da concorrência",
    text: "Pesquisa procedimentos por objeto, tipo, data e valor base. Chega mais depressa ao concurso certo, sem varrer sites oficiais.",
  },
  {
    icon: Landmark,
    title: "Percebe quem compra e quem ganha",
    text: "Vê entidades compradoras, adjudicatários, participantes e contratos associados. Contexto que se transforma em conversa comercial.",
  },
  {
    icon: BellRing,
    title: "Não perdes prazos nem oportunidades",
    text: "Guarda pesquisas, oportunidades e cria alertas automáticos. O Adjudata avisa-te quando aparece algo relevante.",
  },
];

const steps = [
  { n: "01", title: "Pesquisa", text: "Filtra por objeto, tipo de procedimento, datas e valores base para encontrares o que interessa." },
  { n: "02", title: "Guarda e acompanha", text: "Marca as oportunidades com maior potencial e organiza-as num espaço de trabalho próprio." },
  { n: "03", title: "Age a tempo", text: "Cria alertas e usa o contexto de entidades e concorrência para decidires com confiança." },
];

const audience = [
  { icon: Building2, title: "PME e empresas fornecedoras", text: "Para quem quer encontrar contratos públicos e abordar as entidades certas." },
  { icon: Users, title: "Equipas comerciais", text: "Para quem trata contratação pública como um canal de vendas recorrente." },
  { icon: Target, title: "Empresas de serviços", text: "Para quem precisa de perceber padrões de compra e concorrência por setor." },
];

const plans = [
  { name: "Free", price: "0 €", suffix: "para começar", features: ["50 pesquisas por mês", "10 oportunidades guardadas", "1 alerta"], featured: false },
  { name: "Starter", price: "19 €", suffix: "/ mês", features: ["200 pesquisas por mês", "100 oportunidades", "Acesso a entidades e concorrência"], featured: true },
  { name: "Pro", price: "39 €", suffix: "/ mês", features: ["Pesquisas ilimitadas", "500 oportunidades", "Contexto completo de procedimentos"], featured: false },
];

const trust = [
  { value: "BASE", label: "Fonte pública oficial de contratos públicos" },
  { value: "PT", label: "Focado no mercado português" },
  { value: "Semanal", label: "Dados atualizados regularmente" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen text-slate-100">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-800/70">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(34,211,238,0.16),transparent_42%)]" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-xs font-medium text-cyan-300">
            <Sparkles size={13} />
            Inteligência comercial para contratação pública
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Transforma dados públicos em{" "}
            <span className="text-cyan-400">oportunidades comerciais.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
            O {brand.name} ajuda a tua empresa a encontrar concursos, perceber quem compra e quem ganha, e organizar a prospeção num único espaço. Dados públicos do BASE, prontos para decidir.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
            >
              Criar conta grátis
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/pesquisa"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/50 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              Ver a pesquisa
            </Link>
          </div>

          <div className="mt-14 grid gap-6 border-t border-slate-800/70 pt-8 sm:grid-cols-3">
            {trust.map((item) => (
              <div key={item.label}>
                <p className="text-2xl font-bold text-white">{item.value}</p>
                <p className="mt-1 text-sm text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Proposta de valor */}
      <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Para quem vende ao Estado</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Menos tempo à procura. Mais tempo a vender.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {valueProps.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                  <Icon size={20} />
                </div>
                <h3 className="mt-5 font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-y border-slate-800/70 bg-[#08111f]/60">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Como funciona</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Três passos, do sinal à ação.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.n} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <span className="text-sm font-bold text-cyan-400">{step.n}</span>
                <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Para quem */}
      <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Feito para</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Quem transforma contratação pública num canal de crescimento.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {audience.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <Icon size={20} className="text-cyan-300" />
                <h3 className="mt-5 font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Planos */}
      <section className="border-t border-slate-800/70 bg-[#08111f]/60">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Planos</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Começa grátis. Cresce quando precisares.
              </h2>
            </div>
            <Link href="/planos" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
              Comparar todos os planos
              <ArrowRight size={15} />
            </Link>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  plan.featured ? "border-cyan-400/50 bg-cyan-400/[0.08]" : "border-slate-800 bg-slate-900/50"
                }`}
              >
                {plan.featured ? (
                  <span className="absolute right-5 top-5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
                    Mais escolhido
                  </span>
                ) : null}
                <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                <p className="mt-5 text-4xl font-semibold text-white">
                  {plan.price}
                  <span className="ml-1 text-sm font-normal text-slate-500">{plan.suffix}</span>
                </p>
                <ul className="mt-6 space-y-3 border-t border-slate-800 pt-6 text-sm text-slate-300">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-cyan-300" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.name === "Free" ? "/login?mode=signup" : "/planos"}
                  className={`mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    plan.featured
                      ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                      : "border border-slate-700 text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"
                  }`}
                >
                  {plan.name === "Free" ? "Começar grátis" : `Escolher ${plan.name}`}
                  <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
          <p className="mt-6 text-xs text-slate-600">Preços sem IVA. Checkout seguro processado pela Stripe.</p>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[28px] border border-cyan-500/20 bg-gradient-to-br from-cyan-400/10 to-slate-900/50 p-10 text-center sm:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.14),transparent_55%)]" />
          <div className="relative">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
              <Gavel size={26} />
            </div>
            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              A tua próxima oportunidade já está publicada.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-400">
              Cria a tua conta gratuita e começa a acompanhar o mercado público português hoje mesmo.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
              >
                Criar conta grátis
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/contacto"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/50 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
              >
                Falar com a equipa
              </Link>
            </div>
            <p className="mt-6 inline-flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck size={14} className="text-cyan-400" />
              {brand.slogan}
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/70 py-8 text-center text-xs text-slate-600">
        <p className="inline-flex items-center gap-2">
          <CircleDollarSign size={13} className="text-cyan-400/70" />
          {brand.name} · {brand.description}
        </p>
      </footer>
    </main>
  );
}
