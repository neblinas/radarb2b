"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Ban, Check, Loader2, Power, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import {
  fetchAutopilotDashboard,
  fetchRecentRuns,
  runLevelClass,
  type AutomationRunRow,
  type AutopilotDashboard,
} from "@/lib/autopilotDashboard";
import {
  decideApproval,
  fetchAutomationSettings,
  fetchPendingApprovals,
  fetchSuppressions,
  setKillSwitch,
  updateAutomationSetting,
  suppressionReasonLabel,
  type AutomationSettings,
  type PendingApproval,
  type SuppressionRow,
} from "@/lib/automation";

type Tab = "flags" | "approvals" | "suppression" | "logs";

const FLAG_LABELS: { key: keyof AutomationSettings; label: string; hint: string; danger?: boolean }[] = [
  { key: "sales_autopilot_enabled", label: "Autopilot ligado", hint: "Motor de prospeção ativo." },
  { key: "auto_outreach_enabled", label: "Outbound ligado", hint: "Permite envio automático de email." },
  { key: "autopilot_require_approval", label: "Exigir aprovação humana", hint: "Cada email fica pendente até um gestor aprovar." },
  { key: "auto_reply_enabled", label: "Auto-resposta ligada", hint: "Responde automaticamente a respostas." },
  { key: "customer_lifecycle_enabled", label: "Ciclo de vida ligado", hint: "Automação pós-venda." },
  { key: "autopilot_ai_enabled", label: "IA ligada", hint: "Classificação por IA (fallback às regras)." },
  { key: "autopilot_dry_run", label: "Modo simulação", hint: "Executa sem enviar nada. Recomendado para testes." },
  { key: "autopilot_kill_switch", label: "Kill switch (PARA TUDO)", hint: "Interrompe imediatamente toda a automação.", danger: true },
];

function metric(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString("pt-PT");
  return String(value);
}

export default function AutopilotControl() {
  const [tab, setTab] = useState<Tab>("flags");
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [dashboard, setDashboard] = useState<AutopilotDashboard | null>(null);
  const [runs, setRuns] = useState<AutomationRunRow[]>([]);
  const [suppressions, setSuppressions] = useState<SuppressionRow[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [settingsResult, dashboardResult, runsResult, supResult, approvalsResult] = await Promise.all([
        fetchAutomationSettings(),
        fetchAutopilotDashboard(),
        fetchRecentRuns(50),
        fetchSuppressions(100),
        fetchPendingApprovals(50),
      ]);
      setSettings(settingsResult);
      setDashboard(dashboardResult);
      setRuns(runsResult);
      setSuppressions(supResult);
      setApprovals(approvalsResult);
    } catch {
      setError("Não foi possível carregar o painel. Confirma que as migrações do autopilot foram executadas e que tens role de gestor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function toggleFlag(key: keyof AutomationSettings, current: boolean) {
    setBusy(key as string);
    setError("");
    try {
      await updateAutomationSetting(key, !current);
      setSettings((prev) => (prev ? { ...prev, [key]: !current } : prev));
    } catch {
      setError("Não foi possível alterar a flag. Verifica as tuas permissões.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(messageId: string, decision: "approve" | "reject") {
    setBusy(messageId);
    setError("");
    try {
      await decideApproval(messageId, decision);
      setApprovals((prev) => prev.filter((item) => item.id !== messageId));
    } catch {
      setError("Não foi possível registar a decisão. A mensagem pode já ter sido tratada.");
    } finally {
      setBusy(null);
    }
  }

  async function triggerKillSwitch() {
    setBusy("autopilot_kill_switch");
    setError("");
    try {
      await setKillSwitch(true);
      setSettings((prev) => (prev ? { ...prev, autopilot_kill_switch: true } : prev));
    } catch {
      setError("Não foi possível acionar o kill switch.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="mt-8 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />A carregar painel do autopilot…</div>;
  }

  const killSwitch = settings?.autopilot_kill_switch === true;

  return (
    <div className="mt-8">
      {error ? <div className="mb-5 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</div> : null}

      {killSwitch ? (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          <ShieldAlert size={18} /> Kill switch ATIVO — toda a automação está parada. Desliga-o na aba “Controlo” para retomar.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Estado geral", killSwitch ? "Parado" : (settings?.sales_autopilot_enabled ? "Ativo" : "Desligado")],
          ["Em simulação?", settings?.autopilot_dry_run ? "Sim" : "Não"],
          ["Fila (jobs)", `${metric(dashboard?.queue?.queued_jobs)} em espera · ${metric(dashboard?.queue?.failed_jobs)} falhas`],
          ["Prospects (autopilot)", metric(dashboard?.queue?.automation_prospects)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2 border-b border-slate-800">
        {([["flags", "Controlo"], ["approvals", `Aprovações (${approvals.length})`], ["suppression", `Suppression (${suppressions.length})`], ["logs", "Registo"]] as [Tab, string][]).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${tab === value ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}>{label}</button>
        ))}
      </div>

      {tab === "flags" ? (
        <div className="mt-6">
          {!killSwitch ? (
            <button type="button" onClick={triggerKillSwitch} disabled={busy !== null} className="mb-5 inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50">
              {busy === "autopilot_kill_switch" ? <Loader2 className="animate-spin" size={16} /> : <Ban size={16} />}Acionar kill switch (para tudo)
            </button>
          ) : null}
          <div className="grid gap-3">
            {FLAG_LABELS.map(({ key, label, hint, danger }) => {
              const value = settings?.[key] === true;
              return (
                <div key={key as string} className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${danger ? "border-rose-400/20 bg-rose-500/5" : "border-slate-800 bg-slate-900/60"}`}>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${danger ? "text-rose-200" : "text-white"}`}>{label}</p>
                    <p className="mt-1 text-xs text-slate-500">{hint}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={value}
                    aria-label={label}
                    onClick={() => toggleFlag(key, value)}
                    disabled={busy !== null}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${value ? (danger ? "bg-rose-500" : "bg-cyan-500") : "bg-slate-700"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${value ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"><RefreshCw size={15} />Atualizar</button>
        </div>
      ) : null}

      {tab === "approvals" ? (
        <div className="mt-6 grid gap-3">
          {settings?.autopilot_require_approval === false ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">A aprovação humana está DESLIGADA — os emails são enviados sem revisão. Liga “Exigir aprovação humana” no separador Controlo.</div>
          ) : null}
          {approvals.length ? approvals.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{item.subject}</p>
                  <p className="mt-1 text-xs text-slate-500">Para {item.to_email}{item.company_name ? ` · ${item.company_name}` : ""} · passo {item.step_position}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => decide(item.id, "reject")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-400/10 disabled:opacity-50">{busy === item.id ? <Loader2 className="animate-spin" size={14} /> : <Ban size={14} />}Rejeitar</button>
                  <button type="button" onClick={() => decide(item.id, "approve")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50">{busy === item.id ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}Aprovar e enviar</button>
                </div>
              </div>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">{item.body}</pre>
            </article>
          )) : <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-500">Sem emails à espera de aprovação.</p>}
        </div>
      ) : null}

      {tab === "suppression" ? (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[minmax(220px,1.6fr)_160px_140px_160px] gap-4 border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <span>Email / Domínio</span><span>Motivo</span><span>Origem</span><span>Data</span>
            </div>
            {suppressions.length ? suppressions.map((s) => (
              <div key={s.id} className="grid grid-cols-[minmax(220px,1.6fr)_160px_140px_160px] items-center gap-4 border-b border-slate-800 px-5 py-3 last:border-0 text-sm">
                <span className="truncate text-slate-300">{s.email || s.domain || "—"}</span>
                <span className="text-slate-400">{suppressionReasonLabel[s.reason] ?? s.reason}</span>
                <span className="text-xs text-slate-500">{s.source}</span>
                <span className="text-xs text-slate-500">{new Date(s.created_at).toLocaleDateString("pt-PT")}</span>
              </div>
            )) : <p className="p-8 text-center text-sm text-slate-500">Sem supressões registadas.</p>}
          </div>
        </div>
      ) : null}

      {tab === "logs" ? (
        <div className="mt-6 grid gap-2">
          {runs.length ? runs.map((run) => (
            <div key={run.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${runLevelClass[run.level] ?? runLevelClass.info}`}>{run.level}</span>
              <div className="min-w-0">
                <p className="text-sm text-slate-200">{run.message ?? run.step}</p>
                <p className="mt-0.5 text-xs text-slate-500">{run.step} · {new Date(run.created_at).toLocaleString("pt-PT")}</p>
              </div>
            </div>
          )) : <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-sm text-slate-500">Sem registos recentes.</p>}
        </div>
      ) : null}

      <p className="mt-6 flex items-center gap-2 text-xs text-slate-600"><Sparkles size={14} />Tudo nasce desligado. Ativa em simulação primeiro e observa o registo antes de ligar o envio real.</p>
      <span className="sr-only"><Power size={1} /><AlertTriangle size={1} /></span>
    </div>
  );
}
