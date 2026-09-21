# Analytics — Notas de implementação

## Identificador

| Item | Valor |
|---|---|
| Plataforma | Google Analytics 4 (GA4) |
| Measurement ID | **`G-EH77XFY30W`** |
| Google Ads (conversões) | **`AW-18462196845`** |

> Ambos os IDs são **públicos** (vão para o HTML da página). Não são secretos.
> Expostos via `NEXT_PUBLIC_GA_MEASUREMENT_ID` e `NEXT_PUBLIC_GOOGLE_ADS_ID`.

## Conversões do Google Ads

A conversão de **compra** dispara em `/conta` quando o utilizador volta da
Stripe com `?checkout=success` (ver `src/app/conta/page.tsx` e
`src/lib/googleAds.ts`).

- Só dispara **após consentimento de cookies de análise** (RGPD).
- O `gtag.js` tem de carregar **também** o ID do Ads (`gtag('config','AW-...')`),
  senão o evento `conversion` não é atribuído. Ver `components/GoogleAnalytics.tsx`.
- `transaction_id` não é enviado por omissão; para atribuição por transação,
  incluir o ID da sessão Stripe no `success_url` e passá-lo aqui.

## Plano de implementação (a fazer)

1. **Variável de ambiente** na Vercel (Production + Preview + Development):
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID = G-EH77XFY30W`
2. **Integrar o GA4** no Next.js (App Router). Abordagem recomendada:
   - Usar `@next/third-parties/google` (`<GoogleAnalytics gaId={...} />`)
     no `src/app/layout.tsx`, montado a partir da variável de ambiente.
   - Alternativa: script `gtag.js` manual no `layout.tsx`.
3. **Privacidade / cookies** (importante!):
   - Só carregar o GA4 **após consentimento** (banner de cookies já existe).
   - O projeto tem páginas `cookies` e `privacidade` — atualizar se necessário.
   - Considerar `anonymize_ip` / modo de consentimento (Consent Mode v2).
4. **Eventos a medir** (definir com o negócio):
   - Vistas de página (automático)
   - Pesquisas realizadas
   - Criação de conta / login
   - Conversão de planos (checkout)
   - No back-office: funil de prospeção (claim, contacto, won)

## Alternativas consideradas

- **Vercel Analytics** (privacidade-friendly, sem cookies) — mais simples, menos
  dados de funil.
- **Plausible / Umami** (self-host ou pago) — focados em privacidade.

## Estado

- [ ] Definir variável `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- [ ] Integrar no `layout.tsx`
- [ ] Respeitar consentimento de cookies
- [ ] Definir e instrumentar eventos de negócio
- [ ] Validar no GA4 (tempo real)
