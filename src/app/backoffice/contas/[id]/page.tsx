"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial_manager", "commercial"]);

type Account = { id: string; account_status: string | null };
type Subscription = { plan_id: string; status: string | null; cancel_at_period_end: boolean | null };

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [account, setAccount] = useState<Account | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => { params.then(({ id: value }) => setId(value)); }, [params]);
  useEffect(() => {
    if (!id) return;
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) { setState("denied"); return; }
      const [profileResult, subscriptionResult] = await Promise.all([
        supabase.from("profiles").select("id, account_status").eq("id", id).maybeSingle(),
        supabase.from("subscriptions").select("plan_id, status, cancel_at_period_end").eq("user_id", id).maybeSingle(),
      ]);
      setAccount(profileResult.data as Account | null);
      setSubscription(subscriptionResult.data as Subscription | null);
      setState("allowed");
    });
  }, [id]);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;
  if (!account) return <BackofficeShell email={identity.email} role={identity.role}><p className="text-sm text-slate-500">Cliente não encontrado ou não autorizado.</p></BackofficeShell>;

  return <BackofficeShell email={identity.email} role={identity.role}><Link href="/backoffice/contas" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Clientes e colaboradores</Link><div className="mt-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Ficha de cliente</p><h1 className="mt-3 break-all text-3xl font-semibold text-white">{account.id}</h1><p className="mt-3 text-sm text-slate-500">Conta com estado {account.account_status || "active"}.</p></div><div className="mt-8 grid gap-5 lg:grid-cols-3"><section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><ShieldCheck className="text-cyan-300" size={21} /><h2 className="mt-5 font-semibold text-white">Estado da conta</h2><p className="mt-3 text-sm text-slate-400">{account.account_status || "active"}</p></section><section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6"><CreditCard className="text-cyan-300" size={21} /><h2 className="mt-5 font-semibold text-white">Plano</h2><p className="mt-3 text-sm text-slate-300">{subscription?.plan_id || "Sem subscrição"}</p><p className="mt-2 text-xs text-slate-500">{subscription?.status || "—"}{subscription?.cancel_at_period_end ? " · cancelamento agendado" : ""}</p></section><section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><BarChart3 className="text-cyan-300" size={21} /><h2 className="mt-5 font-semibold text-white">Utilização</h2><p className="mt-3 text-sm text-slate-500">Consulta quotas e pesquisas através do módulo de planos.</p><Link href="/backoffice/planos" className="mt-4 inline-flex text-xs font-semibold text-cyan-300">Abrir planos →</Link></section></div></BackofficeShell>;
}
