"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            background: "#080b12",
            color: "#f8fafc",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: "560px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                marginBottom: "12px",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#94a3b8",
              }}
            >
              Adjudata
            </p>

            <h1
              style={{
                margin: 0,
                fontSize: "32px",
                lineHeight: 1.2,
              }}
            >
              Ocorreu um erro inesperado
            </h1>

            <p
              style={{
                margin: "16px 0 24px",
                lineHeight: 1.6,
                color: "#cbd5e1",
              }}
            >
              Não foi possível concluir esta operação. Podes tentar novamente
              sem perder a sessão.
            </p>

            <button
              type="button"
              onClick={reset}
              style={{
                border: "1px solid #334155",
                borderRadius: "10px",
                padding: "11px 18px",
                background: "#111827",
                color: "#f8fafc",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Tentar novamente
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}