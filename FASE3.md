# FASE 3 — Prospect Discovery Engine (Prospeção B2B)

Documento de arquitetura e comportamento. Explica o que o motor de descoberta
faz, que dados usa, o que **não** faz nesta fase e porquê. Alinhado com
`AGENTS.md` (estabilidade, dados reais, sem soluções temporárias).

## 1. Objetivo

Identificar automaticamente **empresas potencialmente interessantes para a
Adjudata** a partir de sinais reais de contratação pública **já existentes** no
sistema. O motor produz **candidatos auditados** (não prospects finais) para
revisão humana no back-office.

## 2. Âmbito desta fase (o que faz / o que não faz)

**Faz:**
- Gera candidatos por empresa com base em dados reais (atividade, valor,
  frequência, ramo CPV, localização, concorrência, dimensão).
- Deduplica contra os prospects existentes (`prospect_companies`) por NIF
  normalizado e por empresa do Radar.
- Exclui empresas com **opt-out** (não voltam a entrar em campanhas).
- Registra cada execução para auditoria (critérios + contadores + distribuição).
- Executa-se **manualmente** (back-office) ou via função interna segura.

**NÃO faz (deliberadamente):**
- ❌ Não faz crawling nem scraping de websites.
- ❌ Não procura emails, telefones ou websites na Internet.
- ❌ Não envia nada para o Autopilot nem contacta empresas.
- ❌ Não cria automação periódica (cron/scheduler).
- ❌ Não inventa dados nem relações (ver secção 5 — CAE↔CPV).
- ❌ Não cria prospects automaticamente sem revisão.

## 3. Fontes de dados reais

| Sinal | Fonte | Notas |
|---|---|---|
| Atividade / participações | `company_prospect_scores` (via `procedure_participants` + `procedures`) | Materialized view já existente |
| Valor adjudicado | `awards.award_value` | Agregado por empresa |
| Ramo de negócio (CPV) | `cpvs.radar_category` ↔ `contract_cpvs` → `contract_awards` → `awards` | Já usado na fila de prospeção |
| Localização relevante | `entities.district` (entidade adjudicante onde a empresa participou) | Distrito mais frequente |
| Concorrência | `procedure_participants` (co-participação real) | Nunca inferida por "mesmo setor" |
| Dimensão | derivada do `total_score` (portões) | micro/pequeno/medio/grande |

Nenhum dado é inventado. Quando um sinal não existe, o candidato é marcado como
`low_signal` e contado à parte.

## 4. Como funciona (fluxo)

1. **Universo** — empresas com atividade real em contratação pública, ordenadas
   por score e recência. A `amostra` limita quantas são analisadas.
2. **Filtros** — score mínimo, ramo (CPV), distrito, mín. oportunidades, valor
   mínimo.
3. **Enriquecimento** — distrito relevante, CAE compatível (só se houver mapa),
   contagem de concorrentes.
4. **Classificação** — cada candidato é classificado em:
   - `new` — prospect novo e acionável;
   - `duplicate` — já existe em `prospect_companies`;
   - `opt_out` — tem opt-out;
   - `low_signal` — sem motivo real.
5. **Relatório** — contadores (`companies_analyzed`, `candidates_generated`,
   `new_prospects`, `skipped_duplicates`, `skipped_opt_out`,
   `skipped_low_signal`) + distribuição de scores (`<40`, `40–59`, `60–79`, `≥80`)
   e a lista de candidatos com os respetivos **motivos**.

Cada candidato devolve `reasons[]` — os motivos reais que o justificam (setor
CPV relevante, valor relevante, frequência, CAE compatível, baixa concorrência,
dimensão). Isto garante que **nada é apresentado sem explicação**.

## 5. Correspondência CAE ↔ CPV — por que está vazia

O sistema **não possui** um mecanismo fiável de correspondência CAE↔CPV, nem
dados CAE suficientes. Para não inventar relações (violaria o princípio de
integridade), esta fase:

- cria a **arquitetura** `cae_cpv_map` (tabela + índice + RLS + RPC);
- mantém a tabela **deliberadamente vazia**;
- só permite introduzir mapeamentos via `cae_cpv_map_add`, **com fonte humana
  obrigatória** (`source` não pode ser vazio);
- no motor, o campo `cae_compatible` é **nulo** enquanto não existir mapeamento.

Assim, candidatos são identificados por CPV/ramo, valor, volume, frequência,
localização e dimensão — **nunca por CAE fabricado**.

## 6. Segurança e permissões

- Execução do motor restrita a **admin / commercial_manager** (validado no
  backend, não apenas na UI).
- Funções `security definer` com `search_path = public` fixo.
- `revoke all ... from public` + `grant execute ... to authenticated` para cada
  RPC.
- RLS ativa em todas as tabelas novas, por organização (`crm_organization_id`).
- Cada execução gera entrada em `admin_audit_log`.

## 7. Ficheiros

- Migração: `supabase/migrations/20260929090000_prospect_discovery.sql`
- Camada I/O + helpers puros: `src/lib/prospectDiscovery.ts`
- Testes: `src/lib/prospectDiscovery.test.ts`
- Página back-office: `src/app/backoffice/prospeccao/descoberta/page.tsx`
- Entrada de navegação: `src/components/BackofficeShell.tsx`

## 8. Como executar

**Back-office:** `/backoffice/prospeccao/descoberta` (admin/gestor comercial).
Define critérios → “Executar descoberta” → revê contadores, distribuição e
candidatos → abre a ficha em `/backoffice/prospeccao/[companyId]`.

**Backend (função interna):**
```sql
select public.run_prospect_discovery(
  p_min_score          => 40,
  p_radar_category     => 'SOFTWARE',
  p_district           => null,
  p_min_opportunities  => 1,
  p_min_value          => null,
  p_sample_limit       => 50
);
```
Devolve um `jsonb` com os contadores, a distribuição de scores e os candidatos.

## 9. Resultado com amostra pequena

Teste determinístico (`prospectDiscovery.test.ts` → “execução com amostra
pequena”) sobre 8 empresas com forma real:

| Métrica | Valor |
|---|---|
| Empresas analisadas | 8 |
| Prospects novos | 4 |
| Ignorados (duplicados) | 2 |
| Ignorados (opt-out) | 1 |
| Sem sinal suficiente | 1 |

Distribuição de scores: `<40`: 2 · `40–59`: 2 · `60–79`: 3 · `≥80`: 1 (total 8).

Esta amostra exercita a classificação exatamente como o backend devolve os
contadores — duplicados e opt-out nunca são reativados.

## 10. Próximos passos (fora desta fase)

- Correr o motor sobre dados reais após aplicar a migração (amostra real).
- Introduzir mapeamentos CAE↔CPV revistos com fonte (só então o CAE é usado).
- Integrar candidatos aprovados em `prospect_companies` (com revisão).
- Web discovery (websites/emails) — fase posterior, nunca nesta.
- Agendamento automático (scheduler) — fase posterior.
