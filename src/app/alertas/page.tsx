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
        rpcError?.message?.toLowerCase().includes("limite de alertas")
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

  function formatMoney(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === "") {
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
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-400">
              <Bell size={20} />
              <span className="text-sm font-medium">
                RADAR B2B
              </span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              Alertas
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Recebe notificações quando surgirem novos
              procedimentos relevantes.
            </p>
          </div>

          <Link
            href="/pesquisa"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-400 transition hover:bg-cyan-500/20"
          >
            <Plus size={16} />
            Criar alerta
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2
              size={18}
              className="animate-spin"
            />
            A carregar alertas...
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
            <Bell
              className="mx-auto mb-4 text-slate-500"
              size={32}
            />

            <h2 className="text-lg font-medium text-slate-200">
              Ainda não tens alertas
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Cria um alerta para acompanhares automaticamente
              novos procedimentos.
            </p>

            <Link
              href="/pesquisa"
              className="mt-6 inline-flex rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
            >
              Criar primeiro alerta
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => {
              const filterLabels =
                getFilterLabels(alert.filters ?? {});

              return (
                <article
                  key={alert.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold text-slate-100">
                          {alert.name}
                        </h2>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs ${
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

                      <div className="mt-4 grid gap-3 text-sm text-slate-400 sm:grid-cols-3">
                        <div className="flex items-start gap-2">
                          <Clock3
                            size={16}
                            className="mt-0.5 shrink-0 text-cyan-400"
                          />

                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-600">
                              Frequência
                            </p>
                            <p className="mt-1 text-slate-300">
                              {alert.frequency === "daily"
                                ? "Diária"
                                : "Semanal"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Search
                            size={16}
                            className="mt-0.5 shrink-0 text-cyan-400"
                          />

                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-600">
                              Última execução
                            </p>
                            <p className="mt-1 text-slate-300">
                              {formatDate(alert.last_run_at)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <CalendarDays
                            size={16}
                            className="mt-0.5 shrink-0 text-cyan-400"
                          />

                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-600">
                              Criado
                            </p>
                            <p className="mt-1 text-slate-300">
                              {formatSimpleDate(
                                alert.created_at,
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="mb-2 flex items-center gap-2">
                          <Filter
                            size={15}
                            className="text-slate-500"
                          />
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Filtros
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {filterLabels.map((label) => (
                            <span
                              key={label}
                              className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleAlert(
                            alert.id,
                            alert.active,
                          )
                        }
                        disabled={togglingId === alert.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {togglingId === alert.id && (
                          <Loader2
                            size={14}
                            className="animate-spin"
                          />
                        )}

                        {alert.active
                          ? "Desativar"
                          : "Ativar"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleRemoveAlert(alert.id)
                        }
                        disabled={removingId === alert.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {removingId === alert.id ? (
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
        )}
      </div>
    </main>
  );
}