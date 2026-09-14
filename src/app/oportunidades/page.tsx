"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, ExternalLink, Loader2, Trash2 } from "lucide-react";
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
          `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (queryError) {
        setError("Não foi possível carregar as oportunidades guardadas.");
        setLoading(false);
        return;
      }

      setItems((data ?? []) as unknown as SavedOpportunity[]);
      setLoading(false);
    };

    loadSaved();
  }, []);

  const handleRemove = async (procedureId: string) => {
    setRemovingId(procedureId);
    setError("");

    const { error: rpcError } = await supabase.rpc("remove_saved_opportunity", {
      p_procedure_id: procedureId,
    });

    if (rpcError) {
      setError("Não foi possível remover esta oportunidade.");
      setRemovingId(null);
      return;
    }

    setItems((current) => current.filter((item) => item.procedure_id !== procedureId));
    setRemovingId(null);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-400">
              <Bookmark size={20} />
              <span className="text-sm font-medium">RADAR B2B</span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              Oportunidades guardadas
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Procedimentos que guardaste para acompanhar mais tarde.
            </p>
          </div>

          <Link
            href="/pesquisa"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-400"
          >
            Nova pesquisa
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            A carregar oportunidades...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-400">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
            <Bookmark className="mx-auto mb-4 text-slate-500" size={32} />
            <h2 className="text-lg font-medium text-slate-200">
              Ainda não tens oportunidades guardadas
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Pesquisa procedimentos e guarda os que queres acompanhar.
            </p>
            <Link
              href="/pesquisa"
              className="mt-6 inline-flex rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
            >
              Pesquisar procedimentos
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {item.procedure?.source_id ? (
                        <span>ID {item.procedure.source_id}</span>
                      ) : null}

                      {item.procedure?.procedure_type ? (
                        <span className="rounded-full border border-slate-700 px-2 py-1">
                          {item.procedure.procedure_type}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="text-lg font-medium text-slate-100">
                      {item.procedure?.object || "Objeto não disponível"}
                    </h2>

                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
                      <span>
                        Publicação:{" "}
                        {item.procedure?.publication_date
                          ? new Date(
                              item.procedure.publication_date
                            ).toLocaleDateString("pt-PT")
                          : "—"}
                      </span>

                      <span>
                        Preço base:{" "}
                        {item.procedure?.base_price !== null &&
                        item.procedure?.base_price !== undefined
                          ? new Intl.NumberFormat("pt-PT", {
                              style: "currency",
                              currency: "EUR",
                            }).format(item.procedure.base_price)
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.procedure?.id ? (
                      <Link
                        href={`/procedimentos/${item.procedure.id}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-400 transition hover:bg-cyan-500/20"
                      >
                        Ver procedimento
                        <ExternalLink size={15} />
                      </Link>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => handleRemove(item.procedure_id)}
                      disabled={removingId === item.procedure_id}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {removingId === item.procedure_id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Trash2 size={15} />
                      )}
                      Remover
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}


