"use client";

import Link from "next/link";
import { ArrowLeft, Coins, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
type Summary = { beneficiary_id: string; direct_total: number; team_total: number; pending_total: number; paid_total: number };

export default function CommissionsPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [summary, setSummary] = useState<Summary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) { setState("denied"); return; }
      const result = await supabase.rpc("commercial_commission_summary");
      if (result.error) setError("A tabela de ganhos ainda precisa da migração de crescimento comercial.");
      setSummary((result.data ?? []) as Summary[]);
      setState("allowed");
    });
  }, []);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;

  return <BackofficeShell email={identity.email} role={identity.role}><Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Back-office</Link><div className="mt-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Programa comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Ganhos da equipa</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Acompanha o valor das assinaturas diretas e os 50% atribuídos às assinaturas da tua equipa.</p></div>{error ? <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div> : null}<div className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"><div className="grid grid-cols-[minmax(0,1fr)_150px_150px_150px] border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><span>Colaborador</span><span>Direto</span><span>Equipa</span><span>Disponível</span></div>{summary.length ? summary.map((item) => <div key={item.beneficiary_id} className="grid grid-cols-[minmax(0,1fr)_150px_150px_150px] items-center border-b border-slate-800 px-5 py-4 last:border-0 text-sm"><span className="break-all text-slate-300">{item.beneficiary_id}</span><span className="text-slate-300">{Number(item.direct_total).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</span><span className="text-cyan-300">{Number(item.team_total).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</span><span className="font-semibold text-emerald-300">{Number(item.pending_total).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</span></div>) : <div className="p-8 text-center text-sm text-slate-500">Ainda não existem movimentos de comissão registados.</div>}</div><div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm leading-6 text-slate-500"><Coins size={19} className="mt-0.5 shrink-0 text-cyan-300" /><p>Os movimentos devem ser lançados pelo administrador ou gestor após confirmação da subscrição. O comercial vê os seus ganhos; a gestão vê o total da organização.</p></div></BackofficeShell>;
}
