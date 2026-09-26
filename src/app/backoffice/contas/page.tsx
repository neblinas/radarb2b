"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, LockKeyhole, Mail, ShieldCheck, Users } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
type Account = { user_id: string; email: string | null; role: string; account_status: string | null };

export default function BackofficeAccountsPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) { setState("denied"); return; }
      const result = await supabase.rpc("crm_admin_accounts");
      if (result.error) setError("A tabela de contas não está disponível para esta role.");
      setAccounts((result.data ?? []) as Account[]);
      setState("allowed");
    });
  }, []);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;

  return <BackofficeShell email={identity.email} role={identity.role}><Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Back-office</Link><div className="mt-8 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Gestão comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Clientes e colaboradores</h1><p className="mt-3 text-sm leading-6 text-slate-500">Abre uma ficha para consultar a conta, utilização, plano e atividade autorizada.</p></div><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200"><Users className="mr-2 inline" size={16} />{accounts.length} perfis</div></div>{error ? <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div> : null}<div className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"><div className="grid grid-cols-[minmax(0,1fr)_160px_110px] border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><span>Conta</span><span>Estado</span><span>Ação</span></div>{accounts.length ? accounts.map((account) => <div key={account.user_id} className="grid grid-cols-[minmax(0,1fr)_160px_110px] items-center border-b border-slate-800 px-5 py-4 last:border-0"><span className="flex items-center gap-2 break-all text-sm text-slate-300"><Mail size={15} className="shrink-0 text-cyan-300" />{account.email || account.user_id}</span><span className="text-sm text-slate-400">{account.account_status || account.role}</span><Link href={`/backoffice/contas/${account.user_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200">Abrir <ExternalLink size={13} /></Link></div>) : <div className="p-8 text-center text-sm text-slate-500">Sem perfis disponíveis.</div>}</div><div className="mt-6 flex gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-5 text-sm leading-6 text-slate-400"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={19} />Os dados apresentados respeitam as políticas RLS da organização.</div></BackofficeShell>;
}
