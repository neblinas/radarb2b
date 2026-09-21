"use client";

import Link from "next/link";
import { ArrowRight, BellRing, Check, Loader2, SearchCheck, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatEuros, plans, type PaidPlanId } from "@/lib/plans";

type Billing = "monthly" | "annual";

export default function PlansPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<Billing>("monthly");
  const [processing, setProcessing] = useState<PaidPlanId | null>(null);
  const [error, setError] = useState("");

  async function selectPlan(planId: PaidPlanId) {
    setProcessing(planId);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push(`/login?next=${encodeURIComponent("/planos")}`);
      return;
    }
    const { data, error: functionError } = await supabase.functions.invoke("create-checkout-session", { body: { plan_id: planId, billing } });
    if (functionError || !data?.url) {
      setError("Não foi possível preparar o pagamento. Tenta novamente.");
      setProcessing(null);
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <main className="min-h-screen text-slate-100">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 transition hover:text-cyan-300">← Voltar ao Adjudata</Link>

        <div className="mt-12 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Planos Adjudata</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Escolhe a capacidade certa para a tua prospeção.</h1>
          <p className="mt-5 text-base leading-7 text-slate-400">Compara as funcionalidades antes de avançar. O checkout seguro só abre depois de escolheres um plano pago.</p>
        </div>

        <div className="mt-8 inline-flex rounded-xl border border-slate-800 bg-slate-900/60 p-1 text-sm" role="group" aria-label="Periodicidade de pagamento">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            aria-pressed={billing === "monthly"}
            className={`rounded-lg px-4 py-2 font-medium transition ${billing === "monthly" ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-white"}`}
          >
            Mensal
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            aria-pressed={billing === "annual"}
            className={`rounded-lg px-4 py-2 font-medium transition ${billing === "annual" ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-white"}`}
          >
            Anual <span className={billing === "annual" ? "text-slate-900" : "text-cyan-300"}>− até 15%</span>
          </button>
        </div>

        {error ? <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</div> : null}

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const isAnnual = billing === "annual";
            const showAnnual = isAnnual && plan.id !== "free" && plan.priceAnnual > 0;
            const monthlyTotal = plan.priceMonthly * 12;
            const saving = monthlyTotal - plan.priceAnnual;
            const priceValue = showAnnual ? plan.priceAnnual : plan.priceMonthly;
            const priceSuffix = showAnnual ? " / ano" : " / mês";
            return (
              <article key={plan.id} className={`relative flex flex-col rounded-2xl border p-6 ${plan.featured ? "border-cyan-400/50 bg-cyan-400/[0.08]" : "border-slate-800 bg-slate-900/60"}`}>
                {showAnnual && plan.annualDiscount > 0 ? (
                  <span className="absolute right-5 top-5 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">−{plan.annualDiscount}% anual</span>
                ) : plan.featured ? (
                  <span className="absolute right-5 top-5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">Mais escolhido</span>
                ) : null}

                <h2 className="text-xl font-semibold text-white">{plan.name}</h2>
                <p className="mt-5 text-4xl font-semibold text-white">
                  {formatEuros(priceValue)}
                  <span className="text-sm font-normal text-slate-500">{priceSuffix}</span>
                  {plan.id !== "free" ? <span className="ml-1 text-xs font-normal text-slate-500">+ IVA</span> : null}
                </p>
                {showAnnual ? (
                  <p className="mt-2 text-xs text-emerald-300">Poupa {formatEuros(saving)} por ano · equivale a {formatEuros(Math.round(plan.priceAnnual / 12))}/mês</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">{plan.id === "free" ? "Sem custos" : `Faturação mensal de ${formatEuros(plan.priceMonthly)}`}</p>
                )}

                <p className="mt-4 min-h-14 text-sm leading-6 text-slate-400">{plan.description}</p>
                                <ul className="mt-6 space-y-3 border-t border-slate-800 pt-6 text-sm text-slate-300">
                  {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-cyan-300" />{feature}</li>)}
                </ul>

                {plan.id === "free" ? (
                  <Link href="/login?mode=signup" className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200">Criar conta gratuita <ArrowRight size={16} /></Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => selectPlan(plan.id as PaidPlanId)}
                    disabled={processing !== null}
                    className={`mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${plan.featured ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300" : "border border-slate-700 text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"}`}
                  >
                    {processing === plan.id ? <><Loader2 size={16} className="animate-spin" />A preparar pagamento...</> : <>Selecionar {plan.name} {showAnnual ? "anual" : "mensal"} <ArrowRight size={16} /></>}
                  </button>
                )}
              </article>
            );
          })}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[[SearchCheck, "Pesquisa", "Filtros para encontrar concursos relevantes."], [BellRing, "Acompanhamento", "Alertas e pesquisas guardadas para não perder prazos."], [Users, "Equipa", "Um espaço de trabalho para organizar a prospeção."]].map(([Icon, title, description]) => {
            const ItemIcon = Icon as typeof SearchCheck;
            return <div key={title as string} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"><ItemIcon size={19} className="text-cyan-300" /><h2 className="mt-4 font-semibold text-white">{title as string}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{description as string}</p></div>;
          })}
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] p-5 text-sm leading-6 text-slate-400">
          <ShieldCheck size={19} className="mt-0.5 shrink-0 text-cyan-300" />
          <p>Os preços apresentados não incluem IVA. Os limites aplicáveis são validados no backend. A seleção de um plano pago abre o checkout seguro da Stripe com o valor correspondente.</p>
        </div>
      </section>
    </main>
  );
}
