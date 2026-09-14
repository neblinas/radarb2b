"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Bell,
  BookmarkPlus,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const PROCEDURE_TYPES = [
  "Ajuste Direto Regime Geral",
  "Consulta Prévia",
  "Concurso público",
  "Ao abrigo de acordo-quadro (art.º 259.º)",
  "Contratação excluída II",
  "Ao abrigo de acordo-quadro (art.º 258.º)",
  "Setores especiais – isenção parte II",
  "Concurso limitado por prévia qualificação",
  "Consulta Prévia Simplificada",
  "Ajuste direto simplificado ao abrigo da Lei n.º 30/2021, de 21.05",
  "Ajuste direto simplificado",
  "Concurso público simplificado",
  "Procedimento de negociação",
  "Consulta prévia ao abrigo do artigo 7º da Lei n.º 30/2021, de 21.05",
  "Ajuste Direto Regime Geral ao abrigo do artigo 7º da Lei n.º 30/2021, de 21.05",
  "Concurso de conceção simplificado",
  "Concurso de ideias simplificado",
];

type Procedure = {
  id: string;
  source_id: string | null;
  object: string | null;
  procedure_type: string | null;
  publication_date: string | null;
  base_price: string | number | null;
};

const PAGE_SIZE = 50;

export default function PesquisaPage() {
  const [query, setQuery] = useState("");
  const [procedureType, setProcedureType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [valueFrom, setValueFrom] = useState("");
  const [valueTo, setValueTo] = useState("");
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<Procedure[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [creatingAlert, setCreatingAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);
  const [savedSearchMessage, setSavedSearchMessage] = useState("");

  const lastCountedSearch = useRef("");

  const totalPages = Math.ceil(totalResults / PAGE_SIZE);

  useEffect(() => {
    const loadSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setSessionEmail(user?.email ?? null);
      setSessionLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    setQuery(params.get("query") ?? "");
    setProcedureType(params.get("procedureType") ?? "");
    setDateFrom(params.get("dateFrom") ?? "");
    setDateTo(params.get("dateTo") ?? "");
    setValueFrom(params.get("valueFrom") ?? "");
    setValueTo(params.get("valueTo") ?? "");
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, procedureType, dateFrom, dateTo, valueFrom, valueTo]);

  useEffect(() => {
    const term = query.trim();

    if (
      !term &&
      !procedureType &&
      !dateFrom &&
      !dateTo &&
      !valueFrom &&
      !valueTo
    ) {
      setResults([]);
      setTotalResults(0);
      setSearched(false);
      setUsageError("");
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      setUsageError("");

      const searchKey = JSON.stringify({
        query: term,
        procedureType,
        dateFrom,
        dateTo,
        valueFrom,
        valueTo,
      });

      if (searchKey !== lastCountedSearch.current) {
        lastCountedSearch.current = searchKey;

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          lastCountedSearch.current = "";
          setUsageError("Inicia sessão para efetuares pesquisas.");
          setResults([]);
          setTotalResults(0);
          setLoading(false);
          return;
        }

        const { data: allowed, error: usageRpcError } =
          await supabase.rpc("increment_search_usage");

        if (usageRpcError || allowed !== true) {
          lastCountedSearch.current = "";

          setUsageError(
            usageRpcError
              ? "Não foi possível validar o limite de pesquisas."
              : "Atingiste o limite de pesquisas do teu plano este mês.",
          );

          setResults([]);
          setTotalResults(0);
          setLoading(false);
          return;
        }
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let request = supabase
        .from("procedures")
        .select(
          "id, source_id, object, procedure_type, publication_date, base_price",
          { count: "exact" },
        )
        .order("publication_date", { ascending: false })
        .range(from, to);

      if (term) {
        const pattern = `%${term}%`;

        request = request.or(
          `object.ilike.${pattern},description.ilike.${pattern}`,
        );
      }

      if (procedureType) {
        request = request.eq("procedure_type", procedureType);
      }

      if (dateFrom) {
        request = request.gte("publication_date", dateFrom);
      }

      if (dateTo) {
        request = request.lte("publication_date", dateTo);
      }

      if (valueFrom) {
        request = request.gte("base_price", Number(valueFrom));
      }

      if (valueTo) {
        request = request.lte("base_price", Number(valueTo));
      }

      const { data, count, error: queryError } = await request;

      if (queryError) {
        setUsageError("Não foi possível concluir a pesquisa.");
        setResults([]);
        setTotalResults(0);
        setLoading(false);
        return;
      }

      setResults(data ?? []);
      setTotalResults(count ?? 0);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    query,
    procedureType,
    dateFrom,
    dateTo,
    valueFrom,
    valueTo,
    page,
  ]);

  const handleCreateAlert = async () => {
    setCreatingAlert(true);
    setAlertMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAlertMessage("Inicia sessão para criares um alerta.");
      setCreatingAlert(false);
      return;
    }

    const filters = {
      query: query.trim() || null,
      procedureType: procedureType || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      valueFrom: valueFrom ? Number(valueFrom) : null,
      valueTo: valueTo ? Number(valueTo) : null,
    };

    const alertName =
      query.trim() ||
      procedureType ||
      "Alerta de procedimentos";

    const { error: rpcError } = await supabase.rpc("create_alert", {
      p_name: alertName,
      p_frequency: "daily",
      p_filters: filters,
    });

    if (rpcError) {
      setAlertMessage(
        rpcError.message.includes("Limite de alertas")
          ? "O teu plano atual não permite criar mais alertas."
          : "Não foi possível criar o alerta.",
      );

      setCreatingAlert(false);
      return;
    }

    setAlertMessage("Alerta criado com sucesso.");
    setCreatingAlert(false);
  };

  const handleSaveSearch = async () => {
    setSavingSearch(true);
    setSavedSearchMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSavedSearchMessage("Inicia sessão para guardares esta pesquisa.");
      setSavingSearch(false);
      return;
    }

    const hasFilters =
      query.trim() ||
      procedureType ||
      dateFrom ||
      dateTo ||
      valueFrom ||
      valueTo;

    if (!hasFilters) {
      setSavedSearchMessage("Define pelo menos um filtro antes de guardar.");
      setSavingSearch(false);
      return;
    }

    const filters = {
      query: query.trim() || null,
      procedureType: procedureType || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      valueFrom: valueFrom ? Number(valueFrom) : null,
      valueTo: valueTo ? Number(valueTo) : null,
    };

    const searchName =
      query.trim() ||
      procedureType ||
      [
        dateFrom || dateTo
          ? `Datas ${dateFrom || "…"} a ${dateTo || "…"}`
          : null,
        valueFrom || valueTo
          ? `Valores ${valueFrom || "0"}€ a ${valueTo || "…"}€`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") ||
      "Pesquisa guardada";

    const { error: rpcError } = await supabase.rpc("save_search", {
      p_name: searchName,
      p_filters: filters,
    });

    if (rpcError) {
      setSavedSearchMessage(
        rpcError.message.includes("Limite de pesquisas guardadas")
          ? "Atingiste o limite de pesquisas guardadas do teu plano."
          : "Não foi possível guardar esta pesquisa.",
      );

      setSavingSearch(false);
      return;
    }

    setSavedSearchMessage("Pesquisa guardada com sucesso.");
    setSavingSearch(false);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-slate-500 transition hover:text-cyan-400"
          >
            ← Voltar ao dashboard
          </Link>

          <div className="mt-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-400">
                <Search size={22} />
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Pesquisa de procedimentos
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  Pesquisa na base de contratação pública do Radar B2B.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1 text-sm">
              {sessionLoading ? (
                <span className="text-slate-500">
                  A verificar sessão…
                </span>
              ) : sessionEmail ? (
                <>
                  <span className="text-slate-400">
                    {sessionEmail}
                  </span>

                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setSessionEmail(null);
                    }}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-400"
                  >
                    Sair
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="rounded-lg border border-cyan-500/40 px-3 py-1.5 text-cyan-400 transition hover:bg-cyan-500/10"
                >
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
              size={20}
            />

            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar por objeto ou descrição..."
              className="h-14 w-full rounded-2xl border border-slate-800 bg-slate-900 pl-12 pr-5 text-sm text-white outline-none placeholder:text-slate-600 transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
              autoFocus
            />
          </div>

          <select
            value={procedureType}
            onChange={(event) =>
              setProcedureType(event.target.value)
            }
            className="h-14 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 text-sm text-white outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
          >
            <option value="">
              Todos os tipos de procedimento
            </option>

            {PROCEDURE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="date-from"
              className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Publicado desde
            </label>

            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(event) =>
                setDateFrom(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 text-sm text-white outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
            />
          </div>

          <div>
            <label
              htmlFor="date-to"
              className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Publicado até
            </label>

            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(event) =>
                setDateTo(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 text-sm text-white outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="value-from"
              className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Valor mínimo (€)
            </label>

            <input
              id="value-from"
              type="number"
              min="0"
              step="0.01"
              value={valueFrom}
              onChange={(event) =>
                setValueFrom(event.target.value)
              }
              placeholder="Ex.: 10000"
              className="h-12 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 text-sm text-white outline-none placeholder:text-slate-600 transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
            />
          </div>

          <div>
            <label
              htmlFor="value-to"
              className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Valor máximo (€)
            </label>

            <input
              id="value-to"
              type="number"
              min="0"
              step="0.01"
              value={valueTo}
              onChange={(event) =>
                setValueTo(event.target.value)
              }
              placeholder="Ex.: 100000"
              className="h-12 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 text-sm text-white outline-none placeholder:text-slate-600 transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
            />
          </div>
        </div>

        {usageError && (
          <div className="mt-6 rounded-2xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            {usageError}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSaveSearch}
            disabled={savingSearch}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingSearch ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <BookmarkPlus size={16} />
            )}

            Guardar pesquisa
          </button>

          <button
            type="button"
            onClick={handleCreateAlert}
            disabled={creatingAlert}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-400 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingAlert ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Bell size={16} />
            )}

            Criar alerta desta pesquisa
          </button>

          <Link
            href="/pesquisas-guardadas"
            className="text-sm text-slate-500 transition hover:text-cyan-400"
          >
            Ver pesquisas guardadas
          </Link>
        </div>

        {savedSearchMessage || alertMessage ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {savedSearchMessage ? (
              <span className="text-slate-400">
                {savedSearchMessage}
              </span>
            ) : null}

            {alertMessage ? (
              <span className="text-slate-400">
                {alertMessage}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2
                size={16}
                className="animate-spin"
              />
              A pesquisar...
            </div>
          )}

          {!loading &&
            searched &&
            results.length === 0 &&
            !usageError && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
                <FileText
                  className="mx-auto text-slate-600"
                  size={28}
                />

                <p className="mt-3 text-sm text-slate-400">
                  Não foram encontrados procedimentos.
                </p>
              </div>
            )}

          {!loading && results.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-600">
                <span>
                  {totalResults.toLocaleString("pt-PT")} resultados
                </span>

                {totalPages > 1 && (
                  <span>
                    Página {page} de {totalPages}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {results.map((procedure) => (
                  <Link
                    key={procedure.id}
                    href={`/procedimentos/${procedure.id}`}
                    className="block rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-cyan-500/30 hover:bg-slate-900"
                  >
                    <div className="flex items-start gap-4">
                      <div className="rounded-xl bg-slate-800 p-3 text-cyan-400">
                        <FileText size={20} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h2 className="font-medium text-white">
                          {procedure.object ||
                            "Objeto não disponível"}
                        </h2>

                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                          <span>
                            {procedure.procedure_type ||
                              "Tipo não indicado"}
                          </span>

                          {procedure.publication_date && (
                            <span>
                              Publicação:{" "}
                              {new Date(
                                procedure.publication_date,
                              ).toLocaleDateString("pt-PT")}
                            </span>
                          )}

                          {procedure.base_price !== null &&
                            procedure.base_price !== undefined && (
                              <span>
                                Valor base:{" "}
                                {Number(
                                  procedure.base_price,
                                ).toLocaleString("pt-PT", {
                                  style: "currency",
                                  currency: "EUR",
                                })}
                              </span>
                            )}

                          {procedure.source_id && (
                            <span>
                              ID: {procedure.source_id}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) => current - 1)
                    }
                    disabled={page === 1}
                    className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                    Anterior
                  </button>

                  <span className="px-3 text-sm text-slate-500">
                    {page} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) => current + 1)
                    }
                    disabled={page === totalPages}
                    className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Seguinte
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}