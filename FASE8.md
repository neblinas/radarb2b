# FASE 8 — External Company Discovery Engine (Prospeção B2B)

Documento de arquitetura e comportamento. Explica como a Adjudata descobre e
importa **empresas externas** (que ainda não existem na base) a partir de fontes
legalmente reutilizáveis. Alinhado com `AGENTS.md` (estabilidade, dados reais,
sem soluções temporárias, compliance).

## 1. Objetivo

Permitir ao administrador descobrir empresas **que ainda não existem na
Adjudata** a partir de fontes externas, importar apenas os dados empresariais
necessários e submetê-las ao **fluxo normal** já existente:

```
Fonte externa → Descoberta → Normalização → Deduplicação →
Criação de prospect → Enriquecimento → Scoring → Elegibilidade → Autopilot
```

A descoberta externa **alimenta** o pipeline; não o substitui nem o contorna.

## 2. Âmbito desta fase (o que faz / o que não faz)

**Faz:**
- Importa empresas de ficheiros estruturados (CSV/JSON) fornecidos pelo
  administrador e de listas manuais.
- Normaliza (NIF, CAE, nome, datas, estado, dimensão, website) e deduplica
  contra o que já existe (NIF como identificador lógico; nome+localidade como
  fallback conservador).
- Exclui empresas com opt-out/suppression.
- Cria prospects **idempotentes** reutilizando `prospect_company_create`
  (deduplicação e opt-out autoritativos no backend).
- Suporta **dry-run** (pré-visualização) e **execução real**, com contadores e
  histórico auditado por organização.
- Arquitetura de providers extensível (dados abertos/API) sem alterar o motor.

**NÃO faz (deliberadamente):**
- ❌ Não faz scraping de fontes que proíbam automação.
- ❌ Não contorna CAPTCHA, autenticação, rate limiting, robots.txt ou termos.
- ❌ Não envia emails, não cria campanhas nem fala com o Autopilot.
- ❌ Não lê XLSX diretamente (o administrador exporta para CSV).
- ❌ Não inventa endpoints, URLs, NIFs ou relações CAE↔CPV.
- ❌ Não cria automação periódica (cron/scheduler) nesta fase.

### Por que não XLSX?

Ler XLSX exigiria uma dependência pesada (ex.: SheetJS) sem benefício
proporcional — o caso de uso real é exportar a lista para CSV. Decisão
documentada e alinhada com o critério de "novas dependências" do `AGENTS.md`.

## 3. Fontes e providers

| Provider | Tipo | Estado | Notas |
|---|---|---|---|
| `FileCompanyDiscoveryProvider` | `file` | Ativo | CSV/JSON fornecido pelo admin. Sem I/O de rede. |
| `ManualCompanyDiscoveryProvider` | `manual` | Ativo | Lista colada pelo admin. |
| `OpenDataCompanyDiscoveryProvider` | `open_data`/`api` | Arquitetura pronta | Inativo até um endpoint ser **configurado explicitamente**. `null` → não corre. |

Todos os providers implementam `CompanyDiscoveryProvider`. O motor **nunca**
depende de uma fonte específica. Endpoints de dados abertos são sempre
configuração explícita — nunca inventados.

## 4. Como funciona (fluxo)

1. **Fonte** — o motor pede registos ao provider (`searchCompanies`), que aplica
   filtros e limites.
2. **Normalização** — cada registo é normalizado por `normalize.ts` (lógica pura,
   sem I/O). Registos sem nome são marcados **inválidos**.
3. **Deduplicação dentro da fonte** — registos repetidos na mesma fonte são
   contados como `sourceDuplicates` (ignorados, sem erro).
4. **Avaliação** — ordem de decisão: `blocked` (opt-out) → `duplicate`
   (já existe) → `new`. Determinística e explicável (`reason`).
5. **Persistência** — `external_discovery_persist` registra a execução.
   - **dry-run:** conta e regista; cria **zero** prospects.
   - **real:** cria cada candidato novo via `prospect_company_create`
     (idempotente). Um registo inválido não interrompe os restantes.
6. **Relatório** — contadores (`found`, `existing`, `blocked`, `invalid`,
   `created`, `sourceDuplicates`, `errors`) + avaliações transparentes.

### Alinhamento da chave de deduplicação

A chave conservadora do motor (`name:<nome>|<localidade>`, em minúsculas) segue
**exatamente** a regra da coluna gerada `prospect_companies.dedup_key`
(`lower(name)|lower(localidade)`). Isto garante que a pré-visualização coincide
com a deduplicação autoritativa do backend. A autoridade final é sempre o
`prospect_company_create` no momento da inserção.

## 5. Segurança e permissões

- Descoberta/persistência restritas a **admin / commercial_manager** (validado no
  backend, não apenas na UI).
- `security definer` com `search_path = public` fixo.
- `revoke all ... from public` + `grant execute ... to authenticated`.
- RLS ativa em `external_discovery_runs` e `external_discovery_checkpoints`, por
  organização (`crm_organization_id()`).
- Cada execução gera entrada em `admin_audit_log` via `crm_audit`.

## 6. Ficheiros

- Migração: `supabase/migrations/20261006090000_external_company_discovery.sql`
- Contratos de tipos: `src/lib/companyDiscovery/types.ts`
- Parsing de ficheiros: `src/lib/companyDiscovery/fileParsing.ts`
- Normalização + dedup (puro): `src/lib/companyDiscovery/normalize.ts`
- Motor: `src/lib/companyDiscovery/engine.ts`
- Camada I/O Supabase: `src/lib/companyDiscovery/io.ts`
- Providers: `src/lib/companyDiscovery/providers/`
- Testes: `src/lib/companyDiscovery/engine.test.ts`
- Página back-office: `src/app/backoffice/prospeccao/descoberta-externa/page.tsx`
- Entrada de navegação: `src/components/BackofficeShell.tsx`

## 7. Como executar

**Back-office:** `/backoffice/prospeccao/descoberta-externa` (admin/gestor
comercial).
1. Escolher fonte (ficheiro CSV/JSON ou lista manual).
2. Definir filtros (CAE, distrito, concelho, data de constituição, ativas).
3. **Pré-visualizar** (dry-run) → rever contadores e registos classificados.
4. Desmarcar dry-run e **Importar empresas** → cria prospects idempotentes.

**Backend (RPCs):**
```sql
-- Snapshot de empresas conhecidas/bloqueadas (para dry-run).
select public.external_discovery_known_companies();

-- Histórico.
select * from public.external_discovery_runs_list(10);

-- Persistir uma execução (dry-run: p_dry_run => true).
select public.external_discovery_persist(
  p_provider  => 'file_import',
  p_dry_run   => true,
  p_filters   => '{"cae":"62","district":"Lisboa"}'::jsonb,
  p_found     => 120,
  p_existing  => 12,
  p_blocked   => 3,
  p_records   => '[]'::jsonb
);
```

## 8. Resultado com amostra pequena

Teste determinístico (`engine.test.ts` → "lote com amostra pequena") sobre 7
registos:

| Métrica | Valor |
|---|---|
| Encontradas | 7 |
| Inválidas (sem nome) | 1 |
| Duplicados na fonte | 1 |
| Já existentes | 1 |
| Bloqueadas (opt-out) | 1 |
| Novas (candidatas) | 3 |

O motor distingue com precisão duplicados internos, já existentes e opt-out —
nenhum reentra em campanhas.

## 9. Aplicação (obrigatório)

A migração **tem de ser aplicada** no Supabase antes de usar a página:
```powershell
# Via CLI (recomendado) OU colar o SQL no Editor do Supabase como project owner.
supabase db push
```

## 10. Próximos passos (fora desta fase)

- Configurar, com endpoint explícito, um provider de dados abertos real.
- Enriquecimento de websites/emails sobre os novos prospects (FASE 4).
- Agendamento de sincronização incremental (checkpoints já preparados).
- Revisão humana dos prospects criados antes de entrarem no Autopilot.
