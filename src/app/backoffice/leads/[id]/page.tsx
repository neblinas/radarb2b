"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, LockKeyhole, Save, UserRound } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
const stages = ["Novo", "Contactado", "Qualificado", "Proposta", "Ganho", "Perdido"];

type Lead = { id: string; company_name: string; company_nif: string | null; contact_name: string; contact_email: string | null; phone: string | null; website: string | null; contact_channel: string | null; stage: string; owner_id: string | null; note: string | null; next_action_at: string | null; last_contact_at: string | null; source: string | null; created_at: string };
type Audit = { id: string; action: string; entity_type: string; metadata: Record<string, unknown>; created_at: string };

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [lead, setLead] = useState<Lead | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { params.then(({ id: value }) => setId(value)); }, [params]);
  useEffect(() => {
    if (!id) return;
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) { setAccess("denied"); return; }
      const result = await supabase.from("commercial_opportunities").select("id, company_name, company_nif, contact_name, contact_email, phone, website, contact_channel, stage, owner_id, note, next_action_at, last_contact_at, source, created_at").eq("id", id).single();
      if (result.error) setError("Não foi possível carregar esta lead.");
      setLead(result.data as Lead | null);
      if (role === "admin" || role === "commercial_manager") {
        const auditResult = await supabase.from("admin_audit_log").select("id, action, entity_type, metadata, created_at").eq("entity_id", id).order("created_at", { ascending: false }).limit(20);
        setAudit((auditResult.data ?? []) as Audit[]);
      }
      setAccess("allowed");
    });
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead) return;
    setSaving(true); setNotice(""); setError("");
    const { data, error: rpcError } = await supabase.rpc("update_commercial_opportunity_details", { p_id: lead.id, p_company_name: lead.company_name, p_contact_name: lead.contact_name, p_contact_email: lead.contact_email, p_note: lead.note, p_owner_id: lead.owner_id || null, p_next_action_at: lead.next_action_at || null, p_company_nif: lead.company_nif, p_phone: lead.phone, p_website: lead.website, p_contact_channel: lead.contact_channel, p_last_contact_at: lead.last_contact_at || null });
    if (!rpcError && data && data.stage !== lead.stage) {
      const stageResult = await supabase.rpc("update_commercial_opportunity_stage", { p_id: lead.id, p_stage: lead.stage });
      if (stageResult.error) setError("Os dados foram guardados, mas não foi possível atualizar a etapa.");
    }
    if (rpcError) setError(rpcError.message.includes("CRM access denied") ? "Não tens permissão para editar esta lead." : "Não foi possível guardar as alterações.");
    else { setLead(data as Lead); setNotice("Lead atualizada e partilhada com a equipa autorizada."); }
    setSaving(false);
  }

  if (access === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (access === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;
  if (!lead) return <BackofficeShell email={identity.email} role={identity.role}><p className="text-sm text-rose-200">{error || "Lead não encontrada."}</p></BackofficeShell>;

  return <BackofficeShell email={identity.email} role={identity.role}><Link href="/backoffice/leads" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Leads comerciais</Link><div className="mt-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Ficha de lead</p><h1 className="mt-3 text-3xl font-semibold text-white">{lead.company_name}</h1><p className="mt-3 text-sm text-slate-500">Criada em {new Date(lead.created_at).toLocaleDateString("pt-PT")} · Origem: {lead.source || "manual"}</p></div><span className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs font-semibold text-cyan-300">{lead.stage}</span></div>{notice ? <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-200"><CheckCircle2 size={16} />{notice}</div> : null}{error ? <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</div> : null}<div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]"><form onSubmit={save} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Dados comerciais</p><h2 className="mt-2 text-xl font-semibold text-white">Editar lead</h2></div><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60"><Save size={16} />{saving ? "A guardar…" : "Guardar"}</button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Empresa<input value={lead.company_name} onChange={(event) => setLead({ ...lead, company_name: event.target.value })} required className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">NIF<input value={lead.company_nif || ""} onChange={(event) => setLead({ ...lead, company_nif: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Contacto<input value={lead.contact_name} onChange={(event) => setLead({ ...lead, contact_name: event.target.value })} required className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Email<input type="email" value={lead.contact_email || ""} onChange={(event) => setLead({ ...lead, contact_email: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Telefone<input value={lead.phone || ""} onChange={(event) => setLead({ ...lead, phone: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Canal de contacto<input value={lead.contact_channel || ""} onChange={(event) => setLead({ ...lead, contact_channel: event.target.value })} placeholder="Email, telefone, reunião…" className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Website<input value={lead.website || ""} onChange={(event) => setLead({ ...lead, website: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Etapa<select value={lead.stage} onChange={(event) => setLead({ ...lead, stage: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white">{stages.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm text-slate-300">Próxima ação<input type="datetime-local" value={lead.next_action_at ? lead.next_action_at.slice(0, 16) : ""} onChange={(event) => setLead({ ...lead, next_action_at: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300">Último contacto<input type="datetime-local" value={lead.last_contact_at ? lead.last_contact_at.slice(0, 16) : ""} onChange={(event) => setLead({ ...lead, last_contact_at: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white" /></label><label className="text-sm text-slate-300 sm:col-span-2">Notas partilhadas<textarea rows={6} value={lead.note || ""} onChange={(event) => setLead({ ...lead, note: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white" /></label></div></form><aside className="space-y-4"><section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5"><div className="flex items-center gap-3"><UserRound className="text-cyan-300" size={19} /><h2 className="font-semibold text-white">Responsável</h2></div><p className="mt-4 break-all text-sm text-slate-400">{lead.owner_id || "A atribuir"}</p></section><section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex items-center gap-3"><CalendarClock className="text-cyan-300" size={19} /><h2 className="font-semibold text-white">Seguimento</h2></div><p className="mt-4 text-sm leading-6 text-slate-500">Define a próxima ação e mantém o histórico de contactos para a equipa comercial.</p></section>{audit.length ? <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex items-center gap-3"><Clock3 className="text-cyan-300" size={19} /><h2 className="font-semibold text-white">Histórico</h2></div><div className="mt-4 space-y-3">{audit.map((item) => <div key={item.id} className="border-l border-cyan-400/30 pl-3 text-xs"><p className="text-slate-300">{item.action}</p><p className="mt-1 text-slate-600">{new Date(item.created_at).toLocaleString("pt-PT")}</p></div>)}</div></section> : null}</aside></div></BackofficeShell>;
}
