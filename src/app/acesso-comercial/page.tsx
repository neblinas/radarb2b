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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Email ou palavra-passe incorretos.");
      setLoading(false);
      return;
    }

    router.push("/backoffice");
    router.refresh();
  }

  return <main className="min-h-screen bg-[#06101f] px-4 py-12 text-slate-100 sm:px-6 lg:py-20"><div className="mx-auto max-w-lg"><Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Voltar ao Radar B2B</Link><div className="mt-8 rounded-[28px] border border-cyan-950/80 bg-[#09182a] p-6 shadow-2xl shadow-black/20 sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"><ShieldCheck size={22} /></div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Operações comerciais</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Entrar no back-office</h1><p className="mt-3 text-sm leading-6 text-slate-400">Acede com as credenciais de administrador ou colaborador comercial autorizado.</p><form onSubmit={handleSubmit} className="mt-8 space-y-5"><div><label htmlFor="commercial-email" className="mb-2 block text-sm font-medium text-slate-300">Email profissional</label><input id="commercial-email" type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@empresa.pt" className="h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10" /></div><div><label htmlFor="commercial-password" className="mb-2 block text-sm font-medium text-slate-300">Palavra-passe</label><input id="commercial-password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className="h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10" /></div>{error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">{error}</p> : null}<button type="submit" disabled={loading} className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60">{loading ? "A validar…" : "Entrar no back-office"}{!loading ? <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /> : null}</button></form><div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs leading-5 text-slate-500"><LockKeyhole className="mt-0.5 shrink-0 text-cyan-300" size={16} />A autenticação é feita pelo Supabase. A role `admin`, `commercial_manager` ou `commercial` é validada no backend antes de mostrar os dados.</div><Link href="/login" className="mt-6 inline-flex text-sm text-slate-500 hover:text-cyan-300">Problemas com a palavra-passe?</Link></div></div></main>;
}
