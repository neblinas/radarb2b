#!/usr/bin/env bash
# Autopilot — segredos + deploy das Edge Functions (staging).
# Correr de dentro de web/.  Preenche os valores < > primeiro.
set -euo pipefail

PROJECT_REF="swelyfjlnvpxgahchpxc"   # confirma que é o projeto de STAGING

# ---------------------------------------------------------------------------
# 1. Segredos (substitui os valores entre < >)
# ---------------------------------------------------------------------------
supabase secrets set RADAR_SERVICE_ROLE_KEY="<service-role-key>"   --project-ref "$PROJECT_REF"
supabase secrets set RESEND_API_KEY="<resend-api-key>"             --project-ref "$PROJECT_REF"
supabase secrets set RESEND_FROM_EMAIL="Adjudata <comercial@adjudata.pt>" --project-ref "$PROJECT_REF"
supabase secrets set SITE_URL="https://staging.adjudata.pt"        --project-ref "$PROJECT_REF"
supabase secrets set AUTOPILOT_CRON_SECRET="<segredo-forte-1>"     --project-ref "$PROJECT_REF"
supabase secrets set RESEND_WEBHOOK_SECRET="<segredo-resend>"      --project-ref "$PROJECT_REF"
supabase secrets set INBOUND_WEBHOOK_SECRET="<segredo-inbound>"    --project-ref "$PROJECT_REF"
# Opcional (só se autopilot_ai_enabled = true):
# supabase secrets set OPENAI_API_KEY="<openai-key>"              --project-ref "$PROJECT_REF"

# ---------------------------------------------------------------------------
# 2. Deploy das Edge Functions
# ---------------------------------------------------------------------------
# Autopilot (cron)
supabase functions deploy autopilot-run        --project-ref "$PROJECT_REF"
supabase functions deploy autopilot-outreach   --project-ref "$PROJECT_REF"
supabase functions deploy autopilot-lifecycle  --project-ref "$PROJECT_REF"
supabase functions deploy inbound-email        --project-ref "$PROJECT_REF"

# Webhooks e links de email (precisam verify_jwt=false no config.toml)
supabase functions deploy resend-webhook       --project-ref "$PROJECT_REF"
supabase functions deploy stripe-webhook       --project-ref "$PROJECT_REF"
supabase functions deploy email-track          --project-ref "$PROJECT_REF"
supabase functions deploy email-unsubscribe    --project-ref "$PROJECT_REF"

echo "OK — segredos e funções configurados. Falta: cron.sql, webhooks no painel e migrações."
