"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Building2, CheckCircle2, Clock3, FileCheck2, LockKeyhole, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

const modules = [
  { title: "Contas e colaboradores", detail: "Convites, perfis e acessos comerciais.", icon: Users, href: "/backoffice/contas" },
  { title: "Planos e utilização", detail: "Subscrições, quotas e sinais de retenção.", icon: BarChart3, href: "/backoffice/planos" },
  { title: "Verificação da empresa", detail: "Nome, NIF, identidade e estado documental.", icon: Building2, href: "/backoffice/verificacao" },
  { title: "Domínios autorizados", detail: "Domínios verificados para colaboradores.", icon: FileCheck2, href: "/backoffice/verificacao#dominios" },
];

export default function BackofficePage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      const role = typeof user?.app_metadata?.role === "string" ? user.app_metadata.role : "";
      setEmail(user?.email || "");
      setState(user && allowedRoles.has(role) ? "allowed" : "denied");
    });

    return () => { active = false; };
  }, []);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;

  if (state === "denied") {
    return <main className="min-h-screen px-4 py-16"><div className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><h1 className="mt-5 text-2xl font-semibold text-white">Área reservada</h1><p className="mt-3 text-sm leading-6 text-slate-400">O back-office exige uma sessão com role administrativo ou comercial atribuída no backend. Acesso por URL ou ocultação de links não concede permissões.</p><Link href="/" className="mt-6 inline-flex text-sm font-semibold text-cyan-300 hover:text-cyan-200">Voltar ao dashboard</Link></div></main>;
  }

  return <main className="min-h-screen text-slate-100"><section className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Operações</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Back-office comercial</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Controlo interno de contas, verificação comercial e atividade do Radar B2B.</p></div><div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-300"><CheckCircle2 className="mr-2 inline" size={16} />{email}</div></div><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{modules.map(({ title, detail, icon: Icon, href }) => { const content = <div className="h-full rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-cyan-400/30"><Icon className="text-cyan-300" size={21} /><h2 className="mt-5 font-semibold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-cyan-300">Abrir módulo <ArrowRight size={14} /></span></div>; return href ? <Link key={title} href={href}>{content}</Link> : <div key={title}>{content}</div>; })}</div><section className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]"><div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 text-cyan-300" size={20} /><div><h2 className="font-semibold text-white">Atividade recente</h2><p className="mt-2 text-sm leading-6 text-slate-500">A atividade será ligada a uma tabela de auditoria com actor, ação, alvo, timestamp e resultado. Sem esse contrato backend, não são mostrados dados simulados.</p></div></div></div><div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6"><h2 className="font-semibold text-amber-200">Pré-requisito backend</h2><p className="mt-2 text-sm leading-6 text-amber-100/70">Criar tabelas, RPCs e RLS para roles, verificações, convites e notas internas antes de ativar ações de escrita.</p></div></section></section></main>;
}
