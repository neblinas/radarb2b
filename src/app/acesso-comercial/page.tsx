"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function CommercialAccessPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/backoffice`,
      },
    });

    if (authError) {
      setError("Não foi possível enviar o link. Confirma que o email foi convidado pelo administrador.");
    } else {
      setMessage("Se o email estiver autorizado, receberás um link de acesso. O link expira e o back-office volta a validar a tua role no backend.");
    }

    setLoading(false);
  }

  return <main className="min-h-screen bg-[#06101f] px-4 py-12 text-slate-100 sm:px-6 lg:py-20"><div className="mx-auto max-w-lg"><Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Voltar ao Radar B2B</Link><div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl sm:p-8"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><ShieldCheck size={21} /></div><h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">Acesso comercial</h1><p className="mt-3 text-sm leading-6 text-slate-400">Este acesso é reservado a colaboradores convidados. Não existe uma palavra-passe partilhada: o link é enviado para o email autorizado e a role é verificada pelo backend.</p><form onSubmit={requestAccess} className="mt-8 space-y-4"><label htmlFor="commercial-email" className="block text-sm font-medium text-slate-300">Email profissional</label><input id="commercial-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@empresa.pt" className="h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none focus:border-cyan-400/50" /><button type="submit" disabled={loading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"><MailCheck size={17} />{loading ? "A enviar…" : "Enviar link de acesso"}</button></form>{message ? <p role="status" className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm leading-6 text-emerald-200">{message}</p> : null}{error ? <p role="alert" className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm leading-6 text-rose-200">{error}</p> : null}<p className="mt-6 text-xs leading-5 text-slate-600">O administrador deve convidar o colaborador e atribuir uma role permitida no Supabase. Este formulário não cria permissões nem contorna RLS.</p></div></div></main>;
}
