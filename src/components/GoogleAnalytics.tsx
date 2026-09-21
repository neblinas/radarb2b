"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const STORAGE_KEY = "radar_cookie_consent";
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    const consent = JSON.parse(stored) as { analytics?: boolean };
    return Boolean(consent.analytics);
  } catch {
    return false;
  }
}

/**
 * Carrega a etiqueta do Google (gtag.js) apenas depois de o utilizador
 * autorizar cookies de análise (RGPD). Reage a mudanças de consentimento
 * disparadas pelo CookieConsent.
 */
export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setEnabled(hasAnalyticsConsent()), 0);

    function onConsent(event: Event) {
      const detail = (event as CustomEvent<{ analytics?: boolean }>).detail;
      setEnabled(Boolean(detail?.analytics));
    }

    window.addEventListener("radar-cookie-consent", onConsent);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("radar-cookie-consent", onConsent);
    };
  }, []);

      if (!(GA_ID || ADS_ID) || !enabled) return null;

  return (
    <>
      <Script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID || ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          ${GA_ID ? `gtag('config', '${GA_ID}');` : ""}
          ${ADS_ID ? `gtag('config', '${ADS_ID}');` : ""}
        `}
      </Script>
    </>
  );
}
