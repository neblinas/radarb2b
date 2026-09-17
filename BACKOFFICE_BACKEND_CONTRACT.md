# Contrato backend do CRM

O back-office já tem navegação e vistas protegidas por `auth.users.raw_app_meta_data.role`. As operações comerciais não devem ser implementadas diretamente no browser com service role.

## Roles

- `admin`: acesso total a operações comerciais e configuração de colaboradores; sem alterar código/deploy.
- `commercial_manager`: gerir clientes, oportunidades e colaboradores comerciais dentro da organização.
- `commercial`: consultar clientes autorizados e gerir oportunidades atribuídas; sem planos, preços, roles ou configuração.

## Tabelas recomendadas

- `organizations`: id, legal_name, nif, status, created_at.
- `organization_members`: organization_id, user_id, role, status, invited_by, created_at.
- `company_verifications`: organization_id, legal_name, nif, method, status, evidence_url, reviewed_by, reviewed_at.
- `verified_domains`: organization_id, domain, method, status, token_hash, verified_by, expires_at.
- `commercial_opportunities`: organization_id, customer_id, procedure_id, owner_id, stage, priority, next_action_at, value_estimate, notes.
- `commercial_notes`: organization_id, customer_id, author_id, body, created_at, updated_at.
- `admin_audit_log`: organization_id, actor_id, action, entity_type, entity_id, metadata, created_at.

## RPCs / Edge Functions

- `invite_commercial_member`: apenas admin/manager; cria convite limitado e auditado.
- `set_member_role`: apenas admin; nunca aceitar role do cliente sem validação.
- `create_company_verification`: cria pedido pendente.
- `review_company_verification`: aprova/rejeita com evidência e actor.
- `create_opportunity`, `update_opportunity_stage`, `assign_opportunity`.
- `add_commercial_note`.
- `list_customer_accounts`: só devolver campos mínimos e autorizados.
- `get_crm_metrics`: devolver métricas agregadas por organização.

Todas as funções devem validar a sessão no servidor, role, organização, quotas de operação e idempotência. Toda escrita deve criar `admin_audit_log`.

## Prospeção comercial e comissões

- `sales_prospects`, `sales_prospect_score_components`, `sales_activities`, `sales_assignment_history`: funil de prospeção por organização, com atribuição a um comercial.
- `company_public_profiles`, `company_public_contacts`: website confirmado manualmente e contactos institucionais extraídos apenas de páginas públicas (Edge Function `discover-company-contacts`, com guarda SSRF e respeito por `robots.txt`).
- `company_prospect_scores` (materialized view): score explicável 0–100 calculado a partir de atividade real em contratação pública. Atualizar via `refresh_company_prospect_scores()`.
- RPCs: `prospect_queue`, `prospect_snapshot`, `prospect_score_components`, `prospect_claim`, `prospect_release`, `prospect_add_activity`, `prospect_confirm_website`, `prospect_metrics`.
- `commercial_commission_ledger` + `commercial_commission_summary`: valores de assinaturas diretas e de equipa atribuídos por beneficiário.

## Bloqueios atuais

Sem estas tabelas/RPCs no Supabase, as vistas mostram estados explícitos e não inventam atividade, notas, convites ou oportunidades. Preços, Stripe, roles e permissões nunca devem ser alterados diretamente pelo cliente.
