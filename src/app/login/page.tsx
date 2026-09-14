"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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
        "Conta criada. Verifica o teu email para confirmar a conta."
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-5">
        <div className="w-full">
          <Link
            href="/"
            className="mb-8 inline-block text-sm text-slate-500 transition hover:text-cyan-400"
          >
            ← Voltar ao Radar B2B
          </Link>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight">
                {isSignup ? "Criar conta" : "Entrar no Radar B2B"}
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                {isSignup
                  ? "Cria a tua conta para começar a utilizar o Radar B2B."
                  : "Acede à tua conta e às funcionalidades do Radar B2B."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
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
                  className="h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
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
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {message && (
                <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="h-12 w-full rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "A processar..."
                  : isSignup
                    ? "Criar conta"
                    : "Entrar"}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-800 pt-5 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignup(!isSignup);
                  setError("");
                  setMessage("");
                }}
                className="text-sm text-slate-500 transition hover:text-cyan-400"
              >
                {isSignup
                  ? "Já tens conta? Entrar"
                  : "Ainda não tens conta? Criar conta"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
