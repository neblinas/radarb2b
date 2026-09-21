# Sales Autopilot — Operação

Sistema de prospeção e vendas automáticas do Radar B2B, construído **nativamente**
sobre Supabase + Postgres, sem orquestradores externos (sem Make.com, sem Redis).

> Estado: **desligado por omissão**. Nenhuma ação comercial automática corre até
> ser explicitamente ativada pelo back-office.

---

## 1. Princípios

- **Nativo.** Fila, jobs, logs, state machine e suppression vivem em Postgres.
  O "motor" é uma Edge Function (`autopilot-run`).
- **Seguro por defeito.** Todas as flags começam a `false` e
  `autopilot_dry_run = true`.
- **Compliance primeiro.** Verificação de suppression **antes de qualquer envio**,
  com falha em segurança (em dúvida, **não envia**).
- **Sem dados inventados.** A personalização usa apenas dados reais de
  `company_prospect_scores`, `company_public_profiles` e `company_public_contacts`.
- **Humano manda.** Se um comercial atribuir um prospect a si próprio, a automação
  suspende-se para esse prospect (`human_review`).

---

## 2. Arquitetura

| Componente | Onde | Papel |
|---|---|---|
| `app_settings` | Postgres | Feature flags + regras configuráveis |
| `automation_jobs` | Postgres | Fila de trabalho (SKIP LOCKED, retry, dedup) |
| `automation_runs` | Postgres | Logs estruturados por execução |
| `automation_events` | Postgres | State machine auditável do prospect |
| `email_suppressions` | Postgres | Suppression list central |
| `autopilot-run` | Edge Function | Worker de prospeção (service role) |
| `autopilot-outreach` | Edge Function | Worker de envio de sequências (service role) |
| `email-track` | Edge Function | Pixel/clique (público, por token) |
| `email-unsubscribe` | Edge Function | Cancelamento (público, por token) |
| `resend-webhook` | Edge Function | Bounces/complaints do Resend |
| `inbound-email` | Edge Function | Ingestão + classificação de respostas |
| `autopilot-lifecycle` | Edge Function | Worker de ciclo de vida de clientes |
| `automation_*` (TS) | `web/src/lib` | Config, estado, suppression, templates (testado) |
| `inbound_*` (TS) | `web/src/lib` | Parsing/classificação inbound (testado) |
| `customerLifecycle.ts` (TS) | `web/src/lib` | Estágio/health/next-action (testado) |
| `user_activity` | Postgres | Último "visto" + logins (health score real) |
| `/backoffice/autopilot` | UI | Painel de controlo (flags, fila, logs, suppression) |

### Fila de aprovação humana (FASE 7)

- **Flag `autopilot_require_approval`** (default **TRUE**): com o outbound
  ligado, cada email fica em `pending_approval` até um gestor aprovar.
- **Fluxo:** o worker gera a mensagem (status `pending_approval`) e **para** —
  não envia nem avança a sequência. Aprovar re-enfileira o envio; rejeitar
  pausa o enrollment.
- **Re-checagem no envio:** suppression e rate limit são reverificados *entre a
  aprovação e o envio real* (fail-safe).
- **UI:** separador “Aprovações” em `/backoffice/autopilot` — rever
  assunto/corpo, aprovar ou rejeitar.
- **RPCs:** `outreach_pending_approvals()`, `outreach_decide_approval()`,
  `automation_approved_message_service()`, `outreach_approval_metrics()`.

### Painel de controlo & atividade (FASE 6)

- **`user_activity`** + RPC `activity_touch()` — a app marca "visto agora";
  alimenta `lifecycle_signals_service` (logins e last_seen reais).
- **`/backoffice/autopilot`** — liga/desliga flags (com kill switch dedicado),
  vê a fila (`automation_status`), os logs (`automation_recent_runs`) e a
  suppression list, sem tocar em SQL.
- **`autopilot_dashboard()`** — agrega outbound, inbound, ciclo de vida e fila
  numa só chamada para a UI.
- Acesso restrito a `admin`/`commercial_manager`.

### Ciclo de vida de clientes (FASE 5)

- **Estado** (`customer_lifecycle`): `stage` + `health_score` por cliente.
  Estágios: `onboarding`, `activated`, `engaged`, `at_risk`, `dormant`,
  `renewal_due`, `renewed`, `churned`, `winback`.
- **Sinais reais:** pesquisas de `usage_monthly`, última atividade de
  `saved_searches`, fim de período de `subscriptions`, checklist de onboarding.
- **Health score** determinístico (0-100) e **próxima ação** por regras
  (`nudge_onboarding`, `value_report`, `renewal_reminder`, `reactivate`,
  `check_in`). Ver `customerLifecycle.ts`.
- **Relatórios de valor** (`value_reports`) — gerados por período, enviados por
  email (dry-run não envia).
- **Onboarding** (`onboarding_tasks`) — checklist de ativação, visível pelo
  cliente (`/conta`).
- **Eventos** (`lifecycle_events`) — histórico auditável de transições.

### Inbound & IA (FASE 4)

- **Conversas** (`conversations`) agrupam respostas por contacto.
- **Mensagens** (`inbound_messages`) com dedup por `Message-ID` e correlação
  por `reply_token` (`reply+TOKEN@dominio`).
- **Classificações** (`reply_classifications`): `method` = `deterministic` |
  `ai` | `manual`, com `confidence` e `rationale`.
- **Ordem de decisão:** REGRAS primeiro (unsubscribe/bounce never IA);
  depois IA (opcional) só se as regras não decidirem, dentro do orçamento;
  fallback final = `needs_human`.
- **Loop guard:** cabeçalhos `Auto-Submitted`/`Precedence` ignoram auto-respostas.
- **Auto-reply** conservador: só acima da confiança mínima e nunca para
  unsubscribe/bounce/out-of-office/wrong_contact/needs_human.
- **Custo de IA** (`ai_usage`): tokens por dia/modelo, com
  `ai_usage_within_budget` (limite configurável).

### Outbound e campanhas (FASE 3)

- **Templates** (`email_templates`) com variáveis reais: `{company}`, `{nif}`,
  `{awards}`, `{value}`, `{cpv}`, `{participation_12m}`.
- **Campanhas** (`outreach_campaigns`) com passos (`outreach_steps`) — 1.º
  contacto + follow-ups, com `delay_days`.
- **Enrollments** (`outreach_enrollments`) — prospect inscrito numa campanha.
- **Mensagens** (`outreach_messages`) com `token` único de tracking/unsubscribe.
- **Eventos** (`email_events`): open, click, bounce, complaint, unsubscribe.
- **Rate limiting** (`outreach_counters`): limite diário total e por domínio.
- **Tracking:** `email-track` (pixel + clique validado) e `email-unsubscribe`
  (GET página + POST one-click RFC 8058).
- **Webhook Resend** (`resend-webhook`): bounces/complaints → suppression +
  estado do enrollment + transição do prospect.

### Ciclo do prospect (autopilot_state)

```
discovered → qualification_pending → qualified → enrichment_pending
  → contact_ready → outreach_queued → contacted → followup_1 → followup_2
  → replied → interested → signup → activated → paying → retained
```

Estados laterais: `not_qualified`, `no_contact`, `human_review`, `bounced`,
`unsubscribed`, `do_not_contact`, `not_interested`, `lost`.
Ver `web/src/lib/automationState.ts`.

---

## 3. Flags (app_settings)

| Chave | Default | Efeito |
|---|---|---|
| `sales_autopilot_enabled` | `false` | Liga o motor de prospeção |
| `auto_outreach_enabled` | `false` | Permite envio automático de email |
| `auto_reply_enabled` | `false` | Responde automaticamente a respostas |
| `customer_lifecycle_enabled` | `false` | Automação de ciclo de vida de clientes |
| `value_report_enabled` | `false` | Relatórios de valor |
| `autopilot_dry_run` | `true` | Executa lógica **sem enviar** |
| `autopilot_kill_switch` | `false` | **Para tudo** imediatamente |
| `autopilot_min_score` | `60` | Score mínimo para qualificar |
| `autopilot_max_sends_per_day` | `50` | Limite diário de envios |
| `autopilot_max_sends_per_domain_per_day` | `2` | Limite por domínio/dia |
| `autopilot_prospect_cooldown_days` | `30` | Cooldown entre contactos |
| `autopilot_followup_count` | `2` | Nº de follow-ups |
| `autopilot_followup_gap_days` | `4` | Intervalo entre follow-ups |
| `autopilot_ai_auto_reply` | `false` | Auto-reply por IA |
| `autopilot_ai_reply_confidence` | `80` | Confiança mínima para auto-reply |
| `autopilot_ai_enabled` | `false` | Liga classificação por IA (fallback às regras) |
| `autopilot_ai_max_calls_per_day` | `200` | Limite diário de chamadas de IA |
| `lifecycle_renewal_window_days` | `14` | Antecedência do lembrete de renovação |
| `lifecycle_dormant_days` | `30` | Dias de inatividade para "dormente" |
| `lifecycle_value_report_days` | `90` | Periodicidade-alvo dos relatórios de valor |
| `autopilot_require_approval` | `true` | Exige revisão humana antes de enviar |
| `autopilot_send_hour_start/end` | `8`/`18` | Janela de envio |
| `autopilot_send_weekdays_only` | `true` | Só dias úteis |

Geridas via `automation_set_setting(key, value)` (admin/gestor) na UI do back-office.

---

## 4. Como ativar (passo a passo)

1. **Dry-run primeiro.** Com `autopilot_dry_run = true`,
   ligar `sales_autopilot_enabled = true`.
2. Observar `automation_status()` no back-office: jobs processados, transições,
   prospects em `contact_ready`. Confirmar que nada é enviado.
3. **Ligar envio.** Quando satisfeito, `autopilot_dry_run = false` e
   `auto_outreach_enabled = true`. Começar com `autopilot_max_sends_per_day` baixo.
4. **Kill switch.** Em qualquer momento, `autopilot_kill_switch = true` para tudo.

## 5. Scheduler

Os workers `autopilot-run` (prospeção), `autopilot-outreach` (envio) e
`autopilot-lifecycle` (ciclo de vida) devem ser chamados periodicamente
(recomendado: 5 em 5 min para prospeção/envio; 1x/dia para ciclo de vida).

**Opção A — Supabase Cron (pg_cron + pg_net):** ver `20260924092000_autopilot_scheduler.sql`.
Requer os segredos no Vault.

**Opção B — GitHub Actions** (já usado pelo pipeline). Exemplo:
```yaml
- name: Run autopilot
  run: |
    curl -X POST "$SUPABASE_URL/functions/v1/autopilot-run" \
      -H "x-autopilot-secret: $AUTOPILOT_CRON_SECRET"
```

**Opção C — manual** (back-office), para testes.

Segredos necessários nas Edge Functions:
- `RADAR_SERVICE_ROLE_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`)
- `AUTOPILOT_CRON_SECRET` (protege `autopilot-run`/`autopilot-outreach`)
- `RESEND_API_KEY` (envio)
- `RESEND_FROM_EMAIL`, `SITE_URL` (remetente e links)
- `INBOUND_WEBHOOK_SECRET` (protege `inbound-email`; o `resend-webhook`
  confia na URL secreta, pois o Resend só suporta signing secret Svix)
- `OPENAI_API_KEY` (opcional; só se `autopilot_ai_enabled`)

Configurar os webhooks no painel Resend:
- **Bounces/complaints** → `.../functions/v1/resend-webhook` (só a URL secreta; sem header).
- **Inbound** → `.../functions/v1/inbound-email` (header `x-inbound-secret`), ver §7.

## 6. Compliance

- **Suppression:** antes de enviar, `is_suppressed(org, email, domain, company)`.
  Motivos: `unsubscribe`, `do_not_contact`, `bounce`, `complaint`, `manual`,
  `compliance`. Gestão em `automation_suppress(...)`.
- **Envio comercial humano:** o frontend usa `is_suppressed_session(email,
  domain, company)` (migração `20261003090000_suppression_session.sql`), que
  resolve a organização pela SESSÃO (`crm_organization_id()`) e valida role CRM
  no backend — o cliente nunca fornece o id da organização. Falha em segurança
  (em erro, assume suprimido). O worker automático continua a usar
  `is_suppressed` diretamente com o id resolvido pelo service role.
- **Unsubscribe:** cada mensagem de outbound inclui link de cancelamento
  (`email-unsubscribe`, com token). Unsubscribe → suppression + estado
  `unsubscribed` + para a sequência. Suporta one-click (RFC 8058 via POST).
- **Bounces/complaints:** o webhook Resend (`resend-webhook`) cria suppression
  automática e transita o prospect para `bounced`.
- **Tracking:** abertura (pixel) e cliques são registados em `email_events`.
- **Auditoria:** cada transição e envio gera registo (`automation_events`,
  `automation_runs`, e `admin_audit_log` via `crm_audit`).

## 7. Inbound & IA (FASE 4)

A ingestão/classificação **está implementada** na Edge Function `inbound-email`.
Falta apenas ligar a fonte de receção (parte externa):

- **(a) Webhook Resend inbound** (recomendado): aponta o endpoint para
  `.../functions/v1/inbound-email` com header `x-inbound-secret`.
  Requer um domínio (ex.: `adjudata.pt`) com receção ativa.
- **(b) Bridge IMAP**: um pequeno serviço/cron faz POST para o mesmo endpoint
  com o esquema `{from, to, subject, text, html, message_id, in_reply_to, headers}`.

O remetente deve usar `reply+TOKEN@dominio` no `Reply-To` para correlacionar
com a mensagem de outreach (o `inbound-email` extrai o token e liga ao prospect).

### Classificação

1. **Regras determinísticas** (`inboundParse.ts`, partilhado com a função):
   unsubscribe, bounce, out-of-office, wrong-contact, not-interested, preço,
   demo, trial, interesse. Nunca usa IA para compliance.
2. **IA (opcional):** se `autopilot_ai_enabled` e as regras não decidirem,
   consulta o LLM (variável `OPENAI_API_KEY`), respeitando
   `autopilot_ai_max_calls_per_day`. Registo em `ai_usage`.
3. **Fallback:** `needs_human` (vai para revisão).

## 8. Migrações

| Ficheiro | Fase |
|---|---|
| `20260924090000_autopilot_foundation.sql` | F1 — infra |
| `20260924091000_autopilot_prospects.sql` | F2 — prospects |
| `20260924092000_autopilot_scheduler.sql` | F2 — agendamento/estado |
| `20260924093000_autopilot_outreach.sql` | F3 — outbound/campanhas/tracking |
| `20260924094000_autopilot_inbound.sql` | F4 — inbound/classificação/IA |
| `20260924095000_customer_lifecycle.sql` | F5 — ciclo de vida de clientes |
| `20260924096000_autopilot_control_center.sql` | F6 — painel de controlo/atividade |
| `20260924097000_outreach_approval_queue.sql` | F7 — fila de aprovação humana |
| `20261003090000_suppression_session.sql` | Compliance — suppression segura por sessão |
| `20261004090000_suppression_session_hardening.sql` | Compliance — restringe RPC a autenticados |

> **Ativação em staging:** ver `STAGING_AUTOPILOT.md` (migrações → segredos →
> webhooks → cron → checklist de validação → rollback).
