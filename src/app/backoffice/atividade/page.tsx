"use client";

import { useEffect, useState } from "react";
import { ClipboardList, LockKeyhole } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

export default function BackofficeActivityPage() {
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

  return <BackofficeShell email={identity.email} role={identity.role}><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Controlo</p><h1 className="mt-3 text-3xl font-semibold text-white">Atividade e auditoria</h1><p className="mt-3 text-sm leading-6 text-slate-500">Registo pesquisável de acessos, alterações e decisões comerciais.</p></div><section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8"><ClipboardList className="text-cyan-300" size={24} /><h2 className="mt-5 text-xl font-semibold text-white">Auditoria ainda não ligada</h2><p className="mt-3 text-sm leading-6 text-slate-500">Para ativar esta área é necessário criar `admin_audit_log`, uma RPC de escrita server-side e políticas RLS por organização. O módulo permanece explícito e sem dados simulados.</p></section></BackofficeShell>;
}
