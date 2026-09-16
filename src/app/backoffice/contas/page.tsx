"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole, Mail, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

type Account = { id: string; account_status: string | null };

export default function BackofficeAccountsPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      if (!active) return;
      if (!data.user || !allowedRoles.has(role)) { setState("denied"); return; }
      const result = await supabase.from("profiles").select("id, account_status").order("id").limit(100);
      if (!active) return;
      if (result.error) setError("A tabela de contas não está disponível para esta role. O acesso foi protegido pelo backend.");
      setAccounts((result.data ?? []) as Account[]);
      setState("allowed");
    });
    return () => { active = false; };
  }, []);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16"><div className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><h1 className="mt-5 text-2xl font-semibold text-white">Área reservada</h1><p className="mt-3 text-sm leading-6 text-slate-400">Esta vista exige uma role comercial atribuída no backend.</p></div></main>;

  return <main className="min-h-screen text-slate-100"><section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8"><Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Back-office</Link><div className="mt-8 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Gestão comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Contas e colaboradores</h1><p className="mt-3 text-sm leading-6 text-slate-500">Consulta perfis existentes. Convites, roles e notas internas só serão ativados com tabelas e RPCs administrativas.</p></div><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200"><Users className="mr-2 inline" size={16} />{accounts.length} perfis</div></div>{error ? <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div> : null}<div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60"><div className="grid grid-cols-[minmax(0,1fr)_180px] border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><span>Identificador</span><span>Estado</span></div>{accounts.length ? accounts.map((account) => <div key={account.id} className="grid grid-cols-[minmax(0,1fr)_180px] items-center border-b border-slate-800 px-5 py-4 last:border-0"><span className="flex items-center gap-2 break-all text-sm text-slate-300"><Mail size={15} className="shrink-0 text-cyan-300" />{account.id}</span><span className="text-sm text-slate-400">{account.account_status || "active"}</span></div>) : <div className="p-8 text-center text-sm text-slate-500">Sem perfis disponíveis ou sem permissão de leitura.</div>}</div><div className="mt-6 flex gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-5 text-sm leading-6 text-slate-400"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={19} />Os emails, convites e alterações de role não são expostos no cliente. Devem ser implementados através de Edge Functions com service role protegida e auditoria.</div></section></main>;
}
