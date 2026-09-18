# CONTRIBUTING.md

## Desenvolvimento do Adjudata

Este projeto utiliza um fluxo baseado em GitHub Issues, branches e Pull Requests.

## Regra principal

Não desenvolver diretamente em main para trabalho normal.

Fluxo obrigatório:

Issue -> Branch -> Implementação -> Testes -> Pull Request -> Merge -> Deploy

## 1. Criar uma Issue

Toda correção, melhoria, refactor ou nova funcionalidade deve começar por uma GitHub Issue.

A Issue deve indicar:
- objetivo;
- problema a resolver;
- âmbito;
- critérios de aceitação;
- riscos relevantes.

## 2. Criar uma branch

Usar uma branch associada à Issue.

Exemplos:
- feat/issue-12-admin-dashboard
- fix/issue-18-alert-quota
- chore/issue-3-ci
- test/issue-21-search-e2e
- refactor/issue-25-search-service

## 3. Implementar

A alteração deve manter-se dentro do âmbito da Issue.

Evitar:
- refactors paralelos desnecessários;
- novas dependências sem justificação;
- alterações de comportamento não relacionadas;
- alterações diretas de produção.

## 4. Validar

Antes de abrir um Pull Request, executar pelo menos:

npm run build

Quando estiverem configurados, executar também:
- lint;
- testes unitários;
- testes de integração;
- testes end-to-end aplicáveis.

Fluxos críticos devem ser testados manualmente quando necessário.

## 5. Pull Request

Cada Pull Request deve:
- ter título claro;
- explicar o que mudou;
- indicar riscos relevantes;
- listar testes efetuados;
- referenciar a Issue correspondente;
- incluir "Closes #N" para fechar automaticamente a Issue após merge.

Exemplo:

Closes #12

## 6. Merge

Só fazer merge quando:
- build passa;
- testes aplicáveis passam;
- não existem regressões conhecidas;
- segurança não foi degradada;
- alterações estão dentro do âmbito da Issue;
- revisão foi concluída.

## 7. Deploy

O deploy de produção é feito a partir de main.

Alterações normais não devem ser enviadas diretamente para main.

## Segurança

Nunca incluir no repositório:
- Supabase service role keys;
- Stripe secret keys;
- webhook secrets;
- tokens pessoais;
- passwords;
- ficheiros .env com secrets.

Alterações relacionadas com:
- autenticação;
- RLS;
- permissões;
- Stripe;
- billing;
- quotas;
- roles administrativas;

devem receber validação específica antes de merge.

## UI e UX

Alterações de interface devem:
- ser responsivas;
- preservar acessibilidade;
- preservar desempenho;
- evitar animações excessivas;
- usar loading states adequados;
- usar skeletons apenas quando forem úteis;
- usar lazy loading apenas quando trouxer benefício real;
- respeitar prefers-reduced-motion;
- manter uma linguagem visual profissional B2B.

## Dependências

Novas dependências devem ter benefício claro.

Antes de adicionar uma dependência, avaliar:
- se resolve um problema real;
- se duplica uma ferramenta existente;
- impacto em manutenção;
- impacto no bundle;
- impacto no desempenho;
- impacto na segurança;
- custo financeiro.

## Back-office

Funcionalidades administrativas devem:
- utilizar autorização real no backend;
- utilizar roles explícitas;
- não depender apenas de esconder rotas ou links;
- respeitar RLS e políticas de segurança do Supabase;
- manter ações administrativas auditáveis sempre que fizer sentido.

## Observabilidade

Direção atual:
- Sentry como primeira solução de observabilidade;
- não instalar simultaneamente várias plataformas redundantes sem necessidade;
- OpenTelemetry apenas se surgir uma necessidade concreta de tracing independente.

## Testes

Direção atual:
- Vitest para testes unitários;
- React Testing Library para componentes e integração;
- Playwright para testes end-to-end;
- Codecov apenas depois de existir cobertura real suficiente para a métrica ser útil.

## Qualidade de código

Direção atual:
- avaliar Biome para lint e formatting;
- avaliar Knip para dependências, ficheiros e exports não utilizados;
- evitar tooling redundante;
- mutation testing apenas numa fase mais madura do produto.

## Regra final

Estabilidade, segurança e integridade do Adjudata têm prioridade sobre velocidade de implementação ou adoção de novas ferramentas.
