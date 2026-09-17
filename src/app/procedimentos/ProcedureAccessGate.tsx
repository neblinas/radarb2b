"use client";

import Link from "next/link";
import { LockKeyhole, Loader2 } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProcedureAccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setState(data.user ? "allowed" : "denied");
    });
  }, []);

  if (state === "loading") {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={17} className="animate-spin" />A validar acesso à oportunidade…</div>;
  }

  if (state === "denied") {
    return <section className="mx-auto max-w-xl rounded-3xl border border-cyan-500/20 bg-cyan-500/[0.07] p-8 text-center"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Oportunidade reservada</p><h1 className="mt-3 text-2xl font-semibold text-white">Vê o concurso completo dentro da tua conta.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Cria uma conta gratuita para consultar entidade, concorrência, contratos e CPVs associados.</p><Link href={`/login?next=${encodeURIComponent(window.location.pathname)}`} className="mt-6 inline-flex items-center rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300">Entrar ou criar conta</Link></section>;
  }

  return <>{children}</>;
}
