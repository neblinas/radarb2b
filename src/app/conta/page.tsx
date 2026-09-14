"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  LogOut,
  Search,
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
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<
    "success" | "cancelled" | null
  >(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");

    if (checkout === "success" || checkout === "cancelled") {
      setCheckoutMessage(checkout);

      const cleanUrl = new URL(window.location.href);
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
        window.location.href = "/login";
        return;
      }

      const [profileResult, subscriptionResult, usageResult] =
        await Promise.all([
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
            .order("period_start", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (
        profileResult.error ||
        subscriptionResult.error ||
        usageResult.error
      ) {
        setError("Não foi possível carregar os dados da conta.");
        setLoading(false);
        return;
      }

      const planData = subscriptionResult.data?.plans;
      const plan = Array.isArray(planData)
        ? planData[0] ?? null
        : planData ?? null;

      setAccount({
        email: user.email ?? "",
        planId: subscriptionResult.data?.plan_id ?? "free",
        planName: plan?.name ?? "Free",
        maxSearches: plan?.max_searches_month ?? null,
        searchesUsed: usageResult.data?.searches_used ?? 0,
        accountStatus:
          profileResult.data?.account_status ?? "active",
        subscriptionStatus:
          subscriptionResult.data?.status ?? "active",
        stripeCustomerId:
          subscriptionResult.data?.stripe_customer_id ?? null,
        stripeSubscriptionId:
          subscriptionResult.data?.stripe_subscription_id ?? null,
        cancelAtPeriodEnd:
          subscriptionResult.data?.cancel_at_period_end ?? false,
        currentPeriodEnd:
          subscriptionResult.data?.current_period_end ?? null,
      });

      setLoading(false);
    }

    loadAccount();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleCheckout(planId: "starter" | "pro") {
    setActionError("");
    setProcessingAction(planId);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        window.location.href = "/login";
        return;
      }

      const { data, error: functionError } =
        await supabase.functions.invoke(
          "create-checkout-session",
          {
            body: {
              plan_id: planId,
            },
          },
        );

      if (functionError) {
        throw functionError;
      }

      if (!data?.url) {
        throw new Error(
          "A sessão de pagamento não devolveu um endereço válido.",
        );
      }

      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setActionError(
        "Não foi possível iniciar o pagamento. Tenta novamente.",
      );
      setProcessingAction(null);
    }
  }

  async function handleCustomerPortal() {
    setActionError("");
    setProcessingAction("portal");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        window.location.href = "/login";
        return;
      }

      const { data, error: functionError } =
        await supabase.functions.invoke(
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
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <p className="text-sm text-slate-400">
            A carregar conta...
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-6">
            <p className="text-sm text-red-300">
              {error}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const usagePercentage =
    account?.maxSearches && account.maxSearches > 0
      ? Math.min(
          (account.searchesUsed / account.maxSearches) * 100,
          100,
        )
      : 0;

  const isFree = account?.planId === "free";
  const hasStripeCustomer = Boolean(account?.stripeCustomerId);
  const currentPeriodEndFormatted = formatDate(
    account?.currentPeriodEnd ?? null,
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-white"
            >
              RADAR B2B
            </Link>

            <p className="mt-1 text-xs text-slate-500">
              Public Procurement Intelligence
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
          >
            <LogOut size={16} />
            Sair
          </button>
        </header>

        <div className="mt-8 flex items-center gap-3">
          <UserCircle
            className="text-cyan-400"
            size={30}
          />

          <div>
            <h1 className="text-2xl font-bold">
              A minha conta
            </h1>

            <p className="text-sm text-slate-500">
              Consulta o teu plano, utilização e faturação.
            </p>
          </div>
        </div>

        {checkoutMessage === "success" && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-4">
            <CheckCircle2
              className="mt-0.5 shrink-0 text-emerald-400"
              size={20}
            />

            <div>
              <p className="font-semibold text-emerald-300">
                Pagamento concluído
              </p>

              <p className="mt-1 text-sm text-emerald-200/70">
                A tua subscrição está a ser atualizada.
              </p>
            </div>
          </div>
        )}

        {checkoutMessage === "cancelled" && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-4">
            <XCircle
              className="mt-0.5 shrink-0 text-amber-400"
              size={20}
            />

            <div>
              <p className="font-semibold text-amber-300">
                Pagamento cancelado
              </p>

              <p className="mt-1 text-sm text-amber-200/70">
                Não foi efetuada qualquer alteração à tua subscrição.
              </p>
            </div>
          </div>
        )}

        {actionError && (
          <div className="mt-6 rounded-2xl border border-red-900/50 bg-red-950/20 p-4">
            <p className="text-sm text-red-300">
              {actionError}
            </p>
          </div>
        )}

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Conta
            </p>

            <p className="mt-3 break-all text-sm text-white">
              {account?.email}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Estado: {account?.accountStatus}
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-900/40 bg-slate-900 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Plano atual
            </p>

            <p className="mt-3 text-2xl font-bold text-white">
              {account?.planName}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Estado da subscrição:{" "}
              {account?.subscriptionStatus}
            </p>

            {account?.cancelAtPeriodEnd &&
              currentPeriodEndFormatted && (
                <p className="mt-2 text-xs text-amber-400">
                  Cancelamento agendado para{" "}
                  {currentPeriodEndFormatted}.
                </p>
              )}

            {!account?.cancelAtPeriodEnd &&
              !isFree &&
              currentPeriodEndFormatted && (
                <p className="mt-2 text-xs text-slate-500">
                  Próxima renovação:{" "}
                  {currentPeriodEndFormatted}.
                </p>
              )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pesquisas este mês
              </p>

              <p className="mt-2 text-3xl font-bold">
                {account?.searchesUsed}

                {account?.maxSearches !== null && (
                  <span className="text-lg font-normal text-slate-500">
                    {" "}
                    / {account?.maxSearches}
                  </span>
                )}
              </p>
            </div>

            <Search
              className="text-cyan-400"
              size={28}
            />
          </div>

          {account?.maxSearches !== null ? (
            <div className="mt-5">
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all"
                  style={{
                    width: `${usagePercentage}%`,
                  }}
                />
              </div>

              <p className="mt-2 text-xs text-slate-500">
                {account?.searchesUsed} de{" "}
                {account?.maxSearches} pesquisas utilizadas este mês.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-cyan-300">
              Pesquisas ilimitadas.
            </p>
          )}
        </section>

        {isFree && (
          <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center gap-3">
              <CreditCard
                className="text-cyan-400"
                size={24}
              />

              <div>
                <h2 className="font-semibold">
                  Escolher um plano
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Aumenta os limites e ativa alertas automáticos.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
                <p className="text-lg font-bold">
                  Starter
                </p>

                <p className="mt-1 text-2xl font-bold text-cyan-400">
                  19 €
                  <span className="text-sm font-normal text-slate-500">
                    {" "}
                    / mês
                  </span>
                </p>

                <p className="mt-3 text-sm text-slate-400">
                  200 pesquisas, 100 oportunidades guardadas e
                  5 alertas.
                </p>

                <button
                  onClick={() =>
                    handleCheckout("starter")
                  }
                  disabled={processingAction !== null}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingAction === "starter" ? (
                    <>
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />
                      A preparar...
                    </>
                  ) : (
                    "Escolher Starter"
                  )}
                </button>
              </div>

              <div className="rounded-xl border border-cyan-900/50 bg-slate-950/50 p-5">
                <p className="text-lg font-bold">
                  Pro
                </p>

                <p className="mt-1 text-2xl font-bold text-cyan-400">
                  39 €
                  <span className="text-sm font-normal text-slate-500">
                    {" "}
                    / mês
                  </span>
                </p>

                <p className="mt-3 text-sm text-slate-400">
                  Pesquisas ilimitadas, 500 oportunidades
                  guardadas e 20 alertas.
                </p>

                <button
                  onClick={() =>
                    handleCheckout("pro")
                  }
                  disabled={processingAction !== null}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingAction === "pro" ? (
                    <>
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />
                      A preparar...
                    </>
                  ) : (
                    "Escolher Pro"
                  )}
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-600">
              Valores mensais. Impostos aplicáveis poderão ser
              adicionados no pagamento.
            </p>
          </section>
        )}

        {!isFree && hasStripeCustomer && (
          <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">
                  Faturação e subscrição
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Gere o plano, método de pagamento, faturas e
                  cancelamento através do portal seguro da Stripe.
                </p>
              </div>

              <button
                onClick={handleCustomerPortal}
                disabled={processingAction !== null}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-800 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-950/30 disabled:cursor-not-allowed disabled:opacity-50"
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
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/pesquisa"
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            <Search size={17} />
            Ir para pesquisa
          </Link>

          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl border border-slate-800 px-5 py-3 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
          >
            <ArrowLeft size={17} />
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}