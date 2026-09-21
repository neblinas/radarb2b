"use client";

import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import ProspectQueue from "@/components/ProspectQueue";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

export default function ProspectingPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      setState(data.user && allowedRoles.has(role) ? "allowed" : "denied");
    });
  }, []);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;

  return <BackofficeShell email={identity.email} role={identity.role}><Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Back-office</Link><div className="mt-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Prospecção comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Empresas com maior potencial comercial</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Identificadas através de atividade real em contratação pública. Cada score mostra os indicadores que o sustentam.</p></div><nav className="mt-6 flex flex-wrap gap-3"><Link href="/backoffice/prospeccao/descoberta" className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400/40 hover:text-white">Descoberta</Link><Link href="/backoffice/prospeccao/gestao" className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400/40 hover:text-white">Gestão</Link><Link href="/backoffice/prospeccao/enriquecimento" className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400/40 hover:text-white">Enriquecimento</Link><Link href="/backoffice/prospeccao/dashboard" className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400/40 hover:text-white">Dashboard</Link><Link href="/backoffice/prospeccao/scoring" className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400/40 hover:text-white">Lead Scoring</Link></nav><ProspectQueue /></BackofficeShell>;
}

