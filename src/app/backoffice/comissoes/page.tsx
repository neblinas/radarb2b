"use client";

import Link from "next/link";
import { ArrowLeft, Coins, LockKeyhole, TrendingUp, Users, Wallet, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import CommercialTermsGate from "@/components/CommercialTermsGate";
import { supabase } from "@/lib/supabase";
import {
  EarningRow,
  commissionKindLabel,
  commissionStatusLabel,
  fetchMyEarnings,
  formatEuro,
} from "@/lib/commercial";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

const statusStyle: Record<string, string> = {
  pending: "text-amber-300",
  approved: "text-cyan-300",
  paid: "text-emerald-300",
  cancelled: "text-slate-500 line-through",
};

export default function CommissionsPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) {
        setState("denied");
        return;
      }
      try {
        setEarnings(await fetchMyEarnings());
      } catch {
        setError("A tabela de ganhos ainda precisa da migração de comissões.");
      }
      setState("allowed");
    });
  }, []);

  if (state === "loading") {
    return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  }
  if (state === "denied") {
    return (
      <main className="min-h-screen px-4 py-16 text-center text-slate-400">
        <LockKeyhole className="mx-auto text-cyan-300" size={28} />
        <p className="mt-4">Área reservada.</p>
      </main>
    );
  }

  const sum = (pred: (e: EarningRow) => boolean) =>
    earnings.filter(pred).reduce((total, e) => total + Number(e.amount || 0), 0);

  const directTotal = sum((e) => e.kind?.startsWith("direct") === true || e.kind === "retention");
  const teamTotal = sum((e) => e.kind?.startsWith("team") === true);
  const recruiterTotal = sum((e) => e.kind === "recruiter");
  const pendingTotal = sum((e) => e.status === "pending" || e.status === "approved");
  const paidTotal = sum((e) => e.status === "paid");

  const kpis = [
    { label: "Ganhos diretos", value: directTotal, icon: Wallet, tone: "text-cyan-300" },
    { label: "Ganhos de equipa", value: teamTotal + recruiterTotal, icon: Users, tone: "text-violet-300" },
    { label: "A receber", value: pendingTotal, icon: Clock, tone: "text-amber-300" },
    { label: "Já pago", value: paidTotal, icon: TrendingUp, tone: "text-emerald-300" },
  ];

    return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <CommercialTermsGate role={identity.role}>
      <Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300">
        <ArrowLeft size={15} /> Back-office
      </Link>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Programa comercial</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Os meus ganhos</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Diretas (100% da 1.ª mensalidade + 10% nos 5 meses seguintes + 3% de retenção), equipa (50% da 2.ª mensalidade), anuais (20%/5%) e bónus de recrutamento (5%).
          </p>
        </div>
        <Link
          href="/backoffice/clientes"
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/5 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
        >
          <Users size={16} /> Ver os meus clientes
        </Link>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <Icon size={18} className={tone} />
            <p className="mt-4 text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-semibold ${tone}`}>{formatEuro(value)}</p>
          </article>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_110px_120px] border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          <span>Data</span>
          <span>Tipo</span>
          <span>Cliente</span>
          <span>Estado</span>
          <span className="text-right">Valor</span>
        </div>
        {earnings.length ? (
          earnings.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_110px_120px] items-center border-b border-slate-800 px-5 py-4 last:border-0 text-sm"
            >
              <span className="text-slate-500">{new Date(e.created_at).toLocaleDateString("pt-PT")}</span>
              <span className="text-slate-300">
                {commissionKindLabel[e.kind || ""] || e.commission_type}
                {e.level === 2 ? " · nível 2" : ""}
              </span>
              <span className="break-all text-slate-400">{e.client_email || "—"}</span>
              <span className={statusStyle[e.status] || "text-slate-400"}>{commissionStatusLabel[e.status] || e.status}</span>
              <span className="text-right font-semibold text-white">{formatEuro(e.amount)}</span>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">Ainda não existem movimentos de comissão registados.</div>
        )}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm leading-6 text-slate-500">
        <Coins size={19} className="mt-0.5 shrink-0 text-cyan-300" />
                <p>
          Os movimentos são gerados automaticamente quando o cliente paga e confirmados pelo administrador antes do pagamento. Cada movimento guarda a versão das regras aplicada.
        </p>
      </div>
      </CommercialTermsGate>
    </BackofficeShell>
  );
}
