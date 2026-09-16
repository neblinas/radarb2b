"use client";

import { FormEvent, useEffect, useState } from "react";
import { BriefcaseBusiness, Building2, Filter, LockKeyhole, Plus, Search, UserRound } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
const stages = ["Novo", "Contactado", "Qualificado", "Proposta", "Ganho", "Perdido"];

type Lead = { id: string; company: string; contact: string; email: string; stage: string; owner: string; note: string };

export default function LeadsPage() {
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [lead, setLead] = useState({ company: "", contact: "", email: "", note: "" });
  const [leads] = useState<Lead[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      setAccess(data.user && allowedRoles.has(role) ? "allowed" : "denied");
    });
  }, []);

  const filteredLeads = leads.filter((item) => {
    const matchesQuery = `${item.company} ${item.contact} ${item.email}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (stage === "Todos" || item.stage === stage);
  });

  void filteredLeads;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("O formulário está pronto. A gravação será ativada quando existir a tabela commercial_opportunities e a RPC create_opportunity com RLS.");
    setShowForm(false);
  }

  if (access === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (access === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;

  return <BackofficeShell email={identity.email} role={identity.role}><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Pipeline comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Leads comerciais</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Regista contactos efetuados, partilha o contexto com a equipa e acompanha cada oportunidade até ao resultado.</p></div><button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300"><Plus size={17} />Adicionar lead</button></div>{notice ? <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{notice}</div> : null}<div className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar empresa, contacto ou email…" className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400/50" /></div><div className="flex items-center gap-2"><Filter size={16} className="text-slate-500" /><select value={stage} onChange={(event) => setStage(event.target.value)} className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-300"><option>Todos</option>{stages.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center"><BriefcaseBusiness className="mx-auto text-cyan-300" size={28} /><h2 className="mt-5 text-xl font-semibold text-white">Pipeline pronto para receber leads</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">Ainda não existem leads partilhados. Usa “Adicionar lead” para preparar um contacto; a persistência fica bloqueada até o backend CRM estar criado com auditoria e RLS.</p></div>{showForm ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={handleSubmit} className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#071321] p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Novo contacto</p><h2 className="mt-2 text-xl font-semibold text-white">Adicionar lead</h2></div><button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500">Fechar</button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Empresa<input required value={lead.company} onChange={(event) => setLead({ ...lead, company: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Contacto<input required value={lead.contact} onChange={(event) => setLead({ ...lead, contact: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300 sm:col-span-2">Email<input type="email" value={lead.email} onChange={(event) => setLead({ ...lead, email: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300 sm:col-span-2">Notas partilhadas<textarea value={lead.note} onChange={(event) => setLead({ ...lead, note: event.target.value })} rows={4} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white" /></label></div><div className="mt-6 flex items-center gap-3 text-xs text-slate-500"><Building2 size={15} /> Visível para a equipa comercial autorizada.</div><button type="submit" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950">Preparar lead <UserRound size={16} /></button></form></div> : null}</BackofficeShell>;
}
