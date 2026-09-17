"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  LogOut,
  SearchCheck,
  UserCircle,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type AccountData = {
  email: string;
  planId: string;
  planName: string;
  maxSearches: number | null;
  searchesUsed: number;
  accountStatus: string;
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

export default function ContaPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [processingAction, setProcessingAction] =
    useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<
    "success" | "cancelled" | null
  >(null);

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search,
    );

    const checkout = params.get("checkout");

    if (
      checkout === "success" ||
      checkout === "cancelled"
    ) {
      queueMicrotask(() => setCheckoutMessage(checkout));

      const cleanUrl = new URL(
        window.location.href,
      );

      cleanUrl.searchParams.delete("checkout");

      window.history.replaceState(
        {},
        "",
        `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`,
      );
    }

    async function loadAccount() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const [
        profileResult,
        subscriptionResult,
        usageResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("account_status")
          .eq("id", user.id)
          .maybeSingle(),

        supabase
          .from("subscriptions")
          .select(`
            plan_id,
            status,
            stripe_customer_id,
            stripe_subscription_id,
            cancel_at_period_end,
            current_period_end,
            plans(
              name,
              max_searches_month
            )
          `)
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("usage_monthly")
          .select("searches_used, period_start")
          .eq("user_id", user.id)
          .order("period_start", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle(),
      ]);

      if (
        profileResult.error ||
        subscriptionResult.error ||
        usageResult.error
      ) {
        setError(
          "Não foi possível carregar os dados da conta.",
        );

        setLoading(false);
        return;
      }

      const planData =
        subscriptionResult.data?.plans;

      const plan = Array.isArray(planData)
        ? planData[0] ?? null
        : planData ?? null;

      setAccount({
        email: user.email ?? "",
        planId:
          subscriptionResult.data?.plan_id ??
          "free",
        planName: plan?.name ?? "Free",
        maxSearches:
          plan?.max_searches_month ?? null,
        searchesUsed:
          usageResult.data?.searches_used ??
          0,
        accountStatus:
          profileResult.data?.account_status ??
          "active",
        subscriptionStatus:
          subscriptionResult.data?.status ??
          "active",
        stripeCustomerId:
          subscriptionResult.data
            ?.stripe_customer_id ?? null,
        stripeSubscriptionId:
          subscriptionResult.data
            ?.stripe_subscription_id ?? null,
        cancelAtPeriodEnd:
          subscriptionResult.data
            ?.cancel_at_period_end ?? false,
        currentPeriodEnd:
          subscriptionResult.data
            ?.current_period_end ?? null,
      });

      setLoading(false);
    }

    loadAccount();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleCustomerPortal() {
    setActionError("");
    setProcessingAction("portal");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const {
        data,
        error: functionError,
      } = await supabase.functions.invoke(
        "create-customer-portal",
        {
          body: {},
        },
      );

      if (functionError) {
        throw functionError;
      }

      if (!data?.url) {
        throw new Error(
          "O portal de faturação não devolveu um endereço válido.",
        );
      }

      window.location.href = data.url;
    } catch (err) {
      console.error(err);

      setActionError(
        "Não foi possível abrir a gestão da subscrição. Tenta novamente.",
      );

      setProcessingAction(null);
    }
  }

  function formatDate(value: string | null) {
    if (!value) {
      return null;
    }

    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  }

  if (loading) {
    return (
      <main className="min-h-screen text-slate-100">
        <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400">
            <Loader2
              size={18}
              className="animate-spin"
            />

            A carregar conta...
          </div>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen text-slate-100">
        <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-400">
            {error}
          </div>
        </section>
      </main>
    );
  }

  const usagePercentage =
    account?.maxSearches &&
    account.maxSearches > 0
      ? Math.min(
          (account.searchesUsed /
            account.maxSearches) *
            100,
          100,
        )
      : 0;

  const remainingSearches =
    account?.maxSearches !== null && account?.maxSearches !== undefined
      ? Math.max(account.maxSearches - (account.searchesUsed ?? 0), 0)
      : null;

  const isFree =
    account?.planId === "free";

  const hasStripeCustomer = Boolean(
    account?.stripeCustomerId,
  );

  const currentPeriodEndFormatted =
    formatDate(
      account?.currentPeriodEnd ?? null,
    );

  return (
    <main className="min-h-screen text-slate-100">
      <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[28px] border border-cyan-950/80 bg-[#09182a] p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,0.14),transparent_34%)]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Conta
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              A minha conta
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Controla o acesso à inteligência comercial, a utilização e o plano
              que acompanha o crescimento da tua empresa.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:border-slate-700 hover:text-white"
          >
            <LogOut size={16} />
            Sair
          </button>
          </div>
        </div>

        {checkoutMessage === "success" ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <CheckCircle2
              size={20}
              className="mt-0.5 shrink-0 text-emerald-400"
            />

            <div>
              <p className="font-semibold text-emerald-300">
                Pagamento concluído
              </p>

              <p className="mt-1 text-sm text-emerald-200/70">
                A tua subscrição está a ser
                atualizada.
              </p>
            </div>
          </div>
        ) : null}

        {checkoutMessage === "cancelled" ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <XCircle
              size={20}
              className="mt-0.5 shrink-0 text-amber-400"
            />

            <div>
              <p className="font-semibold text-amber-300">
                Pagamento cancelado
              </p>

              <p className="mt-1 text-sm text-amber-200/70">
                Não foi efetuada qualquer alteração
                à tua subscrição.
              </p>
            </div>
          </div>
        ) : null}

        {actionError ? (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
            {actionError}
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                <UserCircle size={20} />
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Conta
                </p>

                <p className="mt-1 text-sm font-semibold text-white">
                  Utilizador
                </p>
              </div>
            </div>

            <p className="mt-5 break-all text-sm text-slate-300">
              {account?.email}
            </p>

            <div className="mt-4 border-t border-slate-800 pt-4 text-xs text-slate-500">
              Estado:{" "}
              <span className="font-medium text-slate-300">
                {account?.accountStatus}
              </span>
            </div>

            <Link
              href="/perfil"
              className="mt-4 inline-flex text-sm font-semibold text-cyan-300 transition hover:text-cyan-200"
            >
              Editar os meus dados →
            </Link>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-400/10 to-slate-900/55 p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Plano atual
            </p>

            <p className="mt-3 text-3xl font-bold text-white">
              {account?.planName}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Estado da subscrição:{" "}
              <span className="font-medium text-slate-300">
                {account?.subscriptionStatus}
              </span>
            </p>

            {account?.cancelAtPeriodEnd &&
            currentPeriodEndFormatted ? (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300">
                Cancelamento agendado para{" "}
                {currentPeriodEndFormatted}.
              </div>
            ) : null}

            {!account?.cancelAtPeriodEnd &&
            !isFree &&
            currentPeriodEndFormatted ? (
              <p className="mt-4 text-xs text-slate-500">
                Próxima renovação:{" "}
                {currentPeriodEndFormatted}.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Pesquisas este mês
                </p>

                <p className="mt-3 text-3xl font-bold text-white">
                  {account?.searchesUsed}

                  {account?.maxSearches !==
                    null && (
                    <span className="text-lg font-normal text-slate-500">
                      {" "}
                      / {account?.maxSearches}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                <SearchCheck size={19} />
              </div>
            </div>

            {account?.maxSearches !== null ? (
              <div className="mt-5">
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all"
                    style={{
                      width: `${usagePercentage}%`,
                    }}
                  />
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  {account?.searchesUsed} de{" "}
                  {account?.maxSearches} pesquisas
                  utilizadas.
                </p>

                <p className="mt-2 text-xs font-medium text-cyan-300">
                  {remainingSearches} pesquisas disponíveis este mês
                </p>
              </div>
            ) : (
              <p className="mt-5 text-sm font-medium text-cyan-300">
                Pesquisas ilimitadas
              </p>
            )}
          </div>
        </section>

        {isFree ? (
          <section className="mt-8">
            <div>
               <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Planos
              </p>

              <h2 className="mt-2 text-xl font-semibold text-white">
                Aumentar capacidade
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                 Mais dados. Mais oportunidades. Menos trabalho manual.
              </p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Starter
                </p>

                <div className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-bold text-white">
                    19 €
                  </span>

                  <span className="pb-1 text-sm text-slate-500">
                    / mês
                  </span>
                </div>

                 <p className="mt-3 text-sm leading-6 text-slate-400">
                   Para equipas pequenas que estão a começar a acompanhar o
                   mercado.
                 </p>

                <ul className="mt-6 space-y-3 text-sm text-slate-400">
                  <li>200 pesquisas por mês</li>
                  <li>100 oportunidades guardadas</li>
                  <li>25 pesquisas guardadas</li>
                  <li>5 alertas automáticos</li>
                </ul>

                <Link
                  href="/planos"
                  className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Comparar planos
                </Link>
              </div>

              <div className="relative rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-400/10 to-slate-900/55 p-6 shadow-sm">
                <div className="absolute right-5 top-5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300">
                  Mais completo
                </div>

                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-300">
                  Pro
                </p>

                <div className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-bold text-white">
                    39 €
                  </span>

                  <span className="pb-1 text-sm text-slate-500">
                    / mês
                  </span>
                </div>

                 <p className="mt-3 text-sm leading-6 text-slate-300">
                   Para equipas comerciais que precisam de acompanhar mais
                   oportunidades todos os dias.
                 </p>

                <ul className="mt-6 space-y-3 text-sm text-slate-400">
                  <li>Pesquisas ilimitadas</li>
                  <li>500 oportunidades guardadas</li>
                  <li>100 pesquisas guardadas</li>
                  <li>20 alertas automáticos</li>
                </ul>

                <Link
                  href="/planos"
                  className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Comparar planos
                </Link>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-600">
              Valores mensais. Impostos aplicáveis
              poderão ser adicionados no pagamento.
            </p>
          </section>
        ) : null}

        {!isFree && hasStripeCustomer ? (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/55 p-6 shadow-sm">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Faturação
                </p>

                <h2 className="mt-2 text-lg font-semibold text-white">
                  Faturação e subscrição
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Gere o plano, método de pagamento,
                  faturas e cancelamento através do
                  portal seguro da Stripe.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCustomerPortal}
                disabled={
                  processingAction !== null
                }
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processingAction === "portal" ? (
                  <>
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                    A abrir...
                  </>
                ) : (
                  <>
                    <CreditCard size={17} />
                    Gerir subscrição
                  </>
                )}
              </button>
            </div>
          </section>
        ) : null}

        <div className="mt-8">
          <Link
            href="/pesquisa"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-400"
          >
                    <SearchCheck size={16} />
            Ir para pesquisa
          </Link>
        </div>
      </section>
    </main>
  );
}





