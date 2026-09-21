/**
 * Eventos de produto (analytics).
 *
 * Reutiliza o gtag.js já carregado pelo GoogleAnalytics apenas DEPOIS de o
 * utilizador autorizar cookies de análise (RGPD). Sem consentimento, `window.gtag`
 * não existe e os eventos são ignorados em silêncio. Não adiciona dependências.
 */

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void };

export function trackEvent(
  name: string,
  params: Record<string, string | number | boolean | null | undefined> = {},
): void {
  if (typeof window === "undefined") return;

  const gtag = (window as GtagWindow).gtag;
  if (typeof gtag !== "function") return;

  gtag("event", name, params);
}
