"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LockKeyhole,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";
import {
  type ManagementAction,
  type ManagementBulkResult,
  type ProspectManagementFilters,
  type ProspectManagementMetrics,
  type ProspectManagementRow,
  bulkResultMessage,
  commercialStatusLabelDetailed,
  emptyManagementFilters,
  enrichmentStatusLabelDetailed,
  formatEuroShort,
  getManagementMetrics,
  listManagementProspects,
  managementActionLabel,
  managementActions,
  managementBulkActionDescription,
  managementPages,
  managementTotal,
  prepareProspectsForAutopilot,
  prepareResultMessage,
  pruneSelection,
  runManagementBulkAction,
  selectableRowIds,
  summarizeBulkResults,
  type PrepareAutopilotItem,
} from "@/lib/prospectManagement";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
const manageRoles = new Set(["admin", "commercial_manager"]);
const pageSize = 25;

const actionIcon: Record<ManagementAction, typeof CheckCircle2> = {
  APPROVE: CheckCircle2,
  READY_AUTOPILOT: Send,
  REJECT: XCircle,
  OPT_OUT: ShieldAlert,
  RESET: RotateCcw,
};

const actionStyle: Record<ManagementAction, string> = {
  APPROVE: "border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10",
  READY_AUTOPILOT: "border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10",
  REJECT: "border-slate-600 text-slate-300 hover:bg-slate-500/10",
  OPT_OUT: "border-rose-400/30 text-rose-200 hover:bg-rose-400/10",
  RESET: "border-slate-700 text-slate-300 hover:bg-slate-500/10",
};

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
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<ManagementAction | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const [bulkResults, setBulkResults] = useState<ManagementBulkResult[]>([]);
  const [prepareBusy, setPrepareBusy] = useState(false);
  const [prepareResults, setPrepareResults] = useState<PrepareAutopilotItem[]>([]);

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
    // Ao mudar filtros/página, a seleção deixa de fazer sentido.
    setSelected([]);
    setBulkAction(null);
    setBulkNotice("");
    setBulkResults([]);
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }, []);

  // A seleção só considera linhas visíveis na página atual (evita agir sobre
  // registos que desapareceram com filtros/paginação).
  const pageIds = useMemo(() => selectableRowIds(rows), [rows]);
  const validSelection = useMemo(() => pruneSelection(selected, rows), [selected, rows]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => validSelection.includes(id));

  const canManage = manageRoles.has(identity.role);

  const toggleRow = useCallback((id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((current) => {
      const visible = selectableRowIds(rows);
      const allSelected = visible.length > 0 && visible.every((id) => current.includes(id));
      return allSelected ? [] : visible;
    });
  }, [rows]);

  const requestBulkAction = useCallback((action: ManagementAction) => {
    setBulkNotice("");
    setBulkResults([]);
    setBulkAction((current) => (current === action ? null : action));
  }, []);

  const performBulkAction = useCallback(
    async (action: ManagementAction) => {
      const ids = pruneSelection(selected, rows);
      if (!ids.length) {
        setBulkAction(null);
        return;
      }
      setBulkBusy(true);
      setBulkNotice("");
      setBulkResults([]);
      try {
        const results = await runManagementBulkAction(ids, action);
        setBulkResults(results);
        setBulkNotice(bulkResultMessage(action, results));
        setBulkAction(null);
        setSelected([]);
        await load();
      } catch {
        setBulkNotice("Não foi possível aplicar a ação em lote. Confirma a migração `20261007090000_prospecting_management_bulk.sql` e as permissões.");
      }
      setBulkBusy(false);
    },
    [selected, rows, load],
  );

  const performPrepare = useCallback(async () => {
    const ids = pruneSelection(selected, rows);
    if (!ids.length) return;
    setPrepareBusy(true);
    setBulkNotice("");
    setBulkResults([]);
    setPrepareResults([]);
    try {
      const results = await prepareProspectsForAutopilot(ids);
      setPrepareResults(results);
      setBulkNotice(prepareResultMessage(results));
      setSelected([]);
      await load();
    } catch {
      setBulkNotice("Não foi possível preparar para o Autopilot. Confirma a migração `20261011090000_prospect_prepare_autopilot.sql` e as permissões.");
    }
    setPrepareBusy(false);
  }, [selected, rows, load]);
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

  const blockedResults = bulkResults.filter((result) => !result.applied);

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
          preparar para Autopilot, aplicar opt-out ou reiniciar estado). Podes agir prospect a prospect ou selecionar vários e
          aplicar a mesma ação em lote. As transições são validadas e auditadas no backend.
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

      {canManage ? (
        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-white">Ações em lote</span>
              <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300">
                {validSelection.length} selecionado(s)
              </span>
              {validSelection.length ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelected([]);
                    setBulkAction(null);
                    setBulkNotice("");
                    setBulkResults([]);
                  }}
                  className="text-xs text-slate-500 hover:text-cyan-300"
                >
                  Limpar seleção
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {managementActions.map((action) => {
                const Icon = actionIcon[action];
                const disabled = validSelection.length === 0 || bulkBusy;
                const isActive = bulkAction === action;
                return (
                  <button
                    key={action}
                    type="button"
                    disabled={disabled}
                    onClick={() => requestBulkAction(action)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${actionStyle[action]} ${isActive ? "ring-1 ring-cyan-400/40" : ""}`}
                  >
                    {bulkBusy && isActive ? <Loader2 className="animate-spin" size={14} /> : <Icon size={14} />}
                    {managementActionLabel[action]}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={validSelection.length === 0 || prepareBusy}
                onClick={() => void performPrepare()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="Inscreve as empresas selecionadas no Autopilot e prepara a mensagem por empresa"
              >
                {prepareBusy ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                Inscrever no Autopilot
              </button>
            </div>
          </div>

          {bulkAction ? (
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">
                {managementBulkActionDescription[bulkAction]} Serão afetados {validSelection.length} prospecto(s) da seleção.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void performBulkAction(bulkAction)}
                  disabled={bulkBusy || validSelection.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-60"
                >
                  {bulkBusy ? <Loader2 className="animate-spin" size={14} /> : null}
                  Confirmar em lote
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAction(null)}
                  disabled={bulkBusy}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {bulkNotice ? (
            <p className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-cyan-200">{bulkNotice}</p>
          ) : null}

          {blockedResults.length ? (
            <div className="mt-3 space-y-1.5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
              <p className="text-xs font-semibold text-amber-200">Detalhe dos bloqueados</p>
              {blockedResults.map((result) => {
                const name = rows.find((row) => row.id === result.prospect_id)?.name ?? result.prospect_id;
                return (
                  <p key={result.prospect_id} className="text-xs text-amber-100/90">
                    {name}: {result.error || "não aplicado"}
                  </p>
                );
              })}
              <p className="pt-1 text-[11px] text-amber-100/70">
                {summarizeBulkResults(bulkResults).applied} aplicado(s) · {summarizeBulkResults(bulkResults).failed} bloqueado(s)
              </p>
            </div>
          ) : null}

          {prepareResults.length ? (
            <div className="mt-3 space-y-1.5 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
              <p className="text-xs font-semibold text-cyan-200">Inscrição no Autopilot — detalhe por empresa</p>
              {prepareResults.map((result) => {
                const name = rows.find((row) => row.id === result.prospect_id)?.name ?? result.prospect_id;
                return (
                  <p key={result.prospect_id} className={`text-xs ${result.ok ? "text-emerald-200" : "text-amber-100/90"}`}>
                    {name}: {result.reason}
                  </p>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : (
        <p className="mt-5 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">
          Só admin e gestor comercial podem executar ações. Podes consultar a lista e as fichas.
        </p>
      )}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="min-w-[1210px]">
          <div className="grid grid-cols-[40px_minmax(220px,1.6fr)_110px_130px_120px_150px_140px_140px] gap-4 border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <span className="flex items-center">
              <input
                type="checkbox"
                aria-label="Selecionar todos os prospects da página"
                checked={allPageSelected}
                disabled={!canManage || pageIds.length === 0}
                onChange={toggleAll}
                className="h-4 w-4 accent-cyan-400 disabled:opacity-40"
              />
            </span>
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
                className="grid grid-cols-[40px_minmax(220px,1.6fr)_110px_130px_120px_150px_140px_140px] items-center gap-4 border-b border-slate-800 px-5 py-4 last:border-0"
              >
                <span className="flex items-center">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${row.name}`}
                    checked={validSelection.includes(row.id)}
                    disabled={!canManage}
                    onChange={() => toggleRow(row.id)}
                    className="h-4 w-4 accent-cyan-400 disabled:opacity-40"
                  />
                </span>
                <Link href={`/backoffice/prospeccao/gestao/${row.id}`} className="min-w-0 hover:text-cyan-200">
                  <p className="truncate font-medium text-white">{row.name}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    NIF {row.nif || "—"}
                    {row.categories && row.categories.length ? (
                      <span className="text-cyan-400/80"> · {row.categories.join(", ")}</span>
                    ) : row.cpv_codes && row.cpv_codes.length ? (
                      ` · ${row.cpv_codes.slice(0, 3).join(", ")}`
                    ) : (
                      " · CPV não disponível"
                    )}
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
