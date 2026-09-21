/**
 * Conversões do Google Ads (gtag).
 *
 * O gtag.js só é carregado após consentimento de cookies de análise
 * (ver components/GoogleAnalytics.tsx). Se o utilizador não consentiu,
 * `window.gtag` não existe e estes eventos são simplesmente ignorados —
 * comportamento correto do ponto de vista de privacidade (RGPD).
 */

const CONVERSION_SEND_TO = "AW-18462196845/M2NwCJzx2f8cEO2Iu-NE";

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void };

function gtagAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as GtagWindow).gtag === "function";
}

function fire(): void {
  (window as GtagWindow).gtag?.("event", "conversion", {
    send_to: CONVERSION_SEND_TO,
  });
}

/**
 * Dispara a conversão de compra.
 *
 * Se o gtag ainda não estiver carregado (o utilizador pode ter consentido
 * apenas nesta sessão), aguarda até ~8s por ele, verificando a cada 400ms.
 * Se entretanto nunca carregar, desiste em silêncio (sem consentimento).
 */
export function trackPurchaseConversion(): void {
  if (typeof window === "undefined") return;

  if (gtagAvailable()) {
    fire();
    return;
  }

  let elapsed = 0;
  const interval = 400;
  const timeout = 8000;

  const timer = window.setInterval(() => {
    elapsed += interval;
    if (gtagAvailable()) {
      window.clearInterval(timer);
      fire();
    } else if (elapsed >= timeout) {
      window.clearInterval(timer);
    }
  }, interval);
}
