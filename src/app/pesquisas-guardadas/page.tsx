"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  CalendarDays,
  Filter,
  Loader2,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type SavedSearchFilters = {
  query?: string | null;
  procedureType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  valueFrom?: string | number | null;
  valueTo?: string | number | null;
};

type SavedSearch = {
  id: string;
  name: string;
  filters: SavedSearchFilters;
  created_at: string;
  updated_at: string;
};

function buildSearchUrl(filters: SavedSearchFilters) {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set("query", String(filters.query));
  }

  if (filters.procedureType) {
    params.set("procedureType", String(filters.procedureType));
  }

  if (filters.dateFrom) {
    params.set("dateFrom", String(filters.dateFrom));
  }

  if (filters.dateTo) {
    params.set("dateTo", String(filters.dateTo));
  }

  if (
    filters.valueFrom !== null &&
    filters.valueFrom !== undefined &&
    filters.valueFrom !== ""
  ) {
    params.set("valueFrom", String(filters.valueFrom));
  }

  if (
    filters.valueTo !== null &&
    filters.valueTo !== undefined &&
    filters.valueTo !== ""
  ) {
    params.set("valueTo", String(filters.valueTo));
  }

  const queryString = params.toString();

  return queryString
    ? `/pesquisa?${queryString}`
    : "/pesquisa";
}

function formatDate(value: string) {
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

function getFilterLabels(filters: SavedSearchFilters) {
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

export default function PesquisasGuardadasPage() {
  const [savedSearches, setSavedSearches] = useState<
    SavedSearch[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const loadSavedSearches = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error: queryError } = await supabase
        .from("saved_searches")
        .select(
          "id, name, filters, created_at, updated_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (queryError) {
        setError(
          "Não foi possível carregar as pesquisas guardadas.",
        );
        setLoading(false);
        return;
      }

      setSavedSearches((data ?? []) as SavedSearch[]);
      setLoading(false);
    };

    loadSavedSearches();
  }, []);

  const handleRemove = async (savedSearchId: string) => {
    setRemovingId(savedSearchId);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "remove_saved_search",
      {
        p_saved_search_id: savedSearchId,
      },
    );

    if (rpcError || data !== true) {
      setError(
        "Não foi possível remover a pesquisa guardada.",
      );
      setRemovingId(null);
      return;
    }

    setSavedSearches((current) =>
      current.filter(
        (savedSearch) =>
          savedSearch.id !== savedSearchId,
      ),
    );

    setRemovingId(null);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link
            href="/pesquisa"
            className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-cyan-400"
          >
            <ArrowLeft size={16} />
            Voltar à pesquisa
          </Link>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-cyan-400">
                <Bookmark size={20} />
                <span className="text-sm font-medium">
                  RADAR B2B
                </span>
              </div>

              <h1 className="text-3xl font-semibold tracking-tight">
                Pesquisas guardadas
              </h1>

              <p className="mt-2 text-sm text-slate-400">
                Guarda combinações de filtros e volta a
                executá-las quando precisares.
              </p>
            </div>

            <Link
              href="/pesquisa"
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-400 transition hover:bg-cyan-500/20"
            >
              <Search size={16} />
              Nova pesquisa
            </Link>
          </div>
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
            A carregar pesquisas guardadas...
          </div>
        ) : savedSearches.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
            <Bookmark
              className="mx-auto mb-4 text-slate-500"
              size={32}
            />

            <h2 className="text-lg font-medium text-slate-200">
              Ainda não tens pesquisas guardadas
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Define os filtros na pesquisa e guarda-os
              para reutilização rápida.
            </p>

            <Link
              href="/pesquisa"
              className="mt-6 inline-flex rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
            >
              Fazer uma pesquisa
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {savedSearches.map((savedSearch) => {
              const filterLabels = getFilterLabels(
                savedSearch.filters ?? {},
              );

              return (
                <article
                  key={savedSearch.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-slate-100">
                        {savedSearch.name}
                      </h2>

                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <CalendarDays size={14} />
                        Guardada em{" "}
                        {formatDate(
                          savedSearch.created_at,
                        )}
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
  onClick={() => {
    window.location.assign(
      buildSearchUrl(savedSearch.filters ?? {}),
    );
  }}
  className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-400 transition hover:bg-cyan-500/20"
>
  <Play size={14} />
  Executar
</button>

                      <button
                        type="button"
                        onClick={() =>
                          handleRemove(savedSearch.id)
                        }
                        disabled={
                          removingId === savedSearch.id
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {removingId ===
                        savedSearch.id ? (
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
