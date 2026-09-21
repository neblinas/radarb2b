"use client";

import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, LockKeyhole, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";
import {
  type ProspectManagementFilters,
  type ProspectManagementMetrics,
  type ProspectManagementRow,
  commercialStatusLabelDetailed,
  emptyManagementFilters,
  enrichmentStatusLabelDetailed,
  formatEuroShort,
  getManagementMetrics,
  listManagementProspects,
  managementPages,
  managementTotal,
} from "@/lib/prospectManagement";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
const pageSize = 25;

const statusFilters = [
  ["", "Todos os estados"],
  ["NEW", "Novo"],
  ["ELIGIBLE", "Elegível"],
  ["REJECTED", "Rejeitado"],
  ["READY_FOR_AUTOPILOT", "Pronto para Autopilot"],
  ["IN_AUTOPILOT", "No Autopilot"],
  ["CONTACTED", "Contactado"],
  ["CONVERTED", "Convertido"],
  ["OPTED_OUT", "Opt-out"],
];

const enrichmentFilters = [
  ["", "Todos os estágios"],
  ["NEW", "Novo"],
  ["PENDING_ENRICHMENT", "A enriquecer"],
  ["WEBSITE_FOUND", "Website encontrado"],
  ["CONTACT_FOUND", "Contacto encontrado"],
  ["VALIDATED", "Validado"],
  ["ELIGIBLE", "Elegível"],
  ["REJECTED", "Rejeitado"],
  ["READY_FOR_AUTOPILOT", "Pronto para Autopilot"],
];

function healthClass(row: ProspectManagementRow) {
  if (row.opt_out || row.commercial_status === "OPTED_OUT") return "text-slate-400 border-slate-600/30 bg-slate-500/10";
  if (row.commercial_status === "REJECTED") return "text-slate-400 border-slate-600/30 bg-slate-500/10";
  if (row.commercial_score != null && row.commercial_score >= 60) return "text-cyan-200 border-cyan-400/30 bg-cyan-400/10";
  if (row.commercial_score != null && row.commercial_score >= 40) return "text-amber-200 border-amber-400/30 bg-amber-400/10";
  return "text-slate-300 border-slate-600/30 bg-slate-500/10";
}

export default function ProspectingManagementPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [filters, setFilters] = useState<ProspectManagementFilters>({ ...emptyManagementFilters, pageSize });
  const [rows, setRows] = useState<ProspectManagementRow[]>([]);
  const [metrics, setMetrics] = useState<ProspectManagementMetrics | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      setState(data.user && allowedRoles.has(role) ? "allowed" : "denied");
    });
    void supabase.rpc("prospect_categories").then(({ data }) => {
      if (Array.isArray(data)) setCategories(data as string[]);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, summary] = await Promise.all([
        listManagementProspects(filters),
        getManagementMetrics().catch(() => null),
      ]);
      setRows(list);
      if (summary) setMetrics(summary);
    } catch {
      setError("Não foi possível carregar a gestão de prospeção. Confirma se a migração `20261002090000_prospecting_management.sql` foi aplicada no Supabase.");
      setRows([]);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    if (state !== "allowed") return;
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [state, load]);

  const update = useCallback((patch: Partial<ProspectManagementFilters>) => {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }, []);

  const total = managementTotal(rows);
  const pages = managementPages(total, filters.pageSize ?? pageSize);
  const page = filters.page ?? 1;

  const metricCards = useMemo(() => {
    const m = metrics;
    return [
      ["Total de prospects", m?.total ?? 0],
      ["Elegíveis / enriquecidos", m?.enriched ?? 0],
      ["Com contacto público", m?.with_public_contact ?? 0],
      ["Prontos para Autopilot", m?.ready_for_autopilot ?? 0],
      ["Contactados", m?.contacted ?? 0],
      ["Convertidos", m?.converted ?? 0],
      ["Opt-out", m?.opted_out ?? 0],
    ] as const;
  }, [metrics]);

  if (state === "loading")
    return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Gestão de prospeção</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Revisão e operação do funil de prospects</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Uma visão única das empresas-prospecto: filtra, abre o detalhe e executa as ações administrativas (aprovar, rejeitar,
          preparar para Autopilot ou aplicar opt-out). As transições são validadas e auditadas no backend.
        </p>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value.toLocaleString("pt-PT")}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={filters.query ?? ""}
              onChange={(event) => update({ query: event.target.value || null })}
              placeholder="Pesquisar por empresa ou NIF…"
              className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400/50"
            />
          </div>
          <select
            value={filters.commercialStatus ?? ""}
            onChange={(event) => update({ commercialStatus: event.target.value || null })}
            aria-label="Estado comercial"
            className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-300"
          >
            {statusFilters.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-800 px-4 text-sm text-slate-300 hover:border-cyan-400/40 hover:text-white"
          >
            <SlidersHorizontal size={15} /> {showAdvanced ? "Menos filtros" : "Mais filtros"}
          </button>
        </div>

        {showAdvanced ? (
          <div className="mt-4 grid gap-4 border-t border-slate-800 pt-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm">
              <span className="text-slate-400">Estágio de enriquecimento</span>
              <select
                value={filters.enrichmentStatus ?? ""}
                onChange={(event) => update({ enrichmentStatus: event.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
              >
                {enrichmentFilters.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-400">Ramo</span>
              <select
                value={filters.category ?? ""}
                onChange={(event) => update({ category: event.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
              >
                <option value="">Todos os ramos</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-400">Distrito</span>
              <input
                type="text"
                value={filters.district ?? ""}
                onChange={(event) => update({ district: event.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-400">CAE</span>
              <input
                type="text"
                value={filters.cae ?? ""}
                onChange={(event) => update({ cae: event.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-400">CPV (prefixo)</span>
              <input
                type="text"
                value={filters.cpv ?? ""}
                onChange={(event) => update({ cpv: event.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-400">Score mínimo</span>
              <input
                type="number"
                min={0}
                max={100}
                value={filters.minScore ?? ""}
                onChange={(event) => update({ minScore: event.target.value === "" ? null : Number(event.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-400">Valor mínimo (€)</span>
              <input
                type="number"
                min={0}
                value={filters.minValue ?? ""}
                onChange={(event) => update({ minValue: event.target.value === "" ? null : Number(event.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
              />
            </label>
            <div className="flex flex-col justify-end gap-3 text-sm text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.hasWebsite ?? false}
                  onChange={(event) => update({ hasWebsite: event.target.checked })}
                  className="accent-cyan-400"
                />
                Só com website
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.hasEmail ?? false}
                  onChange={(event) => update({ hasEmail: event.target.checked })}
                  className="accent-cyan-400"
                />
                Só com email
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.includeOptOut ?? false}
                  onChange={(event) => update({ includeOptOut: event.target.checked })}
                  className="accent-cyan-400"
                />
                Incluir opt-out
              </label>
            </div>
          </div>
        ) : null}
      </section>

      {error ? <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</p> : null}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="min-w-[1180px]">
          <div className="grid grid-cols-[minmax(220px,1.6fr)_110px_130px_120px_150px_140px_140px] gap-4 border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <span>Empresa</span>
            <span>Score</span>
            <span>Estado</span>
            <span>Enriquecimento</span>
            <span>Contacto</span>
            <span>Valor</span>
            <span>Ação</span>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
              <Loader2 className="animate-spin" size={17} />A carregar gestão de prospeção…
            </div>
          ) : rows.length ? (
            rows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[minmax(220px,1.6fr)_110px_130px_120px_150px_140px_140px] items-center gap-4 border-b border-slate-800 px-5 py-4 last:border-0"
              >
                <Link href={`/backoffice/prospeccao/gestao/${row.id}`} className="min-w-0 hover:text-cyan-200">
                  <p className="truncate font-medium text-white">{row.name}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    NIF {row.nif || "—"}
                    {row.categories && row.categories.length
                      ? <> · <span className="text-cyan-400/80">{row.categories.join(", ")}</span></>
                      : row.cpv_codes && row.cpv_codes.length
                        ? <> · {row.cpv_codes.slice(0, 3).join(", ")}</>
                        : " · CPV não disponível"}
                  </p>
                </Link>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${healthClass(row)}`}>
                  {row.commercial_score ?? "—"}
                </span>
                <span className="text-xs text-slate-300">
                  {commercialStatusLabelDetailed[row.commercial_status] ?? row.commercial_status}
                </span>
                <span className="text-xs text-slate-400">
                  {enrichmentStatusLabelDetailed[row.enrichment_status] ?? row.enrichment_status}
                </span>
                <span className="min-w-0 text-xs text-slate-400">
                  {row.email ? (
                    <span className="block truncate text-slate-300">{row.email}</span>
                  ) : row.has_public_contact ? (
                    "Contacto público recolhido"
                  ) : (
                    "Sem contacto"
                  )}
                </span>
                <span className="text-sm text-slate-300">{formatEuroShort(row.estimated_opportunity_value)}</span>
                <Link
                  href={`/backoffice/prospeccao/gestao/${row.id}`}
                  className="w-fit rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/10"
                >
                  Gerir ficha
                </Link>
              </div>
            ))
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">Não há prospects para estes filtros.</p>
          )}
        </div>
      </div>

      {pages > 1 ? (
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => update({ page: page - 1 })}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300 disabled:opacity-40"
          >
            <ChevronLeft size={16} />Anterior
          </button>
          <span className="py-2 text-sm text-slate-500">
            {page} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => update({ page: page + 1 })}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300 disabled:opacity-40"
          >
            Seguinte<ChevronRight size={16} />
          </button>
        </div>
      ) : null}
    </BackofficeShell>
  );
}
