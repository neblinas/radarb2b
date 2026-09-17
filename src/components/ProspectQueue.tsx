"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Flame, Loader2, Search, UserPlus } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

type Prospect = { company_id: string; company_name: string; company_nif: string | null; prospect_score: number; participation_count: number; participation_12m: number; award_count: number; total_award_value: number; last_participation: string | null; cpv_codes: string[] | null; prospect_id: string | null; prospect_status: string | null; assigned_to: string | null; assigned_at: string | null; next_action_at: string | null; total_count: number };
const statuses = [["", "Todos os estados"], ["NEW", "Novo"], ["RESEARCHING", "Em pesquisa"], ["READY_TO_CONTACT", "Pronto para contacto"], ["CONTACTED", "Contactado"], ["FOLLOW_UP", "Follow-up"], ["NEGOTIATION", "Negociação"], ["WON", "Cliente"], ["LOST", "Perdido"], ["DO_NOT_CONTACT", "Não contactar"]];
const pageSize = 25;

function heat(score: number) { return score >= 80 ? "Muito quente" : score >= 60 ? "Quente" : score >= 40 ? "Médio" : "Baixo"; }
function heatClass(score: number) { return score >= 80 ? "text-rose-300 border-rose-400/20 bg-rose-400/5" : score >= 60 ? "text-amber-300 border-amber-400/20 bg-amber-400/5" : "text-cyan-300 border-cyan-400/20 bg-cyan-400/5"; }

export default function ProspectQueue() {
  const [items, setItems] = useState<Prospect[]>([]);
  const [query, setQuery] = useState("");
  const [minimumScore, setMinimumScore] = useState("0");
  const [status, setStatus] = useState("");
  const [assignment, setAssignment] = useState("available");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useEffectEvent(async () => {
    setLoading(true); setError("");
    const { data, error: rpcError } = await supabase.rpc("prospect_queue", { p_query: query || null, p_min_score: Number(minimumScore) || 0, p_status: status || null, p_assignment: assignment, p_page: page, p_page_size: pageSize });
    if (rpcError) setError("Não foi possível carregar os prospects. Confirma se a migração de prospeção já foi executada.");
    setItems((data ?? []) as Prospect[]); setLoading(false);
  });

  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [query, minimumScore, status, assignment, page, reloadKey]);

  async function claim(companyId: string) {
    setClaiming(companyId); setError("");
    const { error: rpcError } = await supabase.rpc("prospect_claim", { p_company_id: companyId });
    if (rpcError) setError(rpcError.message.includes("already assigned") ? "Este prospect já foi assumido por outro comercial." : "Não foi possível assumir este prospect.");
    setReloadKey((current) => current + 1); setClaiming(null);
  }

  const total = items[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const nextProspect = items.find((item) => !item.assigned_to && item.prospect_score >= 60);

  return <><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Prospects disponíveis", total.toLocaleString("pt-PT")], ["Atribuídos a mim", assignment === "mine" ? total.toLocaleString("pt-PT") : "Filtrar"], ["Próximas ações", items.filter((item) => item.next_action_at && new Date(item.next_action_at) <= new Date()).length.toString()], ["Potencial quente", items.filter((item) => item.prospect_score >= 60).length.toString()]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>)}</div><div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 xl:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Pesquisar por empresa ou NIF..." className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400/50" /></div><input type="number" min="0" max="100" value={minimumScore} onChange={(event) => { setMinimumScore(event.target.value); setPage(1); }} aria-label="Score mínimo" className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white xl:w-32" /><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-300">{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={assignment} onChange={(event) => { setAssignment(event.target.value); setPage(1); }} className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-300"><option value="available">Pool disponível</option><option value="mine">Atribuídos a mim</option><option value="all">Todos</option></select></div>{nextProspect ? <Link href={`/backoffice/prospeccao/${nextProspect.company_id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"><Flame size={16} /> Próximo prospect: {nextProspect.company_name}</Link> : null}{error ? <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</p> : null}<div className="mt-5 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60"><div className="min-w-[1080px]"><div className="grid grid-cols-[minmax(220px,1.6fr)_100px_100px_130px_130px_120px_160px] gap-4 border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"><span>Empresa</span><span>Score</span><span>Atividade</span><span>Adjudicações</span><span>Valor</span><span>Estado</span><span>Ação</span></div>{loading ? <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="animate-spin" size={17} />A calcular fila comercial…</div> : items.length ? items.map((item) => <div key={item.company_id} className="grid grid-cols-[minmax(220px,1.6fr)_100px_100px_130px_130px_120px_160px] items-center gap-4 border-b border-slate-800 px-5 py-4 last:border-0"><Link href={`/backoffice/prospeccao/${item.company_id}`} className="min-w-0 hover:text-cyan-200"><p className="truncate font-medium text-white">{item.company_name}</p><p className="mt-1 text-xs text-slate-500">NIF {item.company_nif || "—"} · {(item.cpv_codes || []).slice(0, 3).join(", ") || "CPV não disponível"}</p></Link><span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${heatClass(item.prospect_score)}`}>{item.prospect_score} · {heat(item.prospect_score)}</span><span className="text-sm text-slate-300">{item.participation_12m} / 12m</span><span className="text-sm text-slate-300">{item.award_count}</span><span className="text-sm text-slate-300">{Number(item.total_award_value).toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}</span><span className="text-xs text-slate-400">{item.prospect_status ? statuses.find(([value]) => value === item.prospect_status)?.[1] : "Disponível"}</span>{item.assigned_to ? <Link href={`/backoffice/prospeccao/${item.company_id}`} className="text-xs font-semibold text-slate-400 hover:text-white">Abrir ficha</Link> : <button type="button" onClick={() => claim(item.company_id)} disabled={claiming !== null} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-50">{claiming === item.company_id ? <Loader2 className="animate-spin" size={14} /> : <UserPlus size={14} />}Assumir</button>}</div>) : <p className="p-8 text-center text-sm text-slate-500">Não há prospects para estes filtros.</p>}</div></div>{pages > 1 ? <div className="mt-5 flex justify-center gap-3"><button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300 disabled:opacity-40"><ChevronLeft size={16} />Anterior</button><span className="py-2 text-sm text-slate-500">{page} / {pages}</span><button type="button" disabled={page === pages} onClick={() => setPage((current) => current + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300 disabled:opacity-40">Seguinte<ChevronRight size={16} /></button></div> : null}</>;
}
