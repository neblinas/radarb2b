"use client";

import Link from "next/link";
import { ArrowLeft, Copy, Check, LockKeyhole, Users } from "lucide-react";
import { useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import CommercialTermsGate from "@/components/CommercialTermsGate";
import { supabase } from "@/lib/supabase";
import {
  ClientRow,
  ReferralInfo,
  fetchMyClients,
  fetchMyReferralCode,
  formatEuro,
} from "@/lib/commercial";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

export default function MyClientsPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);
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
        const [list, code] = await Promise.all([fetchMyClients(), fetchMyReferralCode()]);
        setClients(list);
        setReferral(code);
      } catch {
        setError("Não foi possível carregar os teus clientes. Confirma que a migração de comissões já foi executada.");
      }
      setState("allowed");
    });
  }, []);

  async function copyLink() {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

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

  const total = clients.reduce((sum, c) => sum + Number(c.commission_total || 0), 0);

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <CommercialTermsGate role={identity.role}>
      <Link href="/backoffice/comissoes" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300">
        <ArrowLeft size={15} /> Ganhos
      </Link>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Programa comercial</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Os meus clientes</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Clientes que subscreveram por tua intermediação. Partilha o teu link de referência para atribuir automaticamente novos clientes.
        </p>
      </div>

      {referral ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">O teu link de referência</p>
            <p className="mt-2 break-all text-sm text-slate-300">{referral.link}</p>
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-300"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div>
      ) : null}

      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4">
        <Users size={18} className="text-cyan-300" />
        <span className="text-sm text-slate-400">{clients.length} cliente(s)</span>
        <span className="ml-auto text-sm text-slate-400">
          Comissão total: <strong className="text-emerald-300">{formatEuro(total)}</strong>
        </span>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="grid grid-cols-[minmax(0,1fr)_110px_120px_120px_130px] border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          <span>Cliente</span>
          <span>Plano</span>
          <span>Tipo</span>
          <span>Estado</span>
          <span className="text-right">Comissão</span>
        </div>
        {clients.length ? (
          clients.map((client) => (
            <div
              key={client.client_user_id}
              className="grid grid-cols-[minmax(0,1fr)_110px_120px_120px_130px] items-center border-b border-slate-800 px-5 py-4 last:border-0 text-sm"
            >
              <span className="break-all text-slate-300">{client.client_email || client.client_user_id}</span>
              <span className="text-slate-400">{client.plan_id || "—"}</span>
              <span className="text-slate-400">{client.is_annual ? "Anual" : "Mensal"}</span>
              <span className="text-slate-400">{client.status || "—"}</span>
              <span className="text-right font-semibold text-emerald-300">{formatEuro(client.commission_total)}</span>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            Ainda não tens clientes atribuídos. Partilha o teu link de referência.
          </div>
        )}
      </div>
      </CommercialTermsGate>
    </BackofficeShell>
  );
}
