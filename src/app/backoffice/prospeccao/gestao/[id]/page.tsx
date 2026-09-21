"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Globe2,
  History,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  Send,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { use, useEffect, useEffectEvent, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";
import {
  type ManagementAction,
  type ProspectManagementDetail,
  canRunManagementAction,
  commercialStatusLabelDetailed,
  emailTypeLabelDetailed,
  enrichmentStatusLabelDetailed,
  formatEuroShort,
  getManagementDetail,
  isContactBlocked,
  managementActionDescription,
  managementActionLabel,
  runManagementAction,
} from "@/lib/prospectManagement";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
const manageRoles = new Set(["admin", "commercial_manager"]);

const actionIcon: Record<ManagementAction, typeof CheckCircle2> = {
  APPROVE: CheckCircle2,
  REJECT: XCircle,
  READY_AUTOPILOT: Send,
  OPT_OUT: ShieldAlert,
  RESET: RotateCcw,
};

const actionStyle: Record<ManagementAction, string> = {
  APPROVE: "border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10",
  REJECT: "border-slate-600 text-slate-300 hover:bg-slate-500/10",
  READY_AUTOPILOT: "border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10",
  OPT_OUT: "border-rose-400/30 text-rose-200 hover:bg-rose-400/10",
  RESET: "border-slate-700 text-slate-300 hover:bg-slate-500/10",
};

const classificationLabel: Record<string, string> = {
  GENERIC_BUSINESS: "Institucional",
  NAMED_PERSON: "Pessoal",
  UNKNOWN: "Desconhecido",
};

export default function ProspectManagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [detail, setDetail] = useState<ProspectManagementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<ManagementAction | null>(null);
  const [confirming, setConfirming] = useState<ManagementAction | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      setState(data.user && allowedRoles.has(role) ? "allowed" : "denied");
    });
  }, []);

  const load = useEffectEvent(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getManagementDetail(id);
      setDetail(data);
    } catch {
      setError(
        "Não foi possível carregar a ficha. Confirma se a migração `20261002090000_prospecting_management.sql` foi aplicada no Supabase.",
      );
      setDetail(null);
    }
    setLoading(false);
  });

  useEffect(() => {
    if (state !== "allowed") return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [state, id, reloadKey]);

  async function performAction(action: ManagementAction) {
    setBusy(action);
    setError("");
    try {
      await runManagementAction(id, action);
      setConfirming(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("opt-out")
          ? "Este prospect tem opt-out e não pode ser reativado."
          : "Não foi possível concluir a ação. Confirma as permissões e o estado do prospect.",
      );
    }
    setBusy(null);
  }

  if (state === "loading" || (state === "allowed" && loading))
    return (
      <main className="min-h-screen px-4 py-16 text-center text-slate-400">
        <Loader2 className="mx-auto animate-spin" />A carregar ficha…
      </main>
    );
  if (state === "denied")
    return (
      <main className="min-h-screen px-4 py-16 text-center text-slate-400">
        <ShieldAlert className="mx-auto text-cyan-300" size={28} />
        <p className="mt-4">Área reservada.</p>
      </main>
    );
  if (!detail)
    return (
      <main className="min-h-screen px-4 py-16 text-center text-rose-200">{error || "Prospect não encontrado."}</main>
    );

  const blocked = isContactBlocked(detail);
  const canManage = manageRoles.has(identity.role);
  const actions: ManagementAction[] = ["APPROVE", "READY_AUTOPILOT", "REJECT", "OPT_OUT", "RESET"];

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice/prospeccao/gestao" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300">
        <ArrowLeft size={15} /> Gestão de prospeção
      </Link>

      <header className="mt-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Ficha de gestão</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">{detail.name}</h1>
          <p className="mt-2 text-sm text-slate-500">
            NIF {detail.nif || "—"} · {detail.district || "Localização desconhecida"} · CAE {detail.cae || "—"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
              {commercialStatusLabelDetailed[detail.commercial_status] ?? detail.commercial_status}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
              {enrichmentStatusLabelDetailed[detail.enrichment_status] ?? detail.enrichment_status}
            </span>
            {detail.categories.map((name) => (
              <span key={name} className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-xs font-medium text-cyan-200">
                {name}
              </span>
            ))}
            {blocked ? (
              <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs font-medium text-rose-200">
                Opt-out — não contactar
              </span>
            ) : null}
          </div>
        </div>
        <span className="w-fit rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-lg font-bold text-cyan-200">
          {detail.commercial_score ?? "—"} / 100
        </span>
      </header>

      {error ? <p className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</p> : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Oportunidades compatíveis", detail.matching_opportunities.toLocaleString("pt-PT")],
          ["Valor de oportunidade", formatEuroShort(detail.estimated_opportunity_value)],
          ["Contactos", detail.contacts.length.toLocaleString("pt-PT")],
          ["Enriquecimentos", detail.enrichment_history.length.toLocaleString("pt-PT")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="font-semibold text-white">Contexto e oportunidades</h2>
            {detail.score_reason ? <p className="mt-3 text-sm text-slate-400">{detail.score_reason}</p> : null}
            {detail.radar ? (
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["Participações", detail.radar.participation_count],
                  ["Últimos 12 meses", detail.radar.participation_12m],
                  ["Adjudicações", detail.radar.award_count],
                  ["Concorrentes", detail.radar.competitor_count],
                  ["Valor adjudicado", formatEuroShort(detail.radar.total_award_value)],
                  ["Última participação", detail.radar.last_participation || "—"],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-xl bg-slate-950/60 p-3">
                    <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
                    <dd className="mt-1 text-sm text-white">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Esta empresa ainda não está ligada ao Radar, por isso não há oportunidades ou CPVs associados.
              </p>
            )}
            {detail.cpv_codes.length ? (
              <p className="mt-4 text-xs text-slate-500">CPVs: {detail.cpv_codes.slice(0, 12).join(", ")}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <History size={18} className="text-cyan-300" /> Histórico de enriquecimento
            </h2>
            <div className="mt-5 space-y-3">
              {detail.enrichment_history.length ? (
                detail.enrichment_history.map((run) => (
                  <div key={run.id} className="rounded-xl bg-slate-950/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-white">{run.status}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(run.created_at).toLocaleString("pt-PT")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {run.contacts_found} contactos · {run.emails_found} emails · {run.phones_found} telefones ·{" "}
                      {run.pages_crawled} páginas
                      {run.skipped_reason ? ` · ${run.skipped_reason}` : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sem execuções de enriquecimento registadas.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="font-semibold text-white">Histórico comercial</h2>
            <div className="mt-5 space-y-3">
              {detail.activities.length ? (
                detail.activities.map((activity) => (
                  <div key={activity.id} className="border-l-2 border-cyan-400/30 pl-4">
                    <p className="text-sm text-white">
                      {activity.activity_type} · {new Date(activity.occurred_at).toLocaleString("pt-PT")}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{activity.notes || "Sem detalhe"}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sem atividades comerciais registadas.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <Globe2 size={18} className="text-cyan-300" /> Dados da empresa
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["Website", detail.website || "—"],
                ["Email", detail.email || "—"],
                ["Tipo de email", detail.email_type ? emailTypeLabelDetailed[detail.email_type] ?? detail.email_type : "—"],
                ["Telefone", detail.phone || "—"],
                ["Localidade", detail.localidade || "—"],
                ["Município", detail.municipality || "—"],
                ["Dimensão", detail.estimated_size || "—"],
                ["Opt-out", detail.opt_out ? `Sim${detail.opt_out_reason ? ` (${detail.opt_out_reason})` : ""}` : "Não"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="max-w-[60%] break-words text-right text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="font-semibold text-white">Contactos com proveniência</h2>
            <div className="mt-4 space-y-3">
              {detail.contacts.length ? (
                detail.contacts.map((contact) => (
                  <div key={contact.id} className="rounded-xl bg-slate-950/60 p-3">
                    <p className="flex items-center gap-2 break-all text-sm text-white">
                      {contact.contact_type === "email" ? (
                        <Mail size={14} className="shrink-0 text-cyan-300" />
                      ) : (
                        <Phone size={14} className="shrink-0 text-cyan-300" />
                      )}
                      {contact.contacto}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {classificationLabel[contact.classification] ?? contact.classification} · {contact.confidence}% ·{" "}
                      {contact.is_opt_out ? "opt-out" : "ativo"}
                    </p>
                    <a
                      href={contact.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      Fonte <ExternalLink size={12} />
                    </a>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sem contactos públicos recolhidos.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="font-semibold text-white">Ações administrativas</h2>
            {!canManage ? (
              <p className="mt-3 text-sm text-slate-500">
                Só admin e gestor comercial podem executar ações. Podes consultar a ficha.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {actions.map((action) => {
                  const Icon = actionIcon[action];
                  const allowed = canRunManagementAction(action, {
                    opt_out: detail.opt_out,
                    commercial_status: detail.commercial_status,
                  });
                  const isConfirming = confirming === action;
                  return (
                    <div key={action}>
                      <button
                        type="button"
                        disabled={!allowed || busy !== null}
                        onClick={() => setConfirming(isConfirming ? null : action)}
                        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${actionStyle[action]}`}
                      >
                        {busy === action ? <Loader2 className="animate-spin" size={15} /> : <Icon size={15} />}
                        {managementActionLabel[action]}
                      </button>
                      {isConfirming ? (
                        <div className="mt-2 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                          <p className="text-xs text-slate-400">{managementActionDescription[action]}</p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void performAction(action)}
                              disabled={busy !== null}
                              className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-60"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming(null)}
                              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {blocked ? (
                  <p className="text-xs text-rose-200">
                    Este prospect tem opt-out: as ações de aprovação e preparação para Autopilot estão bloqueadas.
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </aside>
      </div>
    </BackofficeShell>
  );
}
