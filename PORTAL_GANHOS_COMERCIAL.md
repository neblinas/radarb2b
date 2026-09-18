# Especificação — Portal de Ganhos do Comercial

> Estado: **POR IMPLEMENTAR** (planeado para a próxima sessão).
> Autor do pedido: Tiago (Radar B2B). Análise e sugestões: agente.

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

**O que FALTA:** motor de cálculo das regras (2.1 e 2.2) + página do comercial
com os seus clientes e ganhos detalhados.

## 4. O que implementar (próxima sessão)

### 4.1 Base de dados
- [ ] Tabela/colunas para **subscrições dos clientes** ligadas ao prospect/comercial
      (`subscription_id`, plano mensal/anual, valor, datas, estado, meses pagos).
- [ ] Coluna `created_by_user_id` / `attributed_to` na subscrição (quem trouxe).
- [ ] **Função de cálculo** `commission_plan(subscription)` que gera os movimentos:
  - mensal: 1.ª mensalidade (100%) + até 5 movimentos de 10% (mês 2–6),
    gerados **à medida que cada mês é pago**;
  - anual: 1 movimento de 20%.
- [ ] **Regra de equipa:** quando o vendedor tem `manager_id` ≠ ele próprio,
      gerar para o **gestor** 50% da 2.ª mensalidade (mensal) ou 5% (anual).
- [ ] Agendador (semanal/mensal) que:
  - deteta meses pagos (via Stripe/webhooks), gera comissões `pending`;
  - expira/cancela comissões futuras se a subscrição for cancelada.
- [ ] RPC `commercial_my_clients()` — clientes subscritores do comercial (nome,
      plano, valor, data, estado, total de comissão gerada, "referido por").
- [ ] RPC `commercial_my_earnings()` — detalhe de ganhos (diretos, equipa,
      pendentes, pagos) com histórico.

### 4.2 Frontend (portal do comercial)
- [ ] Página **"Ganhos"** (evoluir `backoffice/comissoes`):
  - KPIs: ganhos diretos, ganhos de equipa, pendentes, pagos.
  - Tabela de **clientes subscritores** com plano e valor.
  - Tabela de **comissões** (data, tipo, cliente, valor, estado).
- [ ] Página **"Os meus clientes"** — lista de subscritores com detalhe.
- [ ] Separar a visão do **comercial** (só os seus) da visão do
      **gestor** (equipa) e do **admin** (organização).

### 4.3 Base legal e proteção
- [ ] Regras de comissão versionadas/registadas (auditoria) — alterações futuras
      não devem recalcular retroativamente sem intenção.
- [ ] Termos do programa comercial (o comercial aceita as regras).
- [ ] Estado `cancelled` para estornos (chargeback/cancelamento).

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

## 6. Perguntas em aberto (decidir antes de implementar)

- [ ] O **anual** é pagamento único? 20% sobre que valor exato (com/sem IVA)?
- [ ] A comissão de equipa (50% 2.ª mensalidade) vai para o **gestor direto** ou
      para quem **referiu** o comercial? (o pedido diz "comerciais da sua equipa")
- [ ] Aplica-se a **renovações** ou só à **primeira subscrição**?
- [ ] **Clawback** em caso de cancelamento — aplicar?
- [ ] Base de cálculo: valor **com IVA** ou **sem IVA** (líquido)?

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
