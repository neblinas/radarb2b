"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Building2,
  Check,
  Radar,
  Search,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const benefits = [
  {
    icon: Search,
    title: "Encontra oportunidades relevantes",
    description:
      "Pesquisa contratação pública com filtros focados em inteligência comercial.",
  },
  {
    icon: BellRing,
    title: "Acompanha o que interessa",
    description:
      "Guarda pesquisas, oportunidades e alertas num único espaço de trabalho.",
  },
  {
    icon: Building2,
    title: "Percebe quem compra e quem ganha",
    description:
      "Consulta entidades, participantes, adjudicatários e contratos associados.",
  },
];

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");
    setError("");

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push("/");
        router.refresh();
        return;
      }

      setMessage(
        "Conta criada. Verifica o teu email para confirmar a conta.",
      );
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError("Email ou palavra-passe incorretos.");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
      return;
    }

    setLoading(false);
  }

  function toggleMode() {
    setIsSignup((current) => !current);
    setError("");
    setMessage("");
  }

  return (
    <main className="min-h-screen bg-[#06101f] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.15fr)_minmax(460px,0.85fr)]">
        <section className="relative hidden overflow-hidden border-r border-slate-800 lg:flex">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(34,211,238,0.13),transparent_32%),radial-gradient(circle_at_78%_76%,rgba(8,145,178,0.09),transparent_35%)]" />

          <div className="pointer-events-none absolute left-[-180px] top-[-180px] h-[520px] w-[520px] rounded-full border border-cyan-500/5" />
          <div className="pointer-events-none absolute left-[-80px] top-[-80px] h-[320px] w-[320px] rounded-full border border-cyan-500/10" />
          <div className="pointer-events-none absolute bottom-[-220px] right-[-140px] h-[520px] w-[520px] rounded-full border border-cyan-500/5" />

          <div className="relative flex w-full flex-col justify-between p-10 xl:p-14">
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-3"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                  <Radar size={22} />
                </div>

                <div>
                  <p className="text-sm font-bold tracking-[0.22em] text-white">
                    RADAR B2B
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Procurement Intelligence
                  </p>
                </div>
              </Link>
            </div>

            <div className="max-w-2xl py-12">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300">
                <ShieldCheck size={13} />
                Inteligência para contratação pública
              </div>

              <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight text-white xl:text-5xl">
                Transforma dados públicos em oportunidades comerciais.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
                O Radar B2B ajuda empresas a identificar procedimentos,
                acompanhar concorrência e perceber melhor o mercado público
                português.
              </p>

              <div className="mt-10 space-y-6">
                {benefits.map((benefit) => {
                  const Icon = benefit.icon;

                  return (
                    <div
                      key={benefit.title}
                      className="flex max-w-xl gap-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-[#081525] text-cyan-400">
                        <Icon size={17} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-white">
                          {benefit.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Check size={13} className="text-cyan-500" />
              Dados organizados para apoiar decisões comerciais
            </div>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(34,211,238,0.08),transparent_28%)] lg:hidden" />

          <div className="relative w-full max-w-[470px]">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Link
                href="/"
                className="inline-flex items-center gap-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                  <Radar size={20} />
                </div>

                <div>
                  <p className="text-xs font-bold tracking-[0.2em] text-white">
                    RADAR B2B
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    Procurement Intelligence
                  </p>
                </div>
              </Link>
            </div>

            <Link
              href="/"
              className="mb-7 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-cyan-300"
            >
              <ArrowLeft size={15} />
              Voltar ao Radar B2B
            </Link>

            <div className="rounded-[28px] border border-slate-800 bg-[#081525] p-6 shadow-2xl shadow-black/20 sm:p-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  {isSignup ? "Nova conta" : "Área reservada"}
                </p>

                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                  {isSignup ? "Criar conta" : "Bem-vindo de volta"}
                </h1>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {isSignup
                    ? "Cria a tua conta para começares a acompanhar oportunidades no Radar B2B."
                    : "Entra na tua conta para acederes às tuas pesquisas, oportunidades e alertas."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Email
                  </label>

                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nome@empresa.pt"
                    className="h-12 w-full rounded-xl border border-slate-800 bg-[#06101f] px-4 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Palavra-passe
                  </label>

                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={
                      isSignup ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="h-12 w-full rounded-xl border border-slate-800 bg-[#06101f] px-4 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10"
                  />

                  {isSignup ? (
                    <p className="mt-2 text-xs text-slate-600">
                      Mínimo de 6 caracteres.
                    </p>
                  ) : null}
                </div>

                {error ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm leading-5 text-red-300"
                  >
                    {error}
                  </div>
                ) : null}

                {message ? (
                  <div
                    role="status"
                    className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm leading-5 text-emerald-300"
                  >
                    {message}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-[#04101c] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? "A processar..."
                    : isSignup
                      ? "Criar conta"
                      : "Entrar"}

                  {!loading ? (
                    <ArrowRight
                      size={16}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  ) : null}
                </button>
              </form>

              <div className="mt-7 border-t border-slate-800 pt-6 text-center">
                <p className="text-sm text-slate-500">
                  {isSignup
                    ? "Já tens uma conta?"
                    : "Ainda não tens uma conta?"}{" "}
                  <button
                    type="button"
                    onClick={toggleMode}
                    className="font-medium text-cyan-400 transition hover:text-cyan-300"
                  >
                    {isSignup ? "Entrar" : "Criar conta"}
                  </button>
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-slate-600">
              Ao utilizares o Radar B2B estás a aceder a uma plataforma de
              apoio à análise de contratação pública.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}