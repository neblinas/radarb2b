# Stripe — integração de pagamentos

## Values to Replace

Configurar no Supabase (Secrets) e no Vercel:

| Campo | Valor esperado |
|---|---|
| `STRIPE_SECRET_KEY` | Chave Live `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Secret do webhook Live `whsec_...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Chave pública Live `pk_live_...` |

Os Price IDs são lidos da tabela `plans` (`stripe_price_id` e `stripe_price_id_annual`). Confirmar que pertencem à conta Stripe Live.

## Configured Parameters

A função `supabase/functions/create-checkout-session/index.ts` usa `mode=subscription`, `ui_mode=form`, recolha automática de morada, recolha de telefone desativada, automatic tax desativado, payment method collection `always`, submit type `auto` e integration identifier `custom_embedded_web_0001`.

## Setup and next steps

1. Configurar os três secrets/variáveis com valores Live.
2. Publicar a Edge Function `create-checkout-session`.
3. Configurar no Stripe Live o webhook para `stripe-webhook` e definir `STRIPE_WEBHOOK_SECRET`.
4. Confirmar que os Price IDs Live correspondem aos planos Starter e Pro.

O fluxo é: utilizador autenticado escolhe um plano, o backend cria/associa o Customer Stripe, cria a Checkout Session e devolve `client_secret`; o formulário Stripe é montado no browser e o webhook atualiza a subscrição.
