"use client";

import { useEffect, useState } from "react";
import { BriefcaseBusiness, LockKeyhole } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

export default function BackofficeOpportunitiesPage() {
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      setAccess(data.user && allowedRoles.has(role) ? "allowed" : "denied");
    });
  }, []);

  if (access === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (access === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;

  return <BackofficeShell email={identity.email} role={identity.role}><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Pipeline comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Oportunidades</h1><p className="mt-3 text-sm leading-6 text-slate-500">Acompanha oportunidades de clientes, responsáveis, prioridade e próximos passos.</p></div><section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8"><BriefcaseBusiness className="text-cyan-300" size={24} /><h2 className="mt-5 text-xl font-semibold text-white">CRM de oportunidades a ligar</h2><p className="mt-3 text-sm leading-6 text-slate-500">Este módulo precisa de `commercial_opportunities`, notas, responsáveis, estados e RLS por organização. A estrutura visual está preparada, mas não são inventados registos comerciais antes do contrato backend.</p></section></BackofficeShell>;
}
