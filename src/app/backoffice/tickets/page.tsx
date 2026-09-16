"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, LockKeyhole, Save } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const roles = new Set(["admin", "commercial_manager", "commercial"]);
const statuses = ["open", "in_progress", "resolved", "closed"];
type Ticket = { id: string; email: string; category: string; subject: string; message: string; status: string; assigned_to: string | null; created_at: string };

export default function SupportTicketsPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState("");

  async function loadTickets() {
    const result = await supabase.from("support_requests").select("id, email, category, subject, message, status, assigned_to, created_at").order("created_at", { ascending: false });
    if (result.error) setError("Não foi possível carregar os tickets. Confirma a migration de suporte.");
    setTickets((result.data ?? []) as Ticket[]);
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !roles.has(role)) { setState("denied"); return; }
      await loadTickets();
      setState("allowed");
    });
  }, []);

  async function updateTicket(id: string, status: string) {
    const result = await supabase.rpc("update_support_request", { p_id: id, p_status: status, p_assigned_to: null });
    if (result.error) setError("Não foi possível atualizar o ticket."); else setTickets((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  }

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;

  return <BackofficeShell email={identity.email} role={identity.role}><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Suporte</p><h1 className="mt-3 text-3xl font-semibold text-white">Tickets de suporte</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Triagem e acompanhamento das questões encaminhadas pelo assistente e pelo formulário de contacto.</p></div>{error ? <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</div> : null}<div className="mt-8 space-y-4">{tickets.length ? tickets.map((ticket) => <article key={ticket.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row"><div><div className="flex flex-wrap items-center gap-3"><LifeBuoy size={18} className="text-cyan-300" /><span className="text-xs text-slate-500">{ticket.category}</span><span className="text-xs text-slate-600">{new Date(ticket.created_at).toLocaleString("pt-PT")}</span></div><h2 className="mt-4 font-semibold text-white">{ticket.subject}</h2><p className="mt-2 text-sm text-slate-400">{ticket.email}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-500">{ticket.message}</p></div><div className="shrink-0"><label className="text-xs uppercase tracking-wider text-slate-600">Estado<select value={ticket.status} onChange={(event) => updateTicket(ticket.id, event.target.value)} className="mt-2 block h-10 rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-300">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><Save size={14} className="mt-2 text-slate-600" /></div></div></article>) : <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center text-sm text-slate-500">Não existem tickets.</div>}</div></BackofficeShell>;
}
