"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, LockKeyhole, MailPlus, ShieldCheck } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial_manager"]);

export default function NewCollaboratorPage() {
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [form, setForm] = useState({ name: "", email: "", phone: "", nif: "", role: "commercial" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      setAccess(data.user && allowedRoles.has(role) ? "allowed" : "denied");
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("invite-commercial-member", { body: form });
    if (invokeError || data?.error) {
      setStatus("error");
      setError(data?.error || "Não foi possível criar o colaborador.");
      return;
    }
    setStatus("sent");
  }

  if (access === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (access === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Apenas admins e gestores comerciais podem criar colaboradores.</p></main>;

  return <BackofficeShell email={identity.email} role={identity.role}><Link href="/backoffice/contas" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Clientes e colaboradores</Link><div className="mt-8 max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Equipa comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Criar colaborador</h1><p className="mt-3 text-sm leading-6 text-slate-500">Preenche os dados da pessoa. Será criada uma conta pendente e enviado um email com o link de ativação para definir a palavra-passe.</p></div>{status === "sent" ? <div className="mt-8 max-w-3xl rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6"><CheckCircle2 className="text-emerald-300" size={24} /><h2 className="mt-4 font-semibold text-emerald-200">Convite enviado</h2><p className="mt-2 text-sm leading-6 text-emerald-100/70">O colaborador receberá o email de ativação. A conta ficará pendente até concluir o link.</p><Link href="/backoffice/contas" className="mt-5 inline-flex text-sm font-semibold text-cyan-300">Voltar às contas →</Link></div> : <form onSubmit={submit} className="mt-8 max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm text-slate-300">Nome completo<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Email profissional<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Telefone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">NIF<input value={form.nif} onChange={(event) => setForm({ ...form, nif: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300 sm:col-span-2">Permissão<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white"><option value="commercial">Comercial</option><option value="commercial_manager">Gestor comercial</option>{identity.role === "admin" ? <option value="admin">Administrador</option> : null}</select></label></div>{error ? <p role="alert" className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</p> : null}<div className="mt-6 flex items-start gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4 text-xs leading-5 text-slate-400"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={16} />O convite é enviado por uma Edge Function segura. A palavra-passe nunca é criada ou vista pelo administrador.</div><button type="submit" disabled={status === "sending"} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-60">{status === "sending" ? "A criar conta…" : "Criar e enviar ativação"}<MailPlus size={17} /></button></form>}</BackofficeShell>;
}
