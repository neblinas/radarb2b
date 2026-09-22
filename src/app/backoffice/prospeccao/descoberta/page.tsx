"use client";

import Link from "next/link";
import { ArrowLeft, Compass, DatabaseZap, Loader2, LockKeyhole, Play, ShieldAlert } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";
import {
  bucketCandidate,
  candidateBucketLabel,
  distributionTotal,
  inferredSizeLabel,
  listProspectDiscoveryRuns,
  runProspectDiscovery,
  type DiscoveryRun,
  type DiscoveryResult,
} from "@/lib/prospectDiscovery";

// Execução do motor exige admin/commercial_manager (validado também no backend).
const allowedRoles = new Set(["admin", "commercial_manager"]);

const bucketClass: Record<string, string> = {
  new: "text-emerald-300 border-emerald-400/20 bg-emerald-400/5",
  duplicate: "text-slate-300 border-slate-600 bg-slate-800/40",
  opt_out: "text-rose-300 border-rose-400/20 bg-rose-400/5",
  low_signal: "text-amber-300 border-amber-400/20 bg-amber-400/5",
};

function formatEuro(value: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export default function ProspectDiscoveryPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [categories, setCategories] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [history, setHistory] = useState<DiscoveryRun[]>([]);

  // Critérios.
  const [minScore, setMinScore] = useState("40");
  const [category, setCategory] = useState("");
  const [district, setDistrict] = useState("");
  const [minOpportunities, setMinOpportunities] = useState("1");
  const [minValue, setMinValue] = useState("");
  const [sampleLimit, setSampleLimit] = useState("50");

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) { setState("denied"); return; }
      setState("allowed");
      void supabase.rpc("prospect_categories").then(({ data: catData }) => {
        if (active && Array.isArray(catData)) setCategories(catData as string[]);
      });
      void listProspectDiscoveryRuns(10).then((runs) => { if (active) setHistory(runs); }).catch(() => {});
    });
    return () => { active = false; };
  }, []);

  async function runDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true); setError("");
    try {
      const data = await runProspectDiscovery({
        minScore: Number(minScore) || 0,
        radarCategory: category || null,
        district: district || null,
        minOpportunities: Number(minOpportunities) || 1,
        minValue: minValue ? Number(minValue) : null,
        sampleLimit: sampleLimit ? Number(sampleLimit) : null,
      });
      setResult(data);
      setHistory(await listProspectDiscoveryRuns(10));
        } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
      setError(`Não foi possível executar a descoberta${detail}. Confirma as permissões e a migração da FASE 3.`);
    }
    setRunning(false);
  }

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada a admin e gestores comerciais.</p></main>;

  const counters = result
    ? [
        ["Empresas analisadas", result.companies_analyzed],
        ["Candidatos gerados", result.candidates_generated],
        ["Prospects novos", result.new_prospects],
        ["Ignorados (duplicados)", result.skipped_duplicates],
        ["Ignorados (opt-out)", result.skipped_opt_out],
        ["Sem sinal suficiente", result.skipped_low_signal],
      ] as const
    : [];

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice/prospeccao" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Prospecção</Link>
      <header className="mt-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Descoberta de prospects</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Prospect Discovery Engine</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Identifica empresas com sinal real de contratação pública a partir dos dados já existentes. Execução manual — sem crawling, sem contactos externos e sem automação.</p>
        </div>
      </header>

      <form onSubmit={runDiscovery} className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="flex items-center gap-2 font-semibold text-white"><Compass size={18} className="text-cyan-300" />Critérios</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm text-slate-400">Score mínimo
            <input type="number" min="0" max="100" value={minScore} onChange={(event) => setMinScore(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
          </label>
          <label className="text-sm text-slate-400">Ramo de negócio (CPV)
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white">
              <option value="">Todos os ramos</option>
              {categories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-400">Distrito
            <input value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="ex.: Lisboa" className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
          </label>
          <label className="text-sm text-slate-400">Mín. oportunidades
            <input type="number" min="0" value={minOpportunities} onChange={(event) => setMinOpportunities(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
          </label>
          <label className="text-sm text-slate-400">Valor mínimo (EUR)
            <input type="number" min="0" value={minValue} onChange={(event) => setMinValue(event.target.value)} placeholder="ex.: 100000" className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
          </label>
          <label className="text-sm text-slate-400">Amostra (empresas)
            <input type="number" min="1" value={sampleLimit} onChange={(event) => setSampleLimit(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="submit" disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
            {running ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}Executar descoberta
          </button>
          <p className="text-xs text-slate-500">Não cria prospects automaticamente: gera candidatos auditados para revisão.</p>
        </div>
      </form>

      {error ? <p className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</p> : null}

      {result ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {counters.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{Number(value).toLocaleString("pt-PT")}</p>
              </div>
            ))}
          </div>

          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="font-semibold text-white">Distribuição de scores</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              {([["< 40", result.score_distribution.lt40], ["40–59", result.score_distribution["40_59"]], ["60–79", result.score_distribution["60_79"]], ["≥ 80", result.score_distribution.gte80]] as const).map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Total classificado: {distributionTotal(result.score_distribution).toLocaleString("pt-PT")}</p>
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 p-5"><h2 className="flex items-center gap-2 font-semibold text-white"><DatabaseZap size={18} className="text-cyan-300" />Candidatos</h2><p className="mt-1 text-xs text-slate-500">Todos os candidatos com motivo de seleção transparente. Duplicados e opt-out são claramente identificados.</p></div>
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[minmax(200px,1.4fr)_110px_90px_140px_130px_180px] gap-4 border-b border-slate-800 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <span>Empresa</span><span>Score</span><span>Oport.</span><span>Valor</span><span>Localização</span><span>Estado / motivo</span>
              </div>
              {result.candidates.length ? result.candidates.map((candidate) => {
                const bucket = bucketCandidate(candidate);
                return (
                  <div key={candidate.company_id} className="grid grid-cols-[minmax(200px,1.4fr)_110px_90px_140px_130px_180px] items-start gap-4 border-b border-slate-800 px-5 py-4 last:border-0">
                    <div className="min-w-0">
                      <Link href={`/backoffice/prospeccao/${candidate.company_id}`} className="truncate font-medium text-white hover:text-cyan-200">{candidate.name}</Link>
                      <p className="mt-1 text-xs text-slate-500">NIF {candidate.nif || "—"}{candidate.categories.length ? <> · <span className="text-cyan-400/80">{candidate.categories.join(", ")}</span></> : null}{candidate.cae_compatible ? <> · CAE {candidate.cae_compatible}</> : null}</p>
                    </div>
                    <span className="text-sm font-semibold text-cyan-200">{candidate.total_score} <span className="text-xs font-normal text-slate-500">{inferredSizeLabel[candidate.inferred_size]}</span></span>
                    <span className="text-sm text-slate-300">{candidate.participation_count}</span>
                    <span className="text-sm text-slate-300">{formatEuro(candidate.total_award_value)}</span>
                    <span className="text-sm text-slate-400">{candidate.district || "—"}</span>
                    <div className="space-y-1.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${bucketClass[bucket]}`}>{candidateBucketLabel[bucket]}</span>
                      {candidate.reasons.length ? <ul className="space-y-0.5 text-xs text-slate-500">{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
                    </div>
                  </div>
                );
              }) : <p className="p-8 text-center text-sm text-slate-500">Nenhum candidato para estes critérios.</p>}
            </div>
          </section>
        </>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="font-semibold text-white">Execuções recentes</h2>
        {history.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="pb-3">Data</th><th className="pb-3">Analisadas</th><th className="pb-3">Novos</th><th className="pb-3">Duplicados</th><th className="pb-3">Opt-out</th><th className="pb-3">Sem sinal</th><th className="pb-3">Amostra</th></tr>
              </thead>
              <tbody className="text-slate-300">
                {history.map((run) => (
                  <tr key={run.id} className="border-t border-slate-800">
                    <td className="py-3">{new Date(run.created_at).toLocaleString("pt-PT")}</td>
                    <td className="py-3">{run.companies_analyzed}</td>
                    <td className="py-3 text-emerald-300">{run.new_prospects}</td>
                    <td className="py-3">{run.skipped_duplicates}</td>
                    <td className="py-3">{run.skipped_opt_out}</td>
                    <td className="py-3">{run.skipped_low_signal}</td>
                    <td className="py-3">{run.sample_limit ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-4 text-sm text-slate-500">Ainda não há execuções registadas.</p>}
      </section>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm leading-6 text-slate-500">
        <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-300" />
        <p>Correspondência CAE↔CPV: a arquitetura está preparada, mas não há mapeamento fiável nem dados CAE suficientes. Nenhuma relação é inventada — o campo CAE só aparece quando existe um mapeamento revisto por humano com fonte documentada. Nesta fase não se procuram websites, emails ou telefones.</p>
      </div>
    </BackofficeShell>
  );
}
