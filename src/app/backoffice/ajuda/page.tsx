"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import Manual from "@/components/manual/Manual";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);

export default function HelpManualPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      setState(data.user && allowedRoles.has(role) ? "allowed" : "denied");
    });
  }, []);

  if (state === "loading") {
    return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  }
  if (state === "denied") {
    return (
      <main className="min-h-screen px-4 py-16 text-center text-slate-400">
        <LockKeyhole className="mx-auto text-cyan-300" size={28} />
        <p className="mt-4">Área reservada.</p>
      </main>
    );
  }

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300">
        <ArrowLeft size={15} /> Back-office
      </Link>

      <div className="mt-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Manual do Comercial</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Manual e ajuda</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          O teu guia único para operares o back-office comercial, do primeiro dia em diante. Quase todas as dúvidas do
          dia a dia têm resposta aqui — consulta antes de abrires um ticket.
        </p>
      </div>

      <div className="mt-10 max-w-4xl">
        <Manual />
      </div>
    </BackofficeShell>
  );
}
