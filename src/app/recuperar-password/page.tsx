"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Radar } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function RecoverPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setAccountEmail(data.user?.email || "");
      setSessionReady(true);
      if (!data.user) setError("Este link de recuperação é inválido ou já expirou. Pede um novo email de recuperação.");
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password)) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres, incluindo maiúsculas, minúsculas, um número e um caractere especial.");
      return;
    }
    if (password !== confirmation) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    if (!sessionReady || !accountEmail) {
      setError("Este link de recuperação é inválido ou já expirou. Pede um novo email de recuperação.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError("Não foi possível atualizar a palavra-passe. O link pode ter expirado.");
    else { setMessage("Palavra-passe criada com sucesso. Já podes entrar na tua conta."); setPassword(""); setConfirmation(""); }
    setLoading(false);
  }

  return <main className="min-h-screen bg-[#06101f] px-4 py-12 text-slate-100 sm:px-6 lg:py-20"><div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]"><section className="rounded-[28px] border border-cyan-950/80 bg-[#081525] p-8 sm:p-12"><Link href="/" className="inline-flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400"><Radar size={22} /></span><span><strong className="block text-sm tracking-[0.22em] text-white">ADJUDATA</strong><small className="text-[11px] text-slate-500">Procurement Intelligence</small></span></Link><div className="mt-20 max-w-xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Segurança da conta</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Criar nova palavra-passe</h1><p className="mt-5 text-base leading-7 text-slate-400">Define uma nova palavra-passe para voltares a aceder à tua conta Adjudata.</p></div></section><section className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6 sm:p-8"><Link href="/login" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Voltar ao login</Link><form onSubmit={submit} className="mt-8 space-y-5">{accountEmail ? <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">A alterar a palavra-passe de <strong>{accountEmail}</strong></p> : null}<label className="block text-sm font-medium text-slate-300">Nova palavra-passe<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none focus:border-cyan-400/60" /></label><label className="block text-sm font-medium text-slate-300">Confirmar palavra-passe<input required type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none focus:border-cyan-400/60" /></label><p className="text-xs leading-5 text-slate-500">Usa pelo menos 8 caracteres, com maiúsculas, minúsculas, número e símbolo.</p>{error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">{error}</p> : null}{message ? <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200"><CheckCircle2 className="mr-2 inline" size={16} />{message}</div> : null}<button type="submit" disabled={loading || !sessionReady || !accountEmail} className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60">{loading ? "A guardar…" : "Criar nova palavra-passe"}{!loading ? <ArrowRight size={16} /> : null}</button></form></section></div></main>;
}
