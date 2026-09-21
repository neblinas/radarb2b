import type { Metadata } from "next";
import { Suspense } from "react";
import CompetitorAnalysisClient from "./CompetitorAnalysisClient";

export const metadata: Metadata = {
  title: "Análise de concorrência",
  description:
    "Identifica concorrentes reais a partir dos procedimentos de contratação pública em que participam, com quem competem e onde ganham.",
  robots: { index: false, follow: false },
};

export default function ConcorrenciaPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[1400px] px-4 py-16 text-center text-sm text-slate-500 sm:px-6 lg:px-8">
          A carregar análise de concorrência…
        </main>
      }
    >
      <CompetitorAnalysisClient />
    </Suspense>
  );
}
