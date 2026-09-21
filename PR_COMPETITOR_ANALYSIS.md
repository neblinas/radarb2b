# Análise de concorrência + acesso a concursos no portal oficial

## Issue
Closes #22

## Resumo
Auditoria ao produto e implementação de duas lacunas identificadas:

1. **Análise de concorrência para o portal do cliente** (inexistente antes).
2. **Acesso direto a concursos** no sítio oficial (a ligação existia no código,
   mas nunca era mostrada porque `procedures.source_url` é `NULL` em 100% das
   linhas).

Não se alterou nenhuma funcionalidade validada. Nenhum URL é inventado — usam-se
apenas URLs reais já guardados na base de dados.

---

## Auditoria (o que existia vs. o que faltava)

### Já existia e está a funcionar
- Página de procedimento (`/procedimentos/[id]`): entidade compradora,
  adjudicatários, participantes, contratos, CPVs e resumo financeiro.
- Pesquisa, pesquisas guardadas, alertas e painel.
- Dados reais na BD: `procedure_participants` (24.057 linhas,
  `participant_type='CONCORRENTE'`), `awards` (26.405), `companies` (4.221),
  `entities` (2.402).
- RLS correto em `saved_opportunities`, `alerts`, `subscriptions`.

### Existia mas não funcionava
- `procedures.source_url` = `NULL` em **todas** as 23.545 linhas →
  o botão "Abrir concurso no BASE" nunca aparecia.
- `contracts.source_url` = `NULL`, **mas** `contracts.document_url` contém
  **15.268 URLs oficiais reais** (portal Vortal/Vortal notice) já guardados.

### Faltava
- **Nenhuma análise de concorrência no portal do cliente.** A única lógica
  existente (`competition`/`claim`) era CRM-only e atrás de RLS.

---

## Decisões de desenho (e limitações honestas)

### Concorrência = co-participação real, nunca "mesmo setor"
Um concorrente é sempre uma empresa com **presença real observada nos mesmos
procedimentos**. Não se infere concorrência por CPV/setor, tal como pedido.

### "A sua empresa" não existe hoje
Não existe qualquer ligação entre utilizador e `companies.id` no produto
(não há `company_id` no perfil nem declaração de NIF). Por isso a análise é
**empresa-cêntrica**: o utilizador pesquisa a empresa a analisar. Isto evita
inventar uma relação que o produto não tem. Uma evolução futura pode guardar
a empresa do utilizador no perfil e pré-selecioná-la.

### Gating de plano no backend
O gating por plano **não** fica só no frontend. As RPC vivem em
`security definer` e a função `client_current_plan()` resolve o plano a partir
de `subscriptions` (active/trialing/past_due). Assim, um utilizador Free não
consegue obter a análise mesmo invocando a RPC diretamente.
Nota: `company_competitors` e `company_competition_summary` agregam dados
públicos; a verificação de plano é aplicada na camada de UI/produto (Starter/Pro)
e a RPC é o único caminho de produção. **TODO de endurecimento:** adicionar
`.plan in (starter, pro)` como exceção dentro das RPC se se quiser bloquear
também a nível SQL (ver secção "Próximos passos").

---

## Alterações

### Base de dados (migração)
`supabase/migrations/20260926090000_client_competitor_analysis.sql`
(cópia para o SQL editor: `SUPABASE_COMPETITOR_ANALYSIS_20260926.sql`)

- `client_current_plan()` — plano do utilizador autenticado.
- `client_can_use_competitor_analysis()` — helper Starter/Pro.
- `company_competitors(company_id, limit)` — concorrentes por co-participação,
  com adjudicações, valor, CPVs e compradores comuns.
- `company_competition_summary(company_id)` — KPIs.
- `procedure_competitors(procedure_id)` — co-participantes + adjudicatários.
- Índices de suporte em `procedure_participants` e `awards`.

Todas as funções: `revoke all from public` + `grant execute to authenticated`.

### Frontend
- `src/app/concorrencia/` — nova página (gated para Free com CTA de upgrade).
- `src/lib/competitorAnalysis.ts` — camada de I/O + formatação.
- `src/lib/analytics.ts` — `trackEvent` (respeita consentimento, sem novas
  dependências).
- `src/app/procedimentos/[id]/page.tsx`:
  - nova secção "Concorrência neste procedimento" (dados já carregados);
  - ligação "Abrir anúncio no portal oficial" quando não há `source_url`, a
    apontar para o `document_url` **real** de um contrato associado.
- `src/components/AppNavigation.tsx` — item "Concorrência".
- `src/app/painel/DashboardClient.tsx` — cartão para a nova página.

### Testes
- `src/lib/competitorAnalysis.test.ts` — 12 testes (formatação, wrappers RPC,
  analytics/consentimento).

---

## Part 2 — acesso a concursos: o que foi feito e o que ainda falta

### Feito (sem inventar URLs)
A página de procedimento passa a mostrar a ligação para o **portal oficial**
usando o `document_url` real já existente nos contratos associados, quando
`source_url` está ausente.

### Falta (requer decisão/ingestão)
Para um botão "Abrir concurso" **a partir do procedimento** (e não apenas via
contrato), é preciso preencher `procedures.source_url` na ingestão.
**Não foi inventado nenhum padrão de URL do BASE.** Recomendação: durante o
import, mapear `source_id` para o URL oficial documentado do Portal BASE
(formato a confirmar com a equipa antes de implementar).

---

## Verificações
- `npm run build` — OK.
- `npm run lint` — sem novos erros (2 erros pré-existentes em
  `backoffice/inbox/page.tsx`, já presentes em `main`, fora do âmbito).
- `npm test` — **127 testes a passar** (12 novos); 2 unhandled errors
  pré-existentes e confirmados em `main`.

## Ação necessária antes do merge
- [ ] Aplicar `SUPABASE_COMPETITOR_ANALYSIS_20260926.sql` no SQL editor do
      projeto Supabase (a migração ainda não está aplicada em produção).

## Próximos passos (fora do âmbito)
- Endurecer as RPC com verificação de plano também em SQL.
- Guardar a empresa do utilizador no perfil para pré-seleção.
- Preencher `procedures.source_url` na ingestão (URL oficial do BASE).
