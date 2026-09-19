"use client";

import Link from "next/link";
import { ArrowLeft, Flame, Layers, LockKeyhole, TrendingUp, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
const statusLabels: Record<string, string> = { NEW: "Novo", RESEARCHING: "Em pesquisa", READY_TO_CONTACT: "Pronto para contacto", CONTACTED: "Contactado", FOLLOW_UP: "Follow-up", REPLIED: "Respondeu", DEMO: "Demonstração", TRIAL: "Trial", NEGOTIATION: "Negociação", WON: "Cliente", LOST: "Perdido", DO_NOT_CONTACT: "Não contactar", INACTIVE: "Inativo" };

type TopProspect = { company_id: string; company_name: string; company_nif: string | null; prospect_score: number; status: string | null; assigned_to: string | null; next_action_at: string | null };
type UpcomingAction = { prospect_id: string; company_id: string; company_name: string; status: string | null; next_action_at: string; assigned_to: string | null };
type Metrics = {
  scope: string;
  total: number;
  assigned: number;
  available: number;
  overdue: number;
  won: number;
  lost: number;
  do_not_contact: number;
  by_status: { status: string; count: number }[];
  activities_30d: number;
  top_prospects: TopProspect[];
  upcoming_actions: UpcomingAction[];
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ProspectingDashboardPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [scope, setScope] = useState<"team" | "mine">("team");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) { setState("denied"); return; }
      const result = await supabase.rpc("prospect_metrics", { p_scope: scope });
      if (!active) return;
      if (result.error) setError("O dashboard precisa da migração de métricas de prospeção no Supabase.");
      else setError("");
      setMetrics((result.data ?? null) as Metrics | null);
      setState("allowed");
    });
    return () => { active = false; };
  }, [scope]);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;

  const cards = [
    ["Prospects assumidos", metrics?.assigned ?? 0],
    ["Pool disponível", metrics?.available ?? 0],
    ["Próximas ações vencidas", metrics?.overdue ?? 0],
    ["Atividades (30 dias)", metrics?.activities_30d ?? 0],
    ["Ganhos", metrics?.won ?? 0],
    ["Perdidos", metrics?.lost ?? 0],
  ] as const;

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice/prospeccao" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Prospecção</Link>
      <header className="mt-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Dashboard comercial</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Pulso da prospeção</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Métricas agregadas do funil comercial e as próximas ações a cumprir.</p>
        </div>
        <div role="group" aria-label="Âmbito das métricas" className="inline-flex rounded-xl border border-slate-800 bg-slate-900/60 p-1 text-sm">
          <button type="button" onClick={() => setScope("team")} aria-pressed={scope === "team"} className={`rounded-lg px-4 py-2 font-medium transition ${scope === "team" ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-white"}`}>Equipa</button>
          <button type="button" onClick={() => setScope("mine")} aria-pressed={scope === "mine"} className={`rounded-lg px-4 py-2 font-medium transition ${scope === "mine" ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:text-white"}`}>Só as minhas</button>
        </div>
      </header>

      {error ? <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div> : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{Number(value).toLocaleString("pt-PT")}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="flex items-center gap-2 font-semibold text-white"><Flame size={18} className="text-cyan-300" />Potencial mais quente</h2>
          <div className="mt-5 space-y-3">
            {metrics?.top_prospects.length ? metrics.top_prospects.map((item) => (
              <Link key={item.company_id} href={`/backoffice/prospeccao/${item.company_id}`} className="flex items-center justify-between gap-4 rounded-xl bg-slate-950/60 p-4 hover:bg-slate-900">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{item.company_name}</p>
                  <p className="mt-1 text-xs text-slate-500">NIF {item.company_nif || "—"} · {item.status ? statusLabels[item.status] : "Disponível"}</p>
                </div>
                <span className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-sm font-semibold text-cyan-200">{item.prospect_score}</span>
              </Link>
            )) : <p className="text-sm text-slate-500">Sem prospects assumidos para este âmbito.</p>}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="flex items-center gap-2 font-semibold text-white"><Layers size={18} className="text-cyan-300" />Por estado</h2>
            <div className="mt-5 space-y-2">
              {metrics?.by_status.length ? metrics.by_status.map((item) => (
                <div key={item.status} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{statusLabels[item.status] || item.status}</span>
                  <span className="font-semibold text-white">{item.count.toLocaleString("pt-PT")}</span>
                </div>
              )) : <p className="text-sm text-slate-500">Sem prospects atribuídos.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="flex items-center gap-2 font-semibold text-white"><UserCheck size={18} className="text-cyan-300" />Próximas ações</h2>
            <div className="mt-5 space-y-3">
              {metrics?.upcoming_actions.length ? metrics.upcoming_actions.map((item) => (
                <Link key={item.prospect_id} href={`/backoffice/prospeccao/${item.company_id}`} className="block rounded-xl bg-slate-950/60 p-4 hover:bg-slate-900">
                  <p className="truncate text-sm font-medium text-white">{item.company_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(item.next_action_at)} · {item.status ? statusLabels[item.status] : "Disponível"}</p>
                </Link>
              )) : <p className="text-sm text-slate-500">Sem ações agendadas.</p>}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm leading-6 text-slate-500">
        <TrendingUp size={19} className="mt-0.5 shrink-0 text-cyan-300" />
        <p>As métricas refletem apenas prospects e atividades da tua organização. Os scores são recalculados a partir da atividade real em contratação pública.</p>
      </div>
    </BackofficeShell>
  );
}
