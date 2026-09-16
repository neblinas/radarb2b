"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  CalendarDays,
  Filter,
  Loader2,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  buildSearchUrl,
  type SavedSearchFilters,
} from "@/lib/savedSearches";

type SavedSearch = {
  id: string;
  name: string;
  filters: SavedSearchFilters;
  created_at: string;
  updated_at: string;
};

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
  const router = useRouter();
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
        router.push("/login");
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
  }, [router]);

  const handleRemove = async (
    savedSearchId: string,
  ) => {
    setRemovingId(savedSearchId);
    setError("");

    const { data, error: rpcError } =
      await supabase.rpc("remove_saved_search", {
        p_saved_search_id: savedSearchId,
      });

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
    <main className="min-h-screen text-slate-100">
      <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Pesquisa
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Pesquisas guardadas
            </h1>

             <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
               Reexecuta rapidamente os teus critérios comerciais e mantém as
               pesquisas importantes sempre à mão.
             </p>
          </div>

          <Link
            href="/pesquisa"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/15"
          >
            <Search size={16} />
            Nova pesquisa
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
              <Loader2
                size={18}
                className="animate-spin"
              />
              A carregar pesquisas guardadas...
            </div>
          ) : savedSearches.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                <Bookmark size={22} />
              </div>

              <h2 className="mt-4 text-lg font-semibold text-slate-200">
                Ainda não tens pesquisas guardadas
              </h2>

               <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                 Define filtros uma vez e volta a encontrar oportunidades sem
                 repetires trabalho manual.
               </p>

              <Link
                href="/pesquisa"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                <Search size={16} />
                Fazer uma pesquisa
              </Link>
            </div>
          ) : (
            <>
               <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Pesquisas guardadas
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {savedSearches.length}{" "}
                    {savedSearches.length === 1
                      ? "pesquisa guardada"
                      : "pesquisas guardadas"}
                  </p>
                </div>

                   <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300">
                     Prontas a executar
                   </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {savedSearches.map(
                  (savedSearch) => {
                    const filterLabels =
                      getFilterLabels(
                        savedSearch.filters ?? {},
                      );

                    return (
                      <article
                        key={savedSearch.id}
                        className="group rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-sm transition hover:border-cyan-500/25 hover:bg-slate-900/75"
                      >
                        <div className="flex h-full flex-col">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                              <Bookmark size={18} />
                            </div>

                            <div className="min-w-0">
                              <h3 className="truncate font-semibold text-white">
                                {savedSearch.name}
                              </h3>

                              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                                <CalendarDays
                                  size={13}
                                />
                                Guardada em{" "}
                                {formatDate(
                                  savedSearch.created_at,
                                )}
                              </div>
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

                          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                            <button
                              type="button"
                              onClick={() => {
                                window.location.assign(
                                  buildSearchUrl(
                                    savedSearch.filters ??
                                      {},
                                  ),
                                );
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/15"
                            >
                              <Play size={14} />
                              Executar pesquisa
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleRemove(
                                  savedSearch.id,
                                )
                              }
                              disabled={
                                removingId ===
                                savedSearch.id
                              }
                              className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
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
                  },
                )}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}



