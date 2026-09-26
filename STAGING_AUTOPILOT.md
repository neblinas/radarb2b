# Autopilot — Guia de ativação em staging

Este documento é a sequência **exata** para pôr o Sales Autopilot a correr em
staging, em modo seguro. Não cria funcionalidades novas; garante que o que já
existe é ativado sem surpresas.

> Regra de ouro: **nada é enviado** até um humano o decidir. O sistema nasce
> desligado, em simulação, com kill switch e fila de aprovação humana.

> **Comandos prontos a copiar-colar:** ver `staging/` (`setup.sh`/`setup.ps1`,
> `cron.sql`, `flags.sql`, e `staging/README.md`).

---

## 0. Pré-requisitos

- Projeto Supabase de **staging** (não produção) ligado à CLI.
- Domínio controlado para envio (ex.: `adjudata.pt`) verificado no Resend.
- `RADAR_SERVICE_ROLE_KEY`, `RESEND_API_KEY` disponíveis como segredos.

---

## 1. Migrações (por ordem, no SQL Editor)

Aplicar **exatamente nesta ordem** (o timestamp no nome define a ordem):

| Ordem | Ficheiro | Fase |
|---|---|---|
| 1 | `20260924090000_autopilot_foundation.sql` | Infra |
| 2 | `20260924091000_autopilot_prospects.sql` | Prospects |
| 3 | `20260924092000_autopilot_scheduler.sql` | Scheduler |
| 4 | `20260924093000_autopilot_outreach.sql` | Outbound |
| 5 | `20260924094000_autopilot_inbound.sql` | Inbound |
| 6 | `20260924095000_customer_lifecycle.sql` | Ciclo de vida |
| 7 | `20260924096000_autopilot_control_center.sql` | Painel/atividade |
| 8 | `20260924097000_outreach_approval_queue.sql` | Aprovação humana |
| 9 | `20261020090000_dedup_outreach_messages.sql` | Anti-duplicação de envios |

Todas são **idempotentes** (`create ... if not exists`, `on conflict do nothing`),
podendo ser reaplicadas sem erro.

A migração 9 garante que **não há envios duplicados ao mesmo passo**: deduplica
mensagens existentes, cria a constraint única `(enrollment_id, step_position)` em
`outreach_messages` e corrige `outreach_enroll_prospect` para **não recomeçar a
sequência** (`current_step = 0`) quando reativa um enrollment já existente.

**Verificação rápida** (deve devolver `8` tabelas de autopilot):

```sql
select count(*) from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'automation_jobs','automation_runs','automation_events','email_suppressions',
    'outreach_campaigns','outreach_enrollments','outreach_messages',
    'conversations','inbound_messages','customer_lifecycle','user_activity'
  );
```

---

## 2. Segredos das Edge Functions

```text
supabase secrets set RADAR_SERVICE_ROLE_KEY=<service-role-key> --project-ref <ref-staging>
supabase secrets set RESEND_API_KEY=<resend-key> --project-ref <ref-staging>
supabase secrets set RESEND_FROM_EMAIL="Adjudata <comercial@adjudata.pt>" --project-ref <ref-staging>
supabase secrets set SITE_URL=https://staging.adjudata.pt --project-ref <ref-staging>
supabase secrets set AUTOPILOT_CRON_SECRET=<segredo-forte> --project-ref <ref-staging>
supabase secrets set RESEND_WEBHOOK_SECRET=<segredo-resend> --project-ref <ref-staging>
supabase secrets set INBOUND_WEBHOOK_SECRET=<segredo-inbound> --project-ref <ref-staging>
# Opcional (só se autopilot_ai_enabled = true):
supabase secrets set OPENAI_API_KEY=<openai-key> --project-ref <ref-staging>
```

---

## 3. Deploy das Edge Functions

```text
# Autopilot
supabase functions deploy autopilot-run        --project-ref <ref-staging>
supabase functions deploy autopilot-outreach   --project-ref <ref-staging>
supabase functions deploy autopilot-lifecycle  --project-ref <ref-staging>
supabase functions deploy inbound-email        --project-ref <ref-staging>

# Webhooks e links de email (precisam verify_jwt = false no config.toml)
supabase functions deploy resend-webhook       --project-ref <ref-staging>
supabase functions deploy stripe-webhook       --project-ref <ref-staging>
supabase functions deploy email-track          --project-ref <ref-staging>
supabase functions deploy email-unsubscribe    --project-ref <ref-staging>
```

`autopilot-run|outreach|lifecycle` são invocados por cron (com
`x-autopilot-secret`). `inbound-email` por webhook (`x-inbound-secret`).

**`verify_jwt`:** as funções invocadas sem JWT de utilizador estão declaradas
com `verify_jwt = false` em `supabase/config.toml` (cron, webhooks e links
públicos de email: `email-track`, `email-unsubscribe`, `resend-webhook`,
`stripe-webhook`). Sem esta declaração, o Supabase aplica o default `true` e a
chamada falha com **401**. As funções com JWT de utilizador mantêm o default.

> Se alterares o `supabase/config.toml`, faz **redeploy** das funções afetadas
> (`supabase functions deploy <nome>`), porque a configuração é aplicada no
> momento do deploy.

---

## 4. Webhooks (painel Resend)

- **Bounces/complaints** → `https://<ref>.functions.supabase.co/resend-webhook`
  (header `x-webhook-secret`).
- **Inbound** (opcional) → `https://<ref>.functions.supabase.co/inbound-email`
  (header `x-inbound-secret`).

---

## 5. Cron dos workers

| Worker | Frequência | Chamada |
|---|---|---|
| `autopilot-run` | 5/5 min | `POST /functions/v1/autopilot-run` |
| `autopilot-outreach` | 5/5 min | `POST /functions/v1/autopilot-outreach` |
| `autopilot-lifecycle` | 1x/dia | `POST /functions/v1/autopilot-lifecycle` |

Todos os pedidos devem incluir o header `x-autopilot-secret: <AUTOPILOT_CRON_SECRET>`.

**Script pronto:** `staging/cron.sql` (Supabase Cron via `pg_cron`+`pg_net`,
lendo os segredos do Vault). Alternativa: GitHub Actions a chamar as funções.

---

## 6. Checklist de validação (staging, tudo EM SIMULAÇÃO)

Confirmar antes de ligar qualquer envio real. Cada item produz uma prova.

- [ ] **Flags por omissão:** no painel `/backoffice/autopilot`, confirmar que
      tudo está desligado e `autopilot_dry_run = true`.
- [ ] **Kill switch:** ativar e confirmar que os workers devolvem
      `{ stopped: "kill_switch" }`; desativar depois.
- [ ] **Fila:** correr `autopilot-run` manualmente e ver jobs em `automation_jobs`
      (`queued` → `processing` → `completed`) e logs em `automation_runs`.
- [ ] **Enriquecimento sem invenção:** com os dados reais de um prospect, verificar
      que a personalização só usa factos existentes (`automation_prospect_facts`).
- [ ] **Outbound dry-run:** correr `autopilot-outreach` e confirmar mensagens com
      `status = 'skipped'` e erro `dry-run` — **nenhum** email enviado.
- [ ] **Fila de aprovação:** desligar `dry_run` mas manter
      `autopilot_require_approval = true`; correr outreach; confirmar mensagens em
      `pending_approval` e que a sequência **não** avançou.
- [ ] **Aprovação:** aprovar uma mensagem no painel; confirmar job re-enfileirado
      e (com Resend de teste) exatamente 1 email enviado.
- [ ] **Rejeição:** rejeitar outra; confirmar enrollment em `paused` e sem envio.
- [ ] **Anti-duplicação:** preparar o mesmo prospecto duas vezes
      (`prospect_prepare_autopilot_bulk` / botão "Enviar para Autopilot");
      confirmar que **não** é criada uma segunda mensagem para o mesmo passo
      (`select enrollment_id, step_position, count(*) from outreach_messages
      group by 1,2 having count(*) > 1` não devolve linhas) e que `current_step`
      do enrollment **não** volta a 0.
- [ ] **Suppression:** inscrever um email na suppression; confirmar que um
      enrollment para esse email é saltado.
- [ ] **Inbound:** POST de teste para `inbound-email` com `reply+TOKEN@…`;
      confirmar conversa/mensagem/classificação criadas e correlação correta.
- [ ] **Loop guard:** POST com header `Auto-Submitted: auto-replied`; confirmar
      que é ignorado.
- [ ] **Unsubscribe:** abrir o link de unsubscribe; confirmar suppression criada
      e enrollment `unsubscribed`.
- [ ] **Ciclo de vida:** correr `autopilot-lifecycle`; confirmar
      `customer_lifecycle` atualizado e relatórios em `value_reports`.
- [ ] **Atividade:** visitar `/conta` autenticado; confirmar linha em
      `user_activity` com `last_seen_at` recente.
- [ ] **Fluxo de valor em sintético:** confirmar o fluxo num caso **sintético
      controlado** antes de qualquer contacto a um prospect real.

---

## 7. Critérios para sair de "simulação"

Só depois de **todos** os itens acima estarem marcados:

1. Ligar `auto_outreach_enabled` mantendo `autopilot_require_approval = true`
   (continua human-in-the-loop).
2. Enviar para **um único endereço interno** e confirmar tracking/suppression.
3. Só então ponderar desligar `autopilot_require_approval` para campanhas de
   baixo risco — nunca antes de observar vários dias em modo simulação.

> Enquanto não houver processo definido para acesso/oposição/erro (ver
> `COMPLIANCE_RELEASE_CHECKLIST.md`), manter a aprovação humana **ligada**.

---

## 8. Rollback

Em qualquer momento, para parar tudo imediatamente:

```sql
update public.app_settings
set value = 'true'::jsonb
where key = 'autopilot_kill_switch';
```

Ou pelo botão vermelho em `/backoffice/autopilot`. Nenhum worker envia email
com o kill switch ativo.
