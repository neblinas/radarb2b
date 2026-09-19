# Especificação — Portal de Ganhos do Comercial

> Estado: **IMPLEMENTADO** (2026-09-23) — motor de comissões, portal do comercial
> e gestão. Ver anexo A no fim para os artefactos e a validação.
> Autor do pedido: Tiago (Radar B2B). Análise e sugestões: agente.

## 0. O que ficou implementado

**Base de dados (migrações):**
- `20260923090000_commission_engine.sql` — código de referência, atribuições,
  regras versionadas, extensão do ledger, motor `commission_sync_subscription`
  (idempotente) e RPCs `commercial_my_clients` / `commercial_my_earnings`.
- `20260923091000_commission_engine_v2.sql` — correção do cálculo de equipa
  anual (5% da subscrição) e separação mensal/anual no índice de idempotência.
- `20260923092000_commission_admin_actions.sql` — `commercial_attribute_client`,
  `commercial_my_referral_code`, `commercial_team_earnings`,
  `commercial_mark_paid`, `commercial_approve_commission`,
  `commercial_cancel_commission`, `commercial_admin_options`.
- `20260923093000_commission_stripe_bridge.sql` — motor interno sem role
  (`commission_engine_internal`), porta de serviço
  (`commission_sync_subscription_service`, com clawback), `commission_resync_client`.
- `20260923094000_commission_interval_fix.sql` — **corrige a deteção
  mensal/anual** (passa a usar o price ID do Stripe, não a heurística errada
  `price_annual > price_monthly * 6`) e o `commercial_my_clients`.
- `20260923095000_commercial_program_terms.sql` — tabelas
  `commercial_program_terms` (versões) e `commercial_terms_acceptances`
  (aceitações com versão + hash), RPCs `commercial_current_terms`,
  `commercial_my_terms_status`, `commercial_accept_terms` e o texto dos termos v1.
- `20260923096000_commercial_terms_hash_fix.sql` — corrige o hash da aceitação
  (`digest` não estava no search_path; passa a usar `md5`).
- `20260923097000_commercial_terms_public.sql` — leitura pública
  (`commercial_program_terms_public`) para a página `/programa-comercial`.

**Termos:** ecrã de aceitação bloqueante (`CommercialTermsGate`) no portal do
comercial + página pública `/programa-comercial` (link no rodapé).

**Stripe:** `stripe-webhook/index.ts` passa a chamar o motor de comissões em
`checkout.session.completed`, `customer.subscription.created|updated|deleted` e
`invoice.payment_succeeded` (best-effort — uma falha de comissões não derruba o
webhook).

**Frontend:**
- `web/src/lib/commercial.ts` — tipos, formatação e chamadas às RPCs.
- `web/src/app/backoffice/comissoes/page.tsx` — **"Os meus ganhos"** (KPIs + extrato).
- `web/src/app/backoffice/clientes/page.tsx` — **"Os meus clientes"** + link de referência.
- `web/src/app/backoffice/comissoes/gestao/page.tsx` — **gestão** (atribuir, aprovar, pagar, cancelar).

**Validação:** 10/10 testes do motor + cenário de 2 níveis + RPCs do portal;
`npm test` (54), `lint`, `tsc`, `build` todos verdes.

## 1. Objetivo

O comercial deve ter, no seu portal, uma visão dos seus próprios ganhos:
- **Clientes que subscreveram** por sua intermediação;
- **Ganhos diretos** (comissões das suas vendas);
- **Ganhos de equipa** (comissões pelos clientes trazidos pelos comerciais da sua equipa).

## 2. Regras de comissão (conforme definido pelo negócio)

### 2.1 Venda direta (o próprio comercial trouxe o cliente)

| Cenário | Comissão |
|---|---|
| Cliente **mensal** | **100% da 1.ª mensalidade** + **10% nos 5 meses seguintes** (enquanto a subscrição estiver ativa) |
| Cliente **anual** | **20% da subscrição** (valor anual, pagamento único) |

### 2.2 Venda de equipa (cliente trazido por um comercial da EQUIPA do gestor)

| Cenário | Comissão para o gestor/mentor |
|---|---|
| Cliente **mensal** | **50% da 2.ª mensalidade** (só se a 2.ª mensalidade for efetivamente paga) |
| Cliente **anual** | **5% da subscrição** |

> **Racional do "50% da 2.ª mensalidade":** só se paga comissão de equipa quando
> existe **segunda mensalidade paga** — se o cliente sair após o 1.º mês, a
> comissão de equipa seria prejuízo. Este desenho protege a margem.

## 3. Modelo de dados já existente (reutilizar)

- `public.commercial_commission_ledger` — livro de movimentos:
  - `beneficiary_id` (quem recebe), `source_user_id` (quem vendeu),
    `subscription_id`, `plan_id`,
  - `commission_type` ∈ (`direct_subscription`, `team_subscription`, `adjustment`),
  - `amount`, `status` ∈ (`pending`, `approved`, `paid`, `cancelled`),
  - `period_start`, `period_end`, `note`, `paid_at`.
- `public.organization_members.manager_id` — liga o comercial ao seu gestor/mentor.
- `public.commercial_commission_summary()` — soma `direct_total`, `team_total`,
  `pending_total`, `paid_total` por beneficiário.
- Página: `web/src/app/backoffice/comissoes/page.tsx` (já existe, a melhorar).



**O que faltava (agora implementado):** motor de cálculo das regras (2.1 e 2.2)
+ página do comercial com os seus clientes e ganhos detalhados. Ver secção 0.

## 4. O que foi implementado

### 4.1 Base de dados
- [x] Atribuição cliente↔comercial (`commercial_attributions`) e código de
      referência (`commercial_referral_codes`, link `?ref=CODIGO`).
- [x] **Motor de cálculo** `commission_sync_subscription(sub, meses, anual)`,
      idempotente (seguro correr várias vezes).
- [x] **Regra de equipa** via `organization_members.manager_id`, com **2 níveis**
      (nível 1 = gestor direto; nível 2 = gestor do gestor).
- [x] **Bónus de retenção** (mês 7+) e **bónus de recrutamento** (5%, 6 meses).
- [x] RPC `commercial_my_clients()` — clientes do comercial/equipa.
- [x] RPC `commercial_my_earnings()` — detalhe de ganhos.
- [x] RPCs de gestão: atribuir, aprovar, pagar, cancelar, opções para UI.

### 4.2 Frontend (portal do comercial)
- [x] Página **"Os meus ganhos"** (`backoffice/comissoes`) — KPIs + extrato.
- [x] Página **"Os meus clientes"** (`backoffice/clientes`) + link de referência.
- [x] Página **"Gestão de comissões"** (`backoffice/comissoes/gestao`).
- [x] Separar a visão do **comercial** da do **gestor**/**admin** (por role).

### 4.3 Base legal e proteção
- [x] Regras versionadas (`commercial_commission_rules` + `rule_version` por movimento).
- [x] Estado `cancelled` para estornos (chargeback/cancelamento).
- [x] **Termos do programa comercial** (`commercial_program_terms` v1) com
      aceitação registada (versão + hash + data) em `commercial_terms_acceptances`.
- [x] Ecrã de aceitação bloqueante no portal (`CommercialTermsGate`) e página
      pública `/programa-comercial`.

> **Nota de produução:** o disparo do motor (`commission_sync_subscription`) deve
> ser ligado aos webhooks do Stripe (renovação/cancelamento) — a função já é
> idempotente e pronta a chamar. Até lá, é o gestor que reprocessa manualmente.

### 4.4 Ponte Stripe (feita)
- [x] `stripe-webhook` chama o motor em `checkout.session.completed`,
      `customer.subscription.created|updated|deleted` e
      `invoice.payment_succeeded`.
- [x] Motor de serviço (`commission_engine_internal` +
      `commission_sync_subscription_service`) acessível só ao service role
      (sem grant a `authenticated`); o webhook não tem `auth.uid()`.
- [x] **Clawback automático:** em `customer.subscription.deleted`, as comissões
      `pending` são canceladas.
- [x] Sincronização de comissões é **best-effort** (não derruba o webhook se
      falhar; o pagamento/subscrição local já foi atualizado).
- [x] **Deteção mensal/anual corrigida** — usa o price ID do Stripe da
      subscrição, não uma heurística de preço.

### 4.5 Por ligar (opcional)
- [ ] Apresentar os preços dos planos na UI de atribuição.
- [ ] Simulador de comissões (sugestão 6).

## 5. Sugestões de melhoria (do agente)

1. **Escalonamento por volume / recorrente.** Medir o *12.º mês* de valor (LTV)
   e não só os 5 meses. Extensão natural: no mês 6+, uma pequena % de
   **retention bonus** (ex.: 3%) enquanto o cliente ficar — incentiva retenção.

2. **"Clawback" (reversão).** Se o cliente cancelar nos primeiros N meses,
   reverter proporcionalmente a comissão já paga. Protege a empresa.

3. **Antecipação de comissões (cash advance).** O comercial pode "antecipar"
   comissões futuras com um desconto pequeno — melhora UX, mas requer controlo
   financeiro.

4. **Plafond mensal / teto.** Sem teto, um vendedor com muitos anuais pode ter
   picos difíceis de gerir. Definir teto ou escalões.

5. **Comissão de equipa em 2 níveis.** Hoje é gestor→comercial (1 nível). Se
   houver estruturas de 2–3 níveis, definir `manager_id` em cadeia e um % menor
   para o nível superior (ex.: 5% / 2%).

6. **Simulador na app.** Ferramenta de simulação ("quanto ganho se vender plano
   X mensal/anual") ajuda o comercial a vender melhor.

7. **Transparência de estado.** Mostrar "quando" cada comissão vira
   `approved`→`paid` (datas), para reduzir suporte.

8. **Regra de "primeira venda" única.** Definir claramente se a comissão de
   equipa se aplica a **todo** o cliente ou só à **1.ª venda** — evitar
   ambiguidade em renovações.

9. **Cliente anual com mensalidade fracionada.** Confirmar se o "anual" é
   pagamento único (20% de uma vez) — se for fracionado, definir a base.

## 6. DECISÕES FINAIS (fechadas — critério: maximizar motivação p/ vender e recrutar)

> Decididas pelo agente a pedido do Tiago ("decide a melhor forma de manter o
> comercial motivado a vender E a recrutar"). Documentadas para auditoria.

| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| A | Atribuição de cliente a comercial | **Link de referência** (`?ref=CODIGO`) automático **+ atribuição manual** aprovada pelo gestor (fallback) | Automático motiva (não depende de aprovações); manual cobre vendas que chegam por outros canais |
| B | Natureza do plano anual | **Pagamento único** | Simples, sem ambiguidade de prestações |
| C | Base de cálculo | **Valor líquido (sem IVA)** | O IVA não é receita — evita comissões sobre dinheiro que não é vosso |
| D | Beneficiário da comissão de equipa | **Quem recrutou/mentoriza** (`manager_id`) **até 2 níveis** | Incentiva recrutar: quem traz comerciais ganha pelos clientes deles |
| E | Aplica-se a renovações? | **Só à primeira subscrição** (com **retention bonus** no mês 7+) | Simples e previsível; o bónus de retenção motiva a manter o cliente ativo |
| F | Clawback (cancelamento precoce) | **Sim** — no plano mensal, se o cliente cancelar **antes de pagar a 2.ª mensalidade**, cancela as comissões de 10% futuras (as de equipa nunca chegam a existir). O que já foi pago mantém-se | Protege a margem; só afeta comissões ainda não ganhas |
| G | Pagamento das comissões | **Manual (admin confirma)** com histórico visual de datas | Controlo financeiro; o comercial vê o estado e as datas |

### Extras de motivação (implementados)

- **Retention bonus:** a partir do 7.º mês (cliente mensal ativo), o comercial
  recebe **3% da mensalidade** enquanto o cliente se mantiver. Alinha o interesse
  do comercial com a retenção de longo prazo.
- **Bónus de recrutamento:** quem recruta um comercial recebe **5% da comissão
  direta** desse recrutado, nos **primeiros 6 meses** de atividade dele. Torna o
  recrutamento financeiramente atrativo desde o primeiro dia.
- **2 níveis de equipa:** nível 1 = 50%/5% (2.ª mensalidade / anual);
  nível 2 = 20%/2% (do nível 1). Estrutura escalável.

### Versionamento das regras

As percentagens ficam numa tabela `commercial_commission_rules` (versionada por
data). Assim, alterações futuras **não recalculam** comissões antigas, e cada
movimento guarda a versão da regra aplicada (`rule_version`).

## 7. Notas de arquitetura

- Manter o `commercial_commission_ledger` como **fonte de verdade** dos
  movimentos; as regras apenas **geram** linhas nele.
- O cálculo de comissões deve ser **idempotente** (não duplicar movimentos se
  correr duas vezes para o mesmo período).
- Estados: `pending` (gerado, à espera do pagamento do cliente) →
  `approved` (pagamento confirmado) → `paid` (pago ao comercial). `cancelled`
  para reversões.
- Alinhar com os **webhooks do Stripe** (cancelamento/renovação) — já existem
  edge functions (`stripe-webhook`).

## Anexo A — Artefactos e validação

**Migrações:** `20260923090000_commission_engine.sql`,
`20260923091000_commission_engine_v2.sql`,
`20260923092000_commission_admin_actions.sql`,
`20260923093000_commission_stripe_bridge.sql`,
`20260923094000_commission_interval_fix.sql`,
`20260923095000_commercial_program_terms.sql`,
`20260923096000_commercial_terms_hash_fix.sql`,
`20260923097000_commercial_terms_public.sql`.

**Código:** `web/src/lib/commercial.ts` (+ `commercial.test.ts`),
`web/src/components/CommercialTermsGate.tsx`,
`web/src/app/backoffice/comissoes/page.tsx`,
`web/src/app/backoffice/clientes/page.tsx`,
`web/src/app/backoffice/comissoes/gestao/page.tsx`,
`web/src/app/programa-comercial/page.tsx`,
`web/src/components/PublicFooter.tsx` (link),
`web/src/components/BackofficeShell.tsx` (navegação).

**Regras v1 (valores por omissão em `commercial_commission_rules`):**
direto mensal 100% + 10%×5 + retenção 3% (mês 7+); direto anual 20%;
equipa mensal 50% da 2.ª mensalidade; equipa anual 5%; nível 2 = 20% do nível 1;
recrutador 5% durante 6 meses.

**Validação executada:**
- Motor mensal (8 meses): 29,64 € diretos + 9,50 € equipa + 1,43 € recruiter.
- Anual: 41,00 € diretos (20%) + 10,25 € equipa (5%) + 2,05 € recruiter.
- 2 níveis: C2 direto 29,64 €; C1 equipa 9,50 €; nível 2 = 1,90 € (20%).
- Idempotência (3×): 1 movimento por slot. Progressão incremental 1→6 meses.
- RPCs do portal e controlo de acesso (`commercial_admin_options` devolve 0
  para um comercial).
- **Ponte Stripe (motor de serviço):** `commission_resync_client` idempotente
  (3 corridas = 1 movimento), **mensal → 19 €**, **anual → 41 €** (deteção
  corrigida pelo price ID), clawback cancela `pending`.
- **Termos:** `commercial_current_terms` v1; `commercial_my_terms_status`
  `accepted:false` → `true` após `commercial_accept_terms` (versão 1, hash md5
  guardado); leitura pública OK.
- Suíte: `npm test` 58/58, `tsc`, `lint`, `npm run build` — todos verdes
  (rota `/programa-comercial` gerada).
