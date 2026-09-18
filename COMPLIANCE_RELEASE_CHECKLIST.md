# Adjudata - checklist de publicação

Este checklist acompanha a implementação técnica. Não substitui revisão jurídica, contrato de subcontratação, registo de atividades ou validação de segurança.

## Identidade e domínios

- [x] Confirmar entidade legal, NIF e morada (ENI: Tiago Manuel Ferreira Dias, NIF 222184680).
- [ ] Definir emails profissionais e preencher `NEXT_PUBLIC_PRIVACY_EMAIL` e `NEXT_PUBLIC_SUPPORT_EMAIL` nos ambientes Vercel. Opcional: `NEXT_PUBLIC_DISPUTE_EMAIL`, `NEXT_PUBLIC_DPO_CONTACT`, `NEXT_PUBLIC_LEGAL_REGISTRY`.
- [x] Preencher `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `NEXT_PUBLIC_LEGAL_ENTITY_NIF` e `NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS` (em `.env.local` e a replicar nos ambientes Vercel). Opcional: `NEXT_PUBLIC_LEGAL_FORM` (por omissão: "Empresário em nome individual").
- [ ] Confirmar domínio principal e redirecionamentos HTTPS no Vercel.
- [ ] Confirmar DNS SPF, DKIM e DMARC para emails transacionais.
- [ ] Preencher `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` e `NEXT_PUBLIC_BING_SITE_VERIFICATION`, se usados.
- [ ] Confirmar que o nome comercial e o domínio não infringem marca ou direitos de terceiros.
- [x] Publicar página de identificação do operador (`/informacao-legal`) nos termos do art. 10.º do DL 7/2004.

## RGPD e cookies

- [ ] Identificar o responsável pelo tratamento e, se aplicável, o encarregado de proteção de dados.
- [x] Documentar finalidades, bases legais, prazos de conservação e destinatários na Política de privacidade.
- [x] Listar subcontratantes (Supabase, Vercel, Sentry, Stripe) e informação sobre transferências internacionais.
- [ ] Formalizar contratos de subcontratação (DPA) com Supabase, Vercel, Sentry, Stripe e outros subcontratantes.
- [ ] Avaliar transferências internacionais e garantias aplicáveis.
- [x] Garantir que categorias de análise/marketing só carregam após consentimento, com consentimento reintroduzível a partir do rodapé ("Gerir cookies").
- [ ] Definir processo para acesso, retificação, apagamento, oposição, limitação e portabilidade.
- [ ] Definir processo de resposta a incidentes e violações de dados.
- [ ] Rever os Termos de utilização, Privacidade e Cookies com assessoria jurídica.

## Back-office comercial

- [ ] Aplicar as migrações por ordem no SQL Editor: `SUPABASE_CRM_MIGRATION.sql`, `SUPABASE_COMMERCIAL_GROWTH_MIGRATION.sql`, `SUPABASE_PROSPECTING_MIGRATION.sql`, `SUPABASE_PROSPECTING_PATCH_20260917.sql`, `SUPABASE_PROSPECTING_DASHBOARD_20260918.sql`.
- [ ] Agendar `refresh_company_prospect_scores()` (após importações ou diariamente) para manter os scores de prospeção atualizados.
- [ ] Criar tabelas `organizations`, `commercial_members`, `company_verifications`, `verified_domains` e `admin_audit_log`.
- [ ] Criar RPCs para convites, verificação, suspensão, notas e auditoria.
- [ ] Aplicar RLS por organização e role; nunca confiar apenas no cliente.
- [ ] Definir roles `admin`, `commercial_manager` e `commercial` no `app_metadata` através de operação segura.
- [ ] Validar convites, recuperação de conta, revogação de acesso e logs de auditoria.
- [ ] Confirmar que colaboradores só veem contas e oportunidades autorizadas.

## Pós-publicação

- [ ] Validar produção com conta Free e contas pagas de teste.
- [ ] Confirmar pesquisa, quotas, alertas, oportunidades e portal de faturação.
- [ ] Verificar `robots.txt`, `sitemap.xml`, canonical e metatags.
- [ ] Testar mobile, teclado, leitor de ecrã, contraste e `prefers-reduced-motion`.
- [ ] Guardar URL, commit, resultados CI e evidência de aprovação.

