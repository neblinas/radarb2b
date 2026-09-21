"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  Crown,
  ExternalLink,
  Loader2,
  LockKeyhole,
  Search,
  ShieldAlert,
  Swords,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";
import {
  Competitor,
  CompetitionSummary,
  CompanySearchResult,
  fetchCompany,
  fetchCompanyCompetitionSummary,
  fetchCompanyCompetitors,
  fetchCurrentPlan,
  formatDate,
  formatEuro,
  searchCompanies,
} from "@/lib/competitorAnalysis";

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

export default function CompetitorAnalysisClient() {
  const searchParams = useSearchParams();
  const initialCompanyId = searchParams.get("company");
  const autoLoadedRef = useRef(false);

  const [plan, setPlan] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<CompanySearchResult[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  const [company, setCompany] = useState<CompanySearchResult | null>(null);
  const [summary, setSummary] = useState<CompetitionSummary | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");

  const suppressSearch = useRef(false);

  const isPaid = plan === "starter" || plan === "pro";

  useEffect(() => {
    const loadSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setSessionEmail(user?.email ?? null);

      if (user) {
        try {
          setPlan(await fetchCurrentPlan());
        } catch {
          // RPC ainda não aplicada em produção: assume plano mais restrito.
          setPlan("free");
        }
      }

      setSessionLoading(false);
    };

    loadSession();
  }, []);

  // Sugestões de empresa (debounce) — apenas quando não foi uma seleção.
  useEffect(() => {
    if (suppressSearch.current) {
      suppressSearch.current = false;
      return;
    }

    const trimmed = term.trim();

    if (trimmed.length < 2 || company) {
      const resetTimer = setTimeout(() => {
        setSuggestions([]);
        setSuggesting(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    const timer = setTimeout(async () => {
      setSuggesting(true);
      try {
        setSuggestions(await searchCompanies(trimmed));
      } catch {
        setSuggestions([]);
      } finally {
        setSuggesting(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [term, company]);

  const runAnalysis = async (target: CompanySearchResult) => {
    setState("loading");
    setError("");

    trackEvent("competitor_analysis_run", {
      company_id: target.id,
      plan: plan ?? "unknown",
    });

    try {
      const [summaryResult, competitorResult] = await Promise.all([
        fetchCompanyCompetitionSummary(target.id),
        fetchCompanyCompetitors(target.id, 25),
      ]);

      setSummary(summaryResult);
      setCompetitors(competitorResult);
      setState(competitorResult.length > 0 ? "ready" : "empty");
    } catch {
      setState("error");
      setError(
        "Não foi possível calcular a concorrência. Tenta novamente dentro de instantes.",
      );
    }
  };

  const selectCompany = (target: CompanySearchResult) => {
    suppressSearch.current = true;
    setCompany(target);
    setTerm(target.name ?? "");
    setSuggestions([]);
    void runAnalysis(target);
  };

  // Pré-carrega a empresa indicada no URL (?company=<id>) para utilizadores pagos.
  useEffect(() => {
    if (autoLoadedRef.current || !isPaid || !initialCompanyId) return;

    autoLoadedRef.current = true;
    let active = true;

    (async () => {
      try {
        const target = await fetchCompany(initialCompanyId);
        if (!active || !target) return;
        suppressSearch.current = true;
        setCompany(target);
        setTerm(target.name ?? "");
        void runAnalysis(target);
      } catch {
        // Ignora: o utilizador pode pesquisar manualmente.
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid, initialCompanyId]);

  const clearCompany = () => {
    setCompany(null);
    setSummary(null);
    setCompetitors([]);
    setState("idle");
    setError("");
  };

  return (
    <main className="min-h-screen text-slate-100">
      <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[28px] border border-cyan-950/80 bg-[#09182a] p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,0.14),transparent_34%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Concorrência
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Análise de concorrência
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                Descobre com quem competes nos procedimentos de contratação
                pública — sempre a partir de participações reais registadas no
                BASE.
              </p>
            </div>

            <div className="flex items-center gap-3 text-sm">
              {plan ? (
                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">
                  Plano {plan}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {!isPaid ? (
          <LockedPreview sessionLoading={sessionLoading} sessionEmail={sessionEmail} />
        ) : null}

        <section className="mt-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm sm:p-6">
            <label
              htmlFor="company-search"
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
            >
              Empresa a analisar
            </label>

            <div className="relative">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                size={19}
              />

              <input
                id="company-search"
                type="text"
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                  if (company) clearCompany();
                }}
                disabled={!isPaid}
                placeholder="Pesquisa por nome da empresa ou NIF..."
                className="h-14 w-full rounded-xl border border-slate-800 bg-slate-950/70 pl-12 pr-12 text-sm text-white outline-none placeholder:text-slate-600 transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              />

              {suggesting ? (
                <Loader2
                  className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-slate-500"
                  size={17}
                />
              ) : null}
            </div>

            {isPaid && !company && suggestions.length > 0 ? (
              <ul className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80">
                {suggestions.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => selectCompany(item)}
                      className="flex w-full items-center justify-between gap-3 border-b border-slate-800/60 px-4 py-3 text-left text-sm transition last:border-b-0 hover:bg-slate-900"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-white">
                          {item.name || "Sem nome"}
                        </span>

                        <span className="mt-0.5 block text-xs text-slate-500">
                          NIF {item.nif || "—"}
                        </span>
                      </span>

                      <ArrowUpRight size={16} className="shrink-0 text-cyan-300" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {isPaid && !company && term.trim().length >= 2 && !suggesting && suggestions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Sem empresas correspondentes. Confirma o nome ou o NIF.
              </p>
            ) : null}
          </div>

          {state === "loading" ? (
            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
              <Loader2 size={17} className="animate-spin" />
              A calcular concorrência…
            </div>
          ) : null}

          {state === "error" && error ? (
            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          ) : null}

          {state === "empty" && company ? (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                <Swords size={22} />
              </div>

              <h2 className="mt-4 font-semibold text-slate-200">
                Sem concorrência observada
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Não encontrámos outros participantes nos procedimentos desta
                empresa. Pode tratar-se de uma empresa com presença recente.
              </p>
            </div>
          ) : null}

          {state === "ready" && company ? (
            <div className="mt-8">
              {/* KPIs */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Procedimentos"
                  value={(summary?.participations ?? 0).toLocaleString("pt-PT")}
                  detail="em que a empresa participou"
                  icon={TrendingUp}
                />

                <KpiCard
                  label="Concorrentes"
                  value={(summary?.competitor_count ?? 0).toLocaleString("pt-PT")}
                  detail="empresas nos mesmos procedimentos"
                  icon={Users}
                />

                <KpiCard
                  label="Concorrentes (12 meses)"
                  value={(summary?.competitor_count_12m ?? 0).toLocaleString("pt-PT")}
                  detail="atividade recente"
                  icon={ShieldAlert}
                />

                <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-400/10 to-slate-900/55 p-5 shadow-sm">
                  <p className="text-sm font-medium text-slate-400">
                    Concorrente mais frequente
                  </p>

                  <p className="mt-2 truncate text-lg font-bold text-white">
                    {summary?.most_frequent_competitor?.name || "—"}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {summary?.most_frequent_competitor
                      ? `${summary.most_frequent_competitor.shared} procedimentos em comum`
                      : "Sem co-participações"}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Concorrentes de {company.name || "empresa"}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {competitors.length}{" "}
                    {competitors.length === 1
                      ? "empresa identificada"
                      : "empresas identificadas"}{" "}
                    por presença real nos mesmos procedimentos.
                  </p>
                </div>

                <Link
                  href={`/pesquisa?query=${encodeURIComponent(company.name || company.nif || "")}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-400"
                >
                  Ver procedimentos
                  <ExternalLink size={14} />
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {competitors.map((competitor, index) => (
                  <article
                    key={competitor.company_id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-sm transition hover:border-cyan-500/25 hover:bg-slate-900/75"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                          {index === 0 ? (
                            <Crown size={19} />
                          ) : (
                            <Building2 size={19} />
                          )}
                        </div>

                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-white">
                            {competitor.name || "Sem nome"}
                          </h3>

                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                            <span>NIF {competitor.nif || "—"}</span>

                            <span className="font-semibold text-cyan-300">
                              {competitor.shared_procedures}{" "}
                              {competitor.shared_procedures === 1
                                ? "procedimento em comum"
                                : "procedimentos em comum"}
                            </span>

                            <span>
                              Última vez: {formatDate(competitor.shared_last_date)}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                            <span>
                              {competitor.competitor_participations} participações
                              ({competitor.competitor_participations_12m} em 12m)
                            </span>

                            <span>
                              {competitor.competitor_awards} adjudicações ·{" "}
                              {formatEuro(competitor.competitor_award_value)}
                            </span>
                          </div>

                          {competitor.top_cpvs.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {competitor.top_cpvs.slice(0, 5).map((code) => (
                                <span
                                  key={code}
                                  className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[11px] text-slate-400"
                                >
                                  {code}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="shrink-0 border-t border-slate-800 pt-4 text-xs text-slate-500 lg:w-56 lg:border-0 lg:pt-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                          Compradores comuns
                        </p>

                        <ul className="mt-2 space-y-1">
                          {competitor.top_buyers.length > 0 ? (
                            competitor.top_buyers.map((buyer) => (
                              <li key={buyer} className="truncate text-slate-400">
                                {buyer}
                              </li>
                            ))
                          ) : (
                            <li className="text-slate-600">—</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {state === "idle" && isPaid ? (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                <Swords size={22} />
              </div>

              <h2 className="mt-4 font-semibold text-slate-200">
                Escolhe uma empresa
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Pesquisa uma empresa para veres com quem compete, onde ganha e
                quais os compradores que partilham.
              </p>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400">{label}</p>

          <p className="mt-2 text-3xl font-bold tracking-tight text-white">
            {value}
          </p>
        </div>

        <div className="rounded-xl border border-cyan-400/10 bg-cyan-400/10 p-2.5 text-cyan-300">
          <Icon size={20} />
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-600">{detail}</p>
    </div>
  );
}

function LockedPreview({
  sessionLoading,
  sessionEmail,
}: {
  sessionLoading: boolean;
  sessionEmail: string | null;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
            <LockKeyhole size={22} />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">
              A análise de concorrência faz parte dos planos pagos
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Identifica concorrentes reais, co-participações, adjudicações e
              compradores comuns. Disponível nos planos Starter e Pro.
            </p>

            {!sessionLoading && !sessionEmail ? (
              <p className="mt-2 text-xs text-slate-500">
                Inicia sessão para veres o teu plano.
              </p>
            ) : null}
          </div>
        </div>

        <Link
          href={sessionEmail ? "/planos" : "/login?next=/concorrencia"}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
        >
          {sessionEmail ? "Ver planos" : "Iniciar sessão"}
        </Link>
      </div>
    </section>
  );
}
