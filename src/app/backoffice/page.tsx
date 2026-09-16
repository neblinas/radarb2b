"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Building2, CheckCircle2, Clock3, FileCheck2, LockKeyhole, Users } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

export default function BackofficePage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      const userRole = typeof user?.app_metadata?.role === "string" ? user.app_metadata.role : "";
      setEmail(user?.email || "");
      setRole(userRole);
      setState(user && allowedRoles.has(userRole) ? "allowed" : "denied");
    });
    return () => { active = false; };
  }, []);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16"><div className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><h1 className="mt-5 text-2xl font-semibold text-white">Área reservada</h1><p className="mt-3 text-sm leading-6 text-slate-400">O back-office exige uma role administrativa ou comercial atribuída no backend.</p><Link href="/acesso-comercial" className="mt-6 inline-flex text-sm font-semibold text-cyan-300 hover:text-cyan-200">Voltar ao acesso comercial</Link></div></main>;

  return <BackofficeShell email={email} role={role}><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Visão geral</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Operações comerciais</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Uma visão única das contas, receita, utilização e atividade do Radar B2B.</p></div><div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-300"><CheckCircle2 className="mr-2 inline" size={16} />Sessão autorizada</div></div><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
    ["Clientes", "Contas e colaboradores", Users, "/backoffice/contas", "Ver contas"],
    ["Planos", "Subscrições e quotas", BarChart3, "/backoffice/planos", "Ver utilização"],
    ["Verificação", "Identidade empresarial", Building2, "/backoffice/verificacao", "Ver empresas"],
    ["Domínios", "Acessos autorizados", FileCheck2, "/backoffice/verificacao#dominios", "Gerir domínios"],
  ].map(([label, detail, Icon, href, action]) => { const ModuleIcon = Icon as typeof Users; return <Link key={label as string} href={href as string} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:-translate-y-0.5 hover:border-cyan-400/30"><ModuleIcon className="text-cyan-300" size={20} /><p className="mt-5 text-xs uppercase tracking-wider text-slate-500">{label as string}</p><p className="mt-2 font-semibold text-white">{detail as string}</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-cyan-300">{action as string}<ArrowRight size={14} /></span></Link>; })}</div><section className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]"><div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 text-cyan-300" size={20} /><div><h2 className="font-semibold text-white">Atividade recente</h2><p className="mt-2 text-sm leading-6 text-slate-500">A auditoria de ações será ligada a uma tabela protegida no Supabase. Até esse contrato existir, o sistema não apresenta atividade fictícia.</p><Link href="/backoffice/atividade" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-cyan-300">Abrir atividade <ArrowRight size={14} /></Link></div></div></div><div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6"><h2 className="font-semibold text-amber-200">Camada de segurança</h2><p className="mt-2 text-sm leading-6 text-amber-100/70">Acesso por role backend, RLS e auditoria. Alterações de preços, billing e permissões não são executadas no browser.</p></div></section></BackofficeShell>;
}
