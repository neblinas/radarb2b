"use client";

import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import AutopilotControl from "@/components/AutopilotControl";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial_manager"]);

export default function AutopilotPage() {
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
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada a gestores.</p></main>;

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Back-office</Link>
      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Sales Autopilot</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Painel de controlo</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Liga/desliga a automação, observa a fila e o registo, e gere a lista de supressão. Nada é enviado até ativares o outbound fora do modo simulação.</p>
      </div>
      <AutopilotControl />
    </BackofficeShell>
  );
}
