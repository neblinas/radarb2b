# Analytics — Notas de implementação

## Identificador

| Item | Valor |
|---|---|
| Plataforma | Google Analytics 4 (GA4) |
| Measurement ID | **`G-EH77XFY30W`** |

> Este ID é **público** (vai para o HTML da página). Não é secreto.
> Deve ser exposto via variável de ambiente `NEXT_PUBLIC_GA_MEASUREMENT_ID`.

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
