"use client";

import Link from "next/link";
import {
  ArrowLeft,
  FileUp,
  Globe,
  Loader2,
  LockKeyhole,
  PencilLine,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";
import {
  FileCompanyDiscoveryProvider,
  ManualCompanyDiscoveryProvider,
  defaultFilters,
  emptyKnownCompanySnapshot,
  externalDiscoveryBucketLabel,
  listExternalDiscoveryRuns,
  loadKnownSnapshot,
  persistDiscovery,
  runDiscoveryEngine,
  type DiscoveryFilters,
  type ExternalDiscoveryBucket,
  type ExternalDiscoveryRun,
  type ExternalRecordEvaluation,
} from "@/lib/companyDiscovery";

// A descoberta externa exige admin/commercial_manager (validado também no backend).
const allowedRoles = new Set(["admin", "commercial_manager"]);

type SourceKey = "file_import" | "manual";

const bucketClass: Record<ExternalDiscoveryBucket, string> = {
  new: "text-emerald-300 border-emerald-400/20 bg-emerald-400/5",
  duplicate: "text-slate-300 border-slate-600 bg-slate-800/40",
  blocked: "text-rose-300 border-rose-400/20 bg-rose-400/5",
  invalid: "text-amber-300 border-amber-400/20 bg-amber-400/5",
};

const emptyFiltersForm = {
  cae: "",
  district: "",
  municipality: "",
  incorporationFrom: "",
  activeOnly: true,
  limit: "100",
};

export default function ExternalDiscoveryPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });

  const [source, setSource] = useState<SourceKey>("file_import");
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [manualText, setManualText] = useState("");
  const [filtersForm, setFiltersForm] = useState(emptyFiltersForm);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [evaluations, setEvaluations] = useState<ExternalRecordEvaluation[]>([]);
  const [counters, setCounters] = useState<null | {
    found: number;
    existing: number;
    blocked: number;
    invalid: number;
    created: number;
    errors: number;
    sourceDuplicates: number;
  }>(null);
  const [history, setHistory] = useState<ExternalDiscoveryRun[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [lastNewRecords, setLastNewRecords] = useState<ExternalRecordEvaluation[]>([]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) {
        setState("denied");
        return;
      }
      setState("allowed");
      void listExternalDiscoveryRuns(10)
        .then((runs) => {
          if (active) setHistory(runs);
        })
        .catch(() => {});
    });
    return () => {
      active = false;
    };
  }, []);

  const filters: DiscoveryFilters = useMemo(
    () => ({
      ...defaultFilters(Number(filtersForm.limit) || 100),
      cae: filtersForm.cae || null,
      district: filtersForm.district || null,
      municipality: filtersForm.municipality || null,
      incorporationFrom: filtersForm.incorporationFrom || null,
      activeOnly: filtersForm.activeOnly,
    }),
    [filtersForm],
  );

  function buildProvider() {
    if (source === "file_import") {
      return new FileCompanyDiscoveryProvider(fileContent, fileName || "import.csv");
    }
    // Lista manual: aceita CSV (linhas "Nome;NIF;CAE") ou JSON.
    const trimmed = manualText.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const provider = new FileCompanyDiscoveryProvider(manualText, "manual.json");
      return provider;
    }
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    const records = lines.map((line) => {
      const [name, nif, cae, district] = line.split(/[;,]/).map((value) => value.trim());
      return { name, nif: nif || null, cae: cae || null, district: district || null };
    });
    return new ManualCompanyDiscoveryProvider(records);
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setFileContent(text);
    setNotice(`Ficheiro "${file.name}" carregado (${(file.size / 1024).toFixed(1)} KB).`);
    setError("");
  }

  async function runDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const provider = buildProvider();
      const known = await loadKnownSnapshot().catch(() => emptyKnownCompanySnapshot());
      const output = await runDiscoveryEngine({ provider, filters, known, dryRun });

      setEvaluations(output.evaluations);
      setCounters(output.counters);
      setLastNewRecords(output.newRecords);

      // Persiste a execução (dry-run apenas registra; real cria prospects).
      const persisted = await persistDiscovery({
        provider: output.provider,
        dryRun,
        filters: output.filters,
        counters: output.counters,
        errors: output.errors,
        newRecords: output.newRecords,
      });

      setCounters((current) => (current ? { ...current, created: persisted.created } : current));
      setNotice(
        dryRun
          ? `Pré-visualização registada (execução ${persisted.run_id.slice(0, 8)}). Nenhum prospect foi criado.`
          : `Execução concluída: ${persisted.created} prospect(s) criado(s), ${persisted.skipped} ignorado(s).`,
      );
      setHistory(await listExternalDiscoveryRuns(10).catch(() => history));
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
      setError(`Não foi possível executar a descoberta externa${detail}. Confirma as permissões e a migração da FASE 8.`);
    }
    setRunning(false);
  }

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada a admin e gestores comerciais.</p></main>;

  const counterCards = counters
    ? ([
        ["Encontradas", counters.found],
        ["Já existentes", counters.existing],
        ["Bloqueadas (opt-out)", counters.blocked],
        ["Inválidas", counters.invalid],
        ["Duplicados na fonte", counters.sourceDuplicates],
        [dryRun ? "A criar (simulação)" : "Criadas", dryRun ? lastNewRecords.length : counters.created],
        ["Erros", counters.errors],
      ] as const)
    : [];

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice/prospeccao" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Prospecção</Link>
      <header className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Descoberta externa</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Empresas de fontes externas</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Descobre empresas que ainda não existem na Adjudata a partir de fontes legalmente reutilizáveis
          (ficheiros CSV/JSON fornecidos pelo administrador, listas manuais e, quando configurados, dados abertos).
          As novas empresas entram no fluxo normal: enriquecimento → scoring → elegibilidade.
        </p>
      </header>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm leading-6 text-slate-500">
        <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-300" />
        <p>
          Sem scraping de fontes que o proíbam: usamos apenas APIs públicas, dados abertos e ficheiros com licença explícita.
          Nunca contornamos CAPTCHA, autenticação, rate limiting, robots.txt ou termos de utilização. A deduplicação
          autoritativa e o opt-out são sempre validados no backend.
        </p>
      </div>

      <form onSubmit={runDiscovery} className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="font-semibold text-white">Fonte</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setSource("file_import")} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${source === "file_import" ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"}`}>
              <FileUp size={15} /> Ficheiro (CSV/JSON)
            </button>
            <button type="button" onClick={() => setSource("manual")} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${source === "manual" ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"}`}>
              <PencilLine size={15} /> Lista manual
            </button>
          </div>

          {source === "file_import" ? (
            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center text-sm text-slate-400 hover:border-cyan-400/40">
              <FileUp size={22} className="text-cyan-300" />
              <span className="mt-2">{fileName || "Selecionar ficheiro CSV/JSON"}</span>
              <span className="mt-1 text-xs text-slate-600">Colunas aceites: Nome, NIF, CAE, Distrito, Concelho, Localidade, Estado, Dimensão, Trabalhadores…</span>
              <input type="file" accept=".csv,.json,.tsv,text/csv,application/json" className="hidden" onChange={onFileChange} />
            </label>
          ) : (
            <label className="mt-5 block text-sm text-slate-400">
              Lista manual (uma empresa por linha: <code className="text-slate-500">Nome;NIF;CAE;Distrito</code>), ou cole JSON.
              <textarea value={manualText} onChange={(event) => setManualText(event.target.value)} rows={6} placeholder={"Alfa Lda;500000000;62010;Lisboa\nBeta Lda;500000001;62020;Porto"} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white" />
            </label>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="flex items-center gap-2 font-semibold text-white"><Globe size={18} className="text-cyan-300" /> Filtros</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-400">CAE
              <input value={filtersForm.cae} onChange={(event) => setFiltersForm((f) => ({ ...f, cae: event.target.value }))} placeholder="ex.: 62010" className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
            </label>
            <label className="text-sm text-slate-400">Distrito
              <input value={filtersForm.district} onChange={(event) => setFiltersForm((f) => ({ ...f, district: event.target.value }))} placeholder="ex.: Lisboa" className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
            </label>
            <label className="text-sm text-slate-400">Concelho
              <input value={filtersForm.municipality} onChange={(event) => setFiltersForm((f) => ({ ...f, municipality: event.target.value }))} placeholder="ex.: Sintra" className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
            </label>
            <label className="text-sm text-slate-400">Constituída após
              <input type="date" value={filtersForm.incorporationFrom} onChange={(event) => setFiltersForm((f) => ({ ...f, incorporationFrom: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
            </label>
            <label className="text-sm text-slate-400">Limite de resultados
              <input type="number" min="1" max="500" value={filtersForm.limit} onChange={(event) => setFiltersForm((f) => ({ ...f, limit: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
            </label>
            <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked={filtersForm.activeOnly} onChange={(event) => setFiltersForm((f) => ({ ...f, activeOnly: event.target.checked }))} /> Apenas empresas ativas
            </label>
          </div>

          <label className="mt-5 inline-flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
            Pré-visualização (dry-run) — não cria prospects
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="submit" disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
              {running ? <Loader2 className="animate-spin" size={16} /> : <PlayCircle size={16} />}
              {dryRun ? "Pré-visualizar" : "Importar empresas"}
            </button>
          </div>
        </section>
      </form>

      {error ? <p className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</p> : null}
      {notice ? <p className="mt-6 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-cyan-200">{notice}</p> : null}

      {counters ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {counterCards.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{Number(value).toLocaleString("pt-PT")}</p>
              </div>
            ))}
          </div>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 p-5">
              <h2 className="flex items-center gap-2 font-semibold text-white"><ShieldCheck size={18} className="text-cyan-300" />Registos avaliados</h2>
              <p className="mt-1 text-xs text-slate-500">Cada registo é classificado de forma transparente: novo, já existente, bloqueado por opt-out ou inválido.</p>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[minmax(200px,1.4fr)_120px_130px_120px_1fr] gap-4 border-b border-slate-800 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span>Empresa</span><span>NIF</span><span>CAE</span><span>Localização</span><span>Classificação</span>
                </div>
                {evaluations.length ? evaluations.map((evaluation, index) => (
                  <div key={`${evaluation.dedupKey}-${index}`} className="grid grid-cols-[minmax(200px,1.4fr)_120px_130px_120px_1fr] items-start gap-4 border-b border-slate-800 px-5 py-4 last:border-0">
                    <span className="truncate font-medium text-white">{evaluation.record.name}</span>
                    <span className="text-sm text-slate-400">{evaluation.record.nif || "—"}</span>
                    <span className="text-sm text-slate-400">{evaluation.record.cae || "—"}</span>
                    <span className="text-sm text-slate-400">{evaluation.record.localidade || evaluation.record.municipality || evaluation.record.district || "—"}</span>
                    <div className="space-y-1.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${bucketClass[evaluation.bucket]}`}>{externalDiscoveryBucketLabel[evaluation.bucket]}</span>
                      <p className="text-xs text-slate-500">{evaluation.reason}</p>
                    </div>
                  </div>
                )) : <p className="p-8 text-center text-sm text-slate-500">Sem registos para estes critérios.</p>}
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="font-semibold text-white">Execuções recentes</h2>
        {history.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="pb-3">Data</th><th className="pb-3">Fonte</th><th className="pb-3">Modo</th><th className="pb-3">Encontradas</th><th className="pb-3">Existentes</th><th className="pb-3">Bloqueadas</th><th className="pb-3">Criadas</th></tr>
              </thead>
              <tbody className="text-slate-300">
                {history.map((run) => (
                  <tr key={run.id} className="border-t border-slate-800">
                    <td className="py-3">{new Date(run.started_at).toLocaleString("pt-PT")}</td>
                    <td className="py-3">{run.provider}</td>
                    <td className="py-3">{run.dry_run ? "Pré-visualização" : "Importação"}</td>
                    <td className="py-3">{run.found}</td>
                    <td className="py-3">{run.existing}</td>
                    <td className="py-3">{run.blocked}</td>
                    <td className="py-3 text-emerald-300">{run.dry_run ? "—" : run.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-4 text-sm text-slate-500">Ainda não há execuções registadas.</p>}
      </section>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-xs leading-6 text-slate-500">
        <p className="font-semibold text-slate-400">Como funciona o pipeline</p>
        <p className="mt-1">Fonte externa → Descoberta → Normalização → Deduplicação → Criação de prospect → Enriquecimento → Scoring → Elegibilidade → Autopilot.</p>
        <p className="mt-2">Os ficheiros XLSX devem ser exportados para CSV (evitamos dependências pesadas sem benefício). Para integrar uma API de dados abertos, esta deve ser configurada explicitamente pelo administrador — nunca inventamos endpoints.</p>
      </div>
    </BackofficeShell>
  );
}
