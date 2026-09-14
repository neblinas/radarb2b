"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Clock3,
  Filter,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type AlertFilters = {
  query?: string | null;
  procedureType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  valueFrom?: string | number | null;
  valueTo?: string | number | null;
};

type AlertItem = {
  id: string;
  name: string;
  active: boolean;
  frequency: string;
  filters: AlertFilters;
  last_run_at: string | null;
  created_at: string;
};

export default function AlertasPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    const loadAlerts = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error: queryError } = await supabase
        .from("alerts")
        .select(
          "id, name, active, frequency, filters, last_run_at, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (queryError) {
        setError("Não foi possível carregar os alertas.");
        setLoading(false);
        return;
      }

      setAlerts((data ?? []) as AlertItem[]);
      setLoading(false);
    };

    loadAlerts();
  }, []);

  const handleToggleAlert = async (
    alertId: string,
    active: boolean,
  ) => {
    setTogglingId(alertId);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "set_alert_active",
      {
        p_alert_id: alertId,
        p_active: !active,
      },
    );

    if (rpcError || data !== true) {
      const message =
        rpcError?.message
          ?.toLowerCase()
          .includes("limite de alertas")
          ? "O teu plano atual não permite ativar mais alertas."
          : "Não foi possível alterar o estado do alerta.";

      setError(message);
      setTogglingId(null);
      return;
    }

    setAlerts((current) =>
      current.map((alert) =>
        alert.id === alertId
          ? { ...alert, active: !active }
          : alert,
      ),
    );

    setTogglingId(null);
  };

  const handleRemoveAlert = async (alertId: string) => {
    setRemovingId(alertId);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "remove_alert",
      {
        p_alert_id: alertId,
      },
    );

    if (rpcError || data !== true) {
      setError("Não foi possível remover o alerta.");
      setRemovingId(null);
      return;
    }

    setAlerts((current) =>
      current.filter((alert) => alert.id !== alertId),
    );

    setRemovingId(null);
  };

  function formatDate(value: string | null) {
    if (!value) {
      return "Ainda não executado";
    }

    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatSimpleDate(value: string) {
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  }

  function formatMoney(
    value: string | number | null | undefined,
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return String(value);
    }

    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(numericValue);
  }

  function getFilterLabels(filters: AlertFilters) {
    const labels: string[] = [];

    if (filters.query) {
      labels.push(`Texto: ${filters.query}`);
    }

    if (filters.procedureType) {
      labels.push(`Tipo: ${filters.procedureType}`);
    }

    if (filters.dateFrom) {
      labels.push(`Desde: ${filters.dateFrom}`);
    }

    if (filters.dateTo) {
      labels.push(`Até: ${filters.dateTo}`);
    }

    const valueFrom = formatMoney(filters.valueFrom);
    const valueTo = formatMoney(filters.valueTo);

    if (valueFrom) {
      labels.push(`Valor mín.: ${valueFrom}`);
    }

    if (valueTo) {
      labels.push(`Valor máx.: ${valueTo}`);
    }

    if (labels.length === 0) {
      labels.push("Sem filtros adicionais");
    }

    return labels;
  }

  return (
    <main className="min-h-screen text-slate-100">
      <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Monitorização
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Alertas
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Acompanha automaticamente novas oportunidades
              com base nos filtros das tuas pesquisas.
            </p>
          </div>

          <Link
            href="/pesquisa"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/15"
          >
            <Plus size={16} />
            Criar alerta
          </Link>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        ) : null}

        <section className="mt-8">
          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
              <Loader2 size={18} className="animate-spin" />
              A carregar alertas...
            </div>
          ) : alerts.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                <Bell size={22} />
              </div>

              <h2 className="mt-4 text-lg font-semibold text-slate-200">
                Ainda não tens alertas
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Faz uma pesquisa e cria um alerta para
                acompanhares automaticamente novos
                procedimentos relevantes.
              </p>

              <Link
                href="/pesquisa"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                <Plus size={16} />
                Criar primeiro alerta
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Alertas configurados
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {alerts.length}{" "}
                    {alerts.length === 1
                      ? "alerta"
                      : "alertas"}
                  </p>
                </div>

                <div className="text-xs text-slate-600">
                  {
                    alerts.filter(
                      (alert) => alert.active,
                    ).length
                  }{" "}
                  ativos
                </div>
              </div>

              <div className="space-y-4">
                {alerts.map((alert) => {
                  const filterLabels =
                    getFilterLabels(
                      alert.filters ?? {},
                    );

                  return (
                    <article
                      key={alert.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-sm transition hover:border-cyan-500/25 hover:bg-slate-900/75"
                    >
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                              <Bell size={18} />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-white">
                                {alert.name}
                              </h3>

                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                  alert.active
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                    : "border-slate-700 bg-slate-800 text-slate-400"
                                }`}
                              >
                                {alert.active
                                  ? "Ativo"
                                  : "Inativo"}
                              </span>
                            </div>
                          </div>

                          <div className="mt-5 grid gap-3 md:grid-cols-3">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
                              <div className="flex items-center gap-2 text-slate-500">
                                <Clock3 size={14} />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                                  Frequência
                                </span>
                              </div>

                              <p className="mt-2 text-sm font-medium text-slate-300">
                                {alert.frequency ===
                                "daily"
                                  ? "Diária"
                                  : "Semanal"}
                              </p>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
                              <div className="flex items-center gap-2 text-slate-500">
                                <Search size={14} />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                                  Última execução
                                </span>
                              </div>

                              <p className="mt-2 text-sm font-medium text-slate-300">
                                {formatDate(
                                  alert.last_run_at,
                                )}
                              </p>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
                              <div className="flex items-center gap-2 text-slate-500">
                                <CalendarDays
                                  size={14}
                                />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                                  Criado
                                </span>
                              </div>

                              <p className="mt-2 text-sm font-medium text-slate-300">
                                {formatSimpleDate(
                                  alert.created_at,
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="mt-5">
                            <div className="mb-2 flex items-center gap-2">
                              <Filter
                                size={14}
                                className="text-slate-500"
                              />

                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Filtros
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {filterLabels.map(
                                (label) => (
                                  <span
                                    key={label}
                                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300"
                                  >
                                    {label}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-800 pt-4 xl:border-0 xl:pt-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleAlert(
                                alert.id,
                                alert.active,
                              )
                            }
                            disabled={
                              togglingId === alert.id
                            }
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {togglingId ===
                            alert.id ? (
                              <Loader2
                                size={14}
                                className="animate-spin"
                              />
                            ) : null}

                            {alert.active
                              ? "Desativar"
                              : "Ativar"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveAlert(
                                alert.id,
                              )
                            }
                            disabled={
                              removingId === alert.id
                            }
                            className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {removingId ===
                            alert.id ? (
                              <Loader2
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <Trash2 size={14} />
                            )}

                            Remover
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
