"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

type Plan = { id: string; name: string; max_searches_month: number | null };
type Subscription = { user_id: string; plan_id: string; status: string | null; cancel_at_period_end: boolean | null };

export default function BackofficePlansPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      if (!active) return;
      if (!data.user || !allowedRoles.has(role)) { setState("denied"); return; }
      const [plansResult, subscriptionsResult] = await Promise.all([
        supabase.from("plans").select("id, name, max_searches_month").order("name"),
        supabase.from("subscriptions").select("user_id, plan_id, status, cancel_at_period_end").limit(100),
      ]);
      if (!active) return;
      if (plansResult.error || subscriptionsResult.error) setError("Os dados de planos/subscrições não estão disponíveis para esta role. O acesso continua protegido pelo backend.");
      setPlans((plansResult.data ?? []) as Plan[]);
      setSubscriptions((subscriptionsResult.data ?? []) as Subscription[]);
      setState("allowed");
    });
    return () => { active = false; };
  }, []);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16"><div className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><h1 className="mt-5 text-2xl font-semibold text-white">Área reservada</h1><p className="mt-3 text-sm leading-6 text-slate-400">Esta vista exige uma role comercial atribuída no backend.</p></div></main>;

  return <main className="min-h-screen text-slate-100"><section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8"><Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Back-office</Link><div className="mt-8 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Gestão comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Planos e utilização</h1><p className="mt-3 text-sm leading-6 text-slate-500">Consulta planos e estados de subscrição sem permitir alterações de preço no cliente.</p></div><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200"><CreditCard className="mr-2 inline" size={16} />{subscriptions.length} subscrições</div></div>{error ? <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div> : null}<div className="mt-8 grid gap-4 md:grid-cols-3">{plans.map((plan) => <article key={plan.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><BarChart3 className="text-cyan-300" size={20} /><h2 className="mt-5 font-semibold text-white">{plan.name}</h2><p className="mt-2 text-sm text-slate-500">{plan.max_searches_month === null ? "Pesquisas ilimitadas" : `${plan.max_searches_month} pesquisas/mês`}</p><p className="mt-5 text-xs text-slate-600">ID: {plan.id}</p></article>)}</div><div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60"><div className="grid grid-cols-[minmax(0,1fr)_140px_180px] border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><span>Utilizador</span><span>Plano</span><span>Estado</span></div>{subscriptions.length ? subscriptions.map((subscription) => <div key={subscription.user_id} className="grid grid-cols-[minmax(0,1fr)_140px_180px] items-center border-b border-slate-800 px-5 py-4 last:border-0 text-sm"><span className="break-all text-slate-300">{subscription.user_id}</span><span className="text-slate-400">{subscription.plan_id}</span><span className="text-slate-400">{subscription.status || "—"}{subscription.cancel_at_period_end ? " · cancela" : ""}</span></div>) : <div className="p-8 text-center text-sm text-slate-500">Sem subscrições disponíveis ou sem permissão de leitura.</div>}</div><div className="mt-6 flex gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-5 text-sm leading-6 text-slate-400"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={19} />Alterações de preços, planos e faturação devem continuar no Stripe/Supabase backend. Este módulo não cria permissões de escrita.</div></section></main>;
}
