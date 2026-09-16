"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Filter, LockKeyhole, Plus, Search, UserRound } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
const stages = ["Novo", "Contactado", "Qualificado", "Proposta", "Ganho", "Perdido"];

type Lead = { id: string; company_name: string; contact_name: string; contact_email: string | null; stage: string; owner_id: string | null; note: string | null; created_at: string };

export default function LeadsPage() {
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lead, setLead] = useState({ company: "", contact: "", email: "", note: "" });
  const [leads, setLeads] = useState<Lead[]>([]);

  async function loadLeads() {
    const result = await supabase.from("commercial_opportunities").select("id, company_name, contact_name, contact_email, stage, owner_id, note, created_at").order("updated_at", { ascending: false });
    if (result.error) setError("Não foi possível carregar os leads partilhados.");
    setLeads((result.data ?? []) as Lead[]);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) { setAccess("denied"); setLoading(false); return; }
      setAccess("allowed");
      await loadLeads();
    });
  }, []);

  const filteredLeads = useMemo(() => leads.filter((item) => `${item.company_name} ${item.contact_name} ${item.contact_email || ""}`.toLowerCase().includes(query.toLowerCase()) && (stage === "Todos" || item.stage === stage)), [leads, query, stage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("create_commercial_opportunity", { p_company_name: lead.company, p_contact_name: lead.contact, p_contact_email: lead.email || null, p_note: lead.note || null });
    if (rpcError) setError(rpcError.message.includes("CRM access denied") ? "Não tens permissão para criar leads." : "Não foi possível guardar o lead.");
    else { setNotice("Lead criado e partilhado com a equipa autorizada."); setLead({ company: "", contact: "", email: "", note: "" }); setShowForm(false); await loadLeads(); }
    setSaving(false);
  }

  if (access === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (access === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;

  return <BackofficeShell email={identity.email} role={identity.role}><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Pipeline comercial</p><h1 className="mt-3 text-3xl font-semibold text-white">Leads comerciais</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Regista contactos efetuados, partilha o contexto com a equipa e acompanha cada oportunidade.</p></div><button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300"><Plus size={17} />Adicionar lead</button></div>{notice ? <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-200">{notice}</div> : null}{error ? <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</div> : null}<div className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar empresa, contacto ou email…" className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400/50" /></div><div className="flex items-center gap-2"><Filter size={16} className="text-slate-500" /><select value={stage} onChange={(event) => setStage(event.target.value)} className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-300"><option>Todos</option>{stages.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">{loading ? <p className="p-8 text-center text-sm text-slate-500">A carregar leads…</p> : filteredLeads.length ? filteredLeads.map((item) => <article key={item.id} className="border-b border-slate-800 p-5 last:border-0"><div className="flex flex-col justify-between gap-4 md:flex-row"><div><h2 className="font-semibold text-white">{item.company_name}</h2><p className="mt-1 text-sm text-slate-400">{item.contact_name}{item.contact_email ? ` · ${item.contact_email}` : ""}</p>{item.note ? <p className="mt-3 text-sm leading-6 text-slate-500">{item.note}</p> : null}</div><span className="h-fit rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-xs font-semibold text-cyan-300">{item.stage}</span></div></article>) : <div className="p-10 text-center"><BriefcaseBusiness className="mx-auto text-cyan-300" size={28} /><h2 className="mt-5 text-xl font-semibold text-white">Nenhum lead encontrado</h2><p className="mt-3 text-sm text-slate-500">Adiciona um contacto ou altera os filtros.</p></div>}</div>{showForm ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={handleSubmit} className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#071321] p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Novo contacto</p><h2 className="mt-2 text-xl font-semibold text-white">Adicionar lead</h2></div><button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500">Fechar</button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Empresa<input required value={lead.company} onChange={(event) => setLead({ ...lead, company: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Contacto<input required value={lead.contact} onChange={(event) => setLead({ ...lead, contact: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300 sm:col-span-2">Email<input type="email" value={lead.email} onChange={(event) => setLead({ ...lead, email: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300 sm:col-span-2">Notas partilhadas<textarea value={lead.note} onChange={(event) => setLead({ ...lead, note: event.target.value })} rows={4} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white" /></label></div><button type="submit" disabled={saving} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-60">{saving ? "A guardar…" : "Guardar e partilhar lead"}<UserRound size={16} /></button></form></div> : null}</BackofficeShell>;
}
