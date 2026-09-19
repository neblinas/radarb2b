"use client";

import { ScrollText, ShieldCheck } from "lucide-react";
import { ReactNode, useCallback, useEffect, useState } from "react";
import {
  ProgramTerms,
  acceptTerms,
  fetchCurrentTerms,
  fetchMyTermsStatus,
} from "@/lib/commercial";

type GateState = "loading" | "accepted" | "pending" | "error";

/**
 * Bloqueia o portal do comercial enquanto este não aceitar a versão corrente
 * dos termos do programa. Quando aceite (ou para gestores/admin, que veem sem
 * bloqueio), renderiza os filhos.
 */
export default function CommercialTermsGate({
  role,
  children,
}: {
  role: string;
  children: ReactNode;
}) {
  // Gestores/admin não estão sujeitos à aceitação (supervisionam, não recebem).
  const exempt = role === "admin" || role === "commercial_manager";

  const [state, setState] = useState<GateState>(exempt ? "accepted" : "loading");
  const [terms, setTerms] = useState<ProgramTerms | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [current, status] = await Promise.all([
        fetchCurrentTerms(),
        fetchMyTermsStatus(),
      ]);
      setTerms(current);
      if (status?.accepted) {
        setState("accepted");
      } else if (current) {
        setState("pending");
      } else {
        // Sem termos definidos: não bloquear.
        setState("accepted");
      }
    } catch {
      setError("Não foi possível carregar os termos do programa.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (exempt) return;
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [exempt, load]);

  async function handleAccept() {
    setAccepting(true);
    setError("");
    try {
      await acceptTerms();
      setState("accepted");
    } catch {
      setError("Não foi possível registrar a aceitação. Tenta novamente.");
    } finally {
      setAccepting(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="min-h-screen px-4 py-16 text-center text-slate-400">
        A carregar os termos do programa…
      </div>
    );
  }

  if (state === "accepted") {
    return <>{children}</>;
  }

  if (state === "error") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
          {error}
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/5 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center gap-3">
        <ScrollText className="text-cyan-300" size={24} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Programa comercial
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white">
            {terms?.title || "Termos do Programa Comercial"}
          </h1>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-500">
        Antes de acederes aos teus ganhos, confirma que lês e aceitas as condições
        do programa. A tua aceitação fica registada com a versão e a data.
      </p>

      <div className="mt-6 max-h-[50vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-slate-300">
          {terms?.body}
        </pre>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-slate-500">
          Versão {terms?.version} · em vigor desde{" "}
          {terms ? new Date(terms.effective_from).toLocaleDateString("pt-PT") : "—"}
        </p>
        <button
          type="button"
          onClick={handleAccept}
          disabled={accepting}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ShieldCheck size={16} />
          {accepting ? "A registar…" : "Aceito as condições"}
        </button>
      </div>
    </div>
  );
}
