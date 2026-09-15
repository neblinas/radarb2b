import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,

      enabled: Boolean(process.env.SENTRY_DSN),

      environment:
        process.env.SENTRY_ENVIRONMENT ??
        process.env.NODE_ENV,

      tracesSampleRate: 0,

      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,

      enabled: Boolean(process.env.SENTRY_DSN),

      environment:
        process.env.SENTRY_ENVIRONMENT ??
        process.env.NODE_ENV,

      tracesSampleRate: 0,

      sendDefaultPii: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
