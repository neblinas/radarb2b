# AGENTS.md

## Projeto
Radar B2B — plataforma SaaS de inteligência sobre contratação pública.

## Objetivo
Este ficheiro define regras obrigatórias para qualquer agente de IA que trabalhe neste repositório.

## Princípios obrigatórios
- Priorizar estabilidade, segurança e integridade do produto.
- Não introduzir soluções temporárias quando existir uma abordagem robusta e simples.
- Não alterar comportamento funcional já validado sem necessidade clara.
- Evitar dependências redundantes ou ferramentas que aumentem complexidade sem benefício proporcional.
- Preservar compatibilidade com a arquitetura atual: Next.js, Supabase, Stripe e Vercel.
- Nunca expor secrets, service role keys, webhook secrets, tokens ou credenciais.
- Toda alteração relevante deve ser feita através de Issue, branch e Pull Request.
- Não trabalhar diretamente em main, exceto correções urgentes devidamente justificadas.
- Cada PR deve referenciar a Issue correspondente através de "Closes #N" ou equivalente.
- Antes de merge, garantir que build, lint e testes aplicáveis passam.
- Toda alteração de UI deve preservar acessibilidade, responsividade e desempenho.
- Animações devem ser subtis, funcionais e respeitar prefers-reduced-motion.
- Skeletons, loading states e lazy loading devem ser usados apenas quando melhorarem a experiência.
- Evitar animações decorativas excessivas.
- Alterações de segurança, autenticação, permissões, RLS, Stripe, quotas e billing exigem validação específica.
- Back-office/admin deve ter autorização real no backend; nunca depender apenas de esconder rotas ou links.
- Novas dependências devem ser justificadas por benefício concreto.
- Ferramentas de observabilidade ou qualidade não devem duplicar funções sem necessidade.

## Fluxo de desenvolvimento
1. Criar ou identificar uma GitHub Issue.
2. Criar branch dedicada.
3. Implementar apenas o âmbito da Issue.
4. Executar build, lint e testes aplicáveis.
5. Criar Pull Request.
6. Referenciar a Issue no PR com "Closes #N".
7. Rever regressões e segurança.
8. Fazer merge apenas com verificações aprovadas.
9. O deploy para produção ocorre após merge em main.

## Padrão de branches
- feat/issue-N-descricao
- fix/issue-N-descricao
- chore/issue-N-descricao
- test/issue-N-descricao
- refactor/issue-N-descricao

## Critérios para novas ferramentas
Antes de adicionar uma nova ferramenta ou biblioteca, validar:
- Resolve um problema real?
- Evita trabalho manual ou reduz risco?
- Duplica algo já existente?
- Aumenta significativamente manutenção?
- Tem custo financeiro relevante?
- Pode afetar performance, segurança ou deploy?

## Prioridades técnicas
1. Segurança e integridade de dados.
2. Funcionamento correto do produto.
3. Testes dos fluxos críticos.
4. Observabilidade de erros.
5. Qualidade de código.
6. UX e acessibilidade.
7. Otimização e refinamento visual.

## Decisões atuais de tooling
Preferências atuais:
- Observabilidade: Sentry como primeira opção.
- Unit/integration tests: Vitest + React Testing Library.
- E2E: Playwright.
- Qualidade/lint: avaliar Biome e Knip.
- Codecov apenas quando existir cobertura de testes suficiente.
- Evitar, por agora, stacks redundantes como Sentry + Datadog + New Relic simultaneamente.
- OpenTelemetry apenas se surgir necessidade concreta de tracing independente.
- Mutation testing apenas numa fase mais madura do projeto.

## Back-office
O projeto prevê um futuro back-office administrativo/comercial.

Quando implementado, deve incluir:
- utilizadores e contas;
- planos e subscrições;
- utilização e quotas;
- oportunidades, pesquisas e alertas;
- notas internas;
- atividade recente;
- métricas de negócio;
- gestão comercial.

O acesso deve ser protegido por roles e políticas backend.

## Alterações de UI
- Manter linguagem visual B2B profissional.
- Evitar componentes visualmente ruidosos.
- Loading states devem ser claros.
- Skeletons apenas em conteúdo que realmente aguarda dados.
- Lazy loading apenas onde trouxer benefício real.
- Transições curtas e discretas.
- Respeitar prefers-reduced-motion.

## Antes de finalizar qualquer alteração
Confirmar:
- npm run build
- lint aplicável
- testes aplicáveis
- sem regressões funcionais
- sem secrets expostos
- sem permissões enfraquecidas
- sem alterações fora do âmbito da Issue

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
