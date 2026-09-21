"use client";

import Link from "next/link";
import { ArrowLeft, Gauge, LockKeyhole, Play, ShieldAlert, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";
import {
  type LeadScoreComponent,
  type LeadScoreRow,
  type LeadScoringRunFilters,
  type LeadScoringRunResult,
  LEAD_SCORE_COMPONENTS,
  distributionTotal,
  leadBandLabel,
  runLeadScoring,
} from "@/lib/leadScoring";

const allowedRoles = new Set(["admin", "commercial_manager"]);

/** Rótulos legíveis dos componentes (para a transparência do score). */
const componentLabels: Record<LeadScoreComponent, string> = {
  opportunity_fit: "Oportunidades compatíveis",
  market_value: "Valor agregado",
  contact_quality: "Qualidade do contacto",
  company_fit: "Encaixe da empresa",
  public_procurement_gap: "Oportunidade de entrada",
  data_confidence: "Confiança dos dados",
};

const bandStyles: Record<string, string> = {
  LOW: "border-slate-600/30 bg-slate-500/10 text-slate-300",
  MEDIUM: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  HIGH: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  VERY_HIGH: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

const emptyFilters: LeadScoringRunFilters = {
  minScore: null,
  maxScore: null,
  band: null,
  cae: null,
  cpv: null,
  district: null,
  contactAvailable: false,
  genericEmail: false,
  minOpportunities: null,
  minValue: null,
  includeOptedOut: false,
  sampleLimit: 100,
};

function formatEuro(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export default function LeadScoringPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [filters, setFilters] = useState<LeadScoringRunFilters>(emptyFilters);
  const [result, setResult] = useState<LeadScoringRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      setState(data.user && allowedRoles.has(role) ? "allowed" : "denied");
    });
  }, []);

  const runScoring = useCallback(async () => {
    setRunning(true);
    setError("");
    try {
      const data = await runLeadScoring(filters);
      setResult(data);
    } catch {
      setError("O motor de scoring precisa da migração `20261001090000_lead_scoring.sql` no Supabase.");
      setResult(null);
    }
    setRunning(false);
  }, [filters]);

  const distribution = useMemo(
    () => result?.distribution ?? { LOW: 0, MEDIUM: 0, HIGH: 0, VERY_HIGH: 0 },
    [result],
  );
  const total = distributionTotal(distribution);

  const bandCards = useMemo(
    () =>
      (["VERY_HIGH", "HIGH", "MEDIUM", "LOW"] as const).map((key) => ({
        key,
        label: leadBandLabel[key],
        count: distribution[key],
        share: total > 0 ? Math.round((distribution[key] / total) * 100) : 0,
      })),
    [distribution, total],
  );

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied")
    return (
      <main className="min-h-screen px-4 py-16 text-center text-slate-400">
        <LockKeyhole className="mx-auto text-cyan-300" size={28} />
        <p className="mt-4">Área reservada.</p>
      </main>
    );

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice/prospeccao" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300">
        <ArrowLeft size={15} /> Prospecção
      </Link>

      <header className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Lead Scoring</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Priorização comercial por score</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Score 0-100 determinístico, calculado a partir de dados objetivos: oportunidades compatíveis, valor agregado, qualidade
          do contacto, encaixe da empresa, oportunidade de entrada e confiança dos dados. Cada score mostra os componentes que o
          sustentam. Prospects com opt-out nunca são elegíveis para contacto.
        </p>
      </header>

      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <Gauge size={18} className="text-cyan-300" /> Filtros de scoring
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm">
            <span className="text-slate-400">Score mínimo</span>
            <input
              type="number"
              min={0}
              max={100}
              value={filters.minScore ?? ""}
              onChange={(event) => setFilters((f) => ({ ...f, minScore: event.target.value === "" ? null : Number(event.target.value) }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-400">Portão</span>
            <select
              value={filters.band ?? ""}
              onChange={(event) => setFilters((f) => ({ ...f, band: (event.target.value || null) as LeadScoringRunFilters["band"] }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
            >
              <option value="">Todos</option>
              <option value="LOW">Baixa (0-39)</option>
              <option value="MEDIUM">Média (40-59)</option>
              <option value="HIGH">Alta (60-79)</option>
              <option value="VERY_HIGH">Muito alta (80-100)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-400">Distrito</span>
            <input
              type="text"
              placeholder="Lisboa"
              value={filters.district ?? ""}
              onChange={(event) => setFilters((f) => ({ ...f, district: event.target.value || null }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-400">CAE</span>
            <input
              type="text"
              placeholder="41200"
              value={filters.cae ?? ""}
              onChange={(event) => setFilters((f) => ({ ...f, cae: event.target.value || null }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-400">CPV (prefixo)</span>
            <input
              type="text"
              placeholder="45"
              value={filters.cpv ?? ""}
              onChange={(event) => setFilters((f) => ({ ...f, cpv: event.target.value || null }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-400">Valor mínimo (€)</span>
            <input
              type="number"
              min={0}
              value={filters.minValue ?? ""}
              onChange={(event) => setFilters((f) => ({ ...f, minValue: event.target.value === "" ? null : Number(event.target.value) }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-5 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.genericEmail ?? false}
              onChange={(event) => setFilters((f) => ({ ...f, genericEmail: event.target.checked }))}
              className="accent-cyan-400"
            />
            Só com email genérico
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.contactAvailable ?? false}
              onChange={(event) => setFilters((f) => ({ ...f, contactAvailable: event.target.checked }))}
              className="accent-cyan-400"
            />
            Só com contacto disponível
          </label>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={runScoring}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            <Play size={16} /> {running ? "A calcular…" : "Executar scoring"}
          </button>
          <button
            type="button"
            onClick={() => setFilters(emptyFilters)}
            className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:border-slate-500"
          >
            Limpar filtros
          </button>
        </div>
      </section>

      {error ? <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div> : null}

      {result ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {bandCards.map((card) => (
              <div key={card.key} className={`rounded-2xl border p-5 ${bandStyles[card.key]}`}>
                <p className="text-xs uppercase tracking-wider opacity-80">{card.label}</p>
                <p className="mt-2 text-3xl font-semibold">{card.count.toLocaleString("pt-PT")}</p>
                <p className="mt-1 text-xs opacity-80">{card.share}% dos prospects</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">Avaliados</p>
              <p className="mt-2 text-2xl font-semibold text-white">{result.scored.toLocaleString("pt-PT")}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">Elegíveis para contacto</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-200">{result.eligible.toLocaleString("pt-PT")}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">Bloqueados por opt-out</p>
              <p className="mt-2 text-2xl font-semibold text-slate-300">{result.blocked_opt_out.toLocaleString("pt-PT")}</p>
            </div>
          </div>

          <section className="mt-8">
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <Sparkles size={18} className="text-cyan-300" /> Ranking ({result.rows.length})
            </h2>
            <div className="mt-5 space-y-3">
              {result.rows.length ? (
                result.rows.map((row) => (
                  <ScoreCard
                    key={row.score_id}
                    row={row}
                    expanded={expanded === row.score_id}
                    onToggle={() => setExpanded((current) => (current === row.score_id ? null : row.score_id))}
                  />
                ))
              ) : (
                <p className="text-sm text-slate-500">Sem prospects que correspondam aos filtros.</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm leading-6 text-slate-500">
          <Sparkles size={19} className="mt-0.5 shrink-0 text-cyan-300" />
          <p>Configura os filtros e executa o scoring para gerar o ranking e a distribuição por portão.</p>
        </div>
      )}
    </BackofficeShell>
  );
}

function ScoreCard({ row, expanded, onToggle }: { row: LeadScoreRow; expanded: boolean; onToggle: () => void }) {
  const components = (row.components ?? {}) as Record<LeadScoreComponent, number>;
  return (
    <div className={`rounded-2xl border bg-slate-900/60 p-5 ${row.eligible ? "border-slate-800" : "border-slate-800/60 opacity-80"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{row.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            NIF {row.nif || "—"} · {row.district || "Localização desconhecida"} · {row.cae ? `CAE ${row.cae}` : "CAE —"}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>{row.matching_opportunities} oportunidades</span>
            <span>{formatEuro(row.estimated_opportunity_value)}</span>
            {row.email ? <span>{row.email}</span> : null}
            {row.phone ? <span>{row.phone}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${bandStyles[row.band]}`}>{leadBandLabel[row.band]}</span>
          <span className="text-2xl font-semibold text-white">{row.score}</span>
        </div>
      </div>

      {!row.eligible ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
          <ShieldAlert size={14} /> {row.blocked_reason ?? "Não elegível para contacto"}
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">Explicação</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {(row.reasons ?? []).slice(0, expanded ? undefined : 3).map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
          {!row.reasons?.length ? <li className="text-slate-500">Sem dados suficientes para explicar o score.</li> : null}
        </ul>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {LEAD_SCORE_COMPONENTS.map((key) => (
            <div key={key} className="rounded-xl bg-slate-950/60 p-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{componentLabels[key]}</span>
                <span className="font-semibold text-white">{components[key] ?? 0}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${components[key] ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" onClick={onToggle} className="mt-4 text-xs font-medium text-cyan-300 hover:text-cyan-200">
        {expanded ? "Ocultar componentes do score" : "Ver componentes do score"}
      </button>
    </div>
  );
}
