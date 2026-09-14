"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  ExternalLink,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type SavedOpportunity = {
  id: string;
  procedure_id: string;
  notes: string | null;
  created_at: string;
  procedure: {
    id: string;
    source_id: string | null;
    object: string | null;
    procedure_type: string | null;
    publication_date: string | null;
    base_price: number | null;
  } | null;
};

export default function OportunidadesPage() {
  const [items, setItems] = useState<SavedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const loadSaved = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error: queryError } = await supabase
        .from("saved_opportunities")
        .select(
          `
            id,
            procedure_id,
            notes,
            created_at,
            procedure:procedures (
              id,
              source_id,
              object,
              procedure_type,
              publication_date,
              base_price
            )
          `,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (queryError) {
        setError(
          "Não foi possível carregar as oportunidades guardadas.",
        );
        setLoading(false);
        return;
      }

      setItems(
        (data ?? []) as unknown as SavedOpportunity[],
      );
      setLoading(false);
    };

    loadSaved();
  }, []);

  const handleRemove = async (procedureId: string) => {
    setRemovingId(procedureId);
    setError("");

    const { error: rpcError } = await supabase.rpc(
      "remove_saved_opportunity",
      {
        p_procedure_id: procedureId,
      },
    );

    if (rpcError) {
      setError(
        "Não foi possível remover esta oportunidade.",
      );
      setRemovingId(null);
      return;
    }

    setItems((current) =>
      current.filter(
        (item) => item.procedure_id !== procedureId,
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
              Oportunidades
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Oportunidades guardadas
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Procedimentos que marcaste para acompanhar e
              analisar mais tarde.
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
              <Loader2 size={18} className="animate-spin" />
              A carregar oportunidades...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                <Bookmark size={22} />
              </div>

              <h2 className="mt-4 text-lg font-semibold text-slate-200">
                Ainda não tens oportunidades guardadas
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Pesquisa procedimentos e guarda os que
                pretendes acompanhar.
              </p>

              <Link
                href="/pesquisa"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                <Search size={16} />
                Pesquisar procedimentos
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-white">
                  Oportunidades
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {items.length}{" "}
                  {items.length === 1
                    ? "oportunidade guardada"
                    : "oportunidades guardadas"}
                </p>
              </div>

              <div className="space-y-4">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="group rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-sm transition hover:border-cyan-500/25 hover:bg-slate-900/75"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                            <Bookmark size={18} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              {item.procedure?.source_id ? (
                                <span>
                                  ID {item.procedure.source_id}
                                </span>
                              ) : null}

                              {item.procedure
                                ?.procedure_type ? (
                                <span className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-slate-400">
                                  {
                                    item.procedure
                                      .procedure_type
                                  }
                                </span>
                              ) : null}
                            </div>

                            <h2 className="mt-3 text-lg font-semibold leading-7 text-white">
                              {item.procedure?.object ||
                                "Objeto não disponível"}
                            </h2>

                            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                              <span>
                                Publicação:{" "}
                                {item.procedure
                                  ?.publication_date
                                  ? new Date(
                                      item.procedure
                                        .publication_date,
                                    ).toLocaleDateString(
                                      "pt-PT",
                                    )
                                  : "—"}
                              </span>

                              <span className="font-medium text-slate-400">
                                Preço base:{" "}
                                {item.procedure
                                  ?.base_price !== null &&
                                item.procedure
                                  ?.base_price !==
                                  undefined
                                  ? new Intl.NumberFormat(
                                      "pt-PT",
                                      {
                                        style: "currency",
                                        currency: "EUR",
                                      },
                                    ).format(
                                      item.procedure
                                        .base_price,
                                    )
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-800 pt-4 lg:border-0 lg:pt-0">
                        {item.procedure?.id ? (
                          <Link
                            href={`/procedimentos/${item.procedure.id}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/15"
                          >
                            Ver procedimento
                            <ExternalLink size={14} />
                          </Link>
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            handleRemove(
                              item.procedure_id,
                            )
                          }
                          disabled={
                            removingId ===
                            item.procedure_id
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {removingId ===
                          item.procedure_id ? (
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
                ))}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}