"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function CommercialAccessPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Email ou palavra-passe incorretos.");
      setLoading(false);
      return;
    }
    router.push("/backoffice");
    router.refresh();
  }

  return <main className="min-h-screen bg-[#06101f] px-4 py-12 text-slate-100 sm:px-6 lg:py-20"><div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]"><div className="flex flex-col justify-between rounded-[28px] border border-cyan-950/80 bg-[#09182a] p-7 sm:p-10"><div><Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Voltar ao Radar B2B</Link><div className="mt-14 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"><ShieldCheck size={22} /></div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Operações comerciais</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">A equipa comercial começa aqui.</h1><p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">Entra para gerir contas, leads, prospeção empresarial e o acompanhamento da tua equipa.</p></div><Link href="/recrutamento" className="mt-12 flex items-center justify-between rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-5 transition hover:border-cyan-400/50"><span><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Queres fazer parte?</span><strong className="mt-2 block text-white">Conhece o programa comercial</strong><span className="mt-1 block text-sm text-slate-500">Cresce com assinaturas diretas e com a tua equipa.</span></span><ArrowRight className="shrink-0 text-cyan-300" size={20} /></Link></div><div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6 sm:p-8"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"><LockKeyhole size={15} className="text-cyan-300" /> Acesso protegido</div><h2 className="mt-6 text-2xl font-semibold text-white">Entrar no back-office</h2><p className="mt-3 text-sm leading-6 text-slate-500">Usa as credenciais de administrador ou colaborador autorizado.</p><form onSubmit={handleSubmit} className="mt-8 space-y-5"><label className="block text-sm text-slate-300">Email profissional<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@empresa.pt" className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none focus:border-cyan-400/60" /></label><label className="block text-sm text-slate-300">Palavra-passe<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="A tua palavra-passe" className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none focus:border-cyan-400/60" /></label>{error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">{error}</p> : null}<button type="submit" disabled={loading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60">{loading ? "A entrar…" : "Entrar no back-office"}<ArrowRight size={16} /></button></form></div></div></main>;
}
