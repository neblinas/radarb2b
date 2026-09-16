"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Globe2, LockKeyhole, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

export default function VerificationPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setAllowed(Boolean(data.user && allowedRoles.has(role)));
    });
  }, []);

  if (allowed === null) return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (!allowed) return <main className="min-h-screen px-4 py-16"><div className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><h1 className="mt-5 text-2xl font-semibold text-white">Acesso reservado</h1><p className="mt-3 text-sm leading-6 text-slate-400">A verificação comercial requer uma role atribuída em `app_metadata` e políticas RLS correspondentes.</p></div></main>;

  return <main className="min-h-screen text-slate-100"><section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"><Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Back-office</Link><div className="mt-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Confiança comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Verificação da empresa e domínios</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Fluxo preparado para validar identidade empresarial, nome comercial e domínios de colaboradores sem confiar em dados introduzidos apenas no browser.</p></div><div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="flex items-center gap-3"><ShieldCheck className="text-cyan-300" size={21} /><h2 className="font-semibold text-white">Identidade e nome</h2></div><div className="mt-6 space-y-4"><label className="block text-sm text-slate-300">Nome legal da empresa<input disabled placeholder="A aguardar tabela company_verifications" className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-500" /></label><label className="block text-sm text-slate-300">NIF<input disabled placeholder="A validar com fonte oficial" className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-500" /></label><div className="rounded-xl bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/70">O nome só deve ser marcado como verificado após prova documental e revisão por um colaborador autorizado.</div></div></section><section id="dominios" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="flex items-center gap-3"><Globe2 className="text-cyan-300" size={21} /><h2 className="font-semibold text-white">Domínios autorizados</h2></div><div className="mt-6 space-y-4"><label className="block text-sm text-slate-300">Domínio empresarial<input disabled placeholder="empresa.pt" className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-500" /></label><div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500"><CheckCircle2 className="mr-2 inline text-slate-600" size={16} />A confirmação deve usar DNS TXT ou email no domínio. Não é suficiente verificar apenas o texto introduzido.</div><button type="button" disabled className="w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-500">Ativar quando existir RPC de verificação</button></div></section></div><div className="mt-6 rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-5 text-sm leading-6 text-slate-400">Contrato recomendado: `company_verifications`, `verified_domains`, `commercial_members`, RPCs de criação/validação e RLS por organização. Guardar actor, método, timestamp, evidência e data de expiração.</div></section></main>;
}
