"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Radar } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ConfirmationPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) setError("Email ou palavra-passe incorretos.");
    else router.push("/");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#06101f] px-4 py-12 text-slate-100 sm:px-6 lg:py-20">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
        <section className="rounded-[28px] border border-cyan-950/80 bg-[#081525] p-8 sm:p-12">
          <Link href="/" className="inline-flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400"><Radar size={22} /></span><span><strong className="block text-sm tracking-[0.22em] text-white">ADJUDATA</strong><small className="text-[11px] text-slate-500">Procurement Intelligence</small></span></Link>
          <div className="mt-20 max-w-xl"><CheckCircle2 className="text-emerald-300" size={42} /><p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Conta Adjudata</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Email confirmado com sucesso</h1><p className="mt-5 text-base leading-7 text-slate-400">A tua conta está pronta. Entra para começares a acompanhar oportunidades de contratação pública.</p></div>
        </section>
        <section className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Acesso reservado</p><h2 className="mt-3 text-2xl font-semibold text-white">Entrar no Adjudata</h2><p className="mt-3 text-sm leading-6 text-slate-500">Usa o email que confirmaste e a tua palavra-passe.</p><form onSubmit={handleLogin} className="mt-8 space-y-4"><label className="block text-sm text-slate-300">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none focus:border-cyan-400/60" /></label><label className="block text-sm text-slate-300">Palavra-passe<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none focus:border-cyan-400/60" /></label>{error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}<button type="submit" disabled={loading} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60">{loading ? "A entrar…" : "Entrar"}</button></form><Link href="/login" className="mt-5 block text-center text-sm text-cyan-300 hover:text-cyan-200">Esqueci-me da palavra-passe</Link></section>
      </div>
    </main>
  );
}
