# RadarB2B — Próximos Passos

## 🔜 PRÓXIMA SESSÃO (amanhã) — Portal de Ganhos do Comercial

**Especificação completa:** ver `web/PORTAL_GANHOS_COMERCIAL.md`

Resumo do que o Tiago quer:
- O comercial vê no seu portal os **seus clientes subscritores**, os **seus ganhos**
  e os **ganhos pelos clientes referidos pela sua equipa**.
- **Regras de comissão:**
  - **Mensal (venda direta):** 100% da 1.ª mensalidade + 10% nos 5 meses seguintes
    (enquanto ativo).
  - **Anual (venda direta):** 20% da subscrição.
  - **Equipa (mensal):** 50% da 2.ª mensalidade (só se a 2.ª for paga).
  - **Equipa (anual):** 5% da subscrição.
- Análise + 9 sugestões de melhoria no documento (retention bonus, clawback,
  tetos, simulador, etc.).
- Perguntas em aberto a decidir antes de implementar (ver secção 6 do doc).

---

## Concluído

### Domínio adjudata.pt ✅ (18/09/2026)
- DNS A (raiz) + CNAME específico Vercel (www) — corrigidos
- SSL emitido e válido; https://adjudata.pt e https://www.adjudata.pt → HTTP 200

### Sincronização sem máquina ligada ✅ (18/09/2026)
- Repo: github.com/neblinas/afjudata-pipeline
- GitHub Actions semanal (segundas 03:00 UTC); tarefa local desativada
- Sync real confirmado (27 089 contratos, idempotente)

### Ramo de negócio na prospeção ✅ (Opção 1 — derivado do CPV)
- Migração `20260922090000_prospecting_category.sql`
- 8 ramos: SOFTWARE, HARDWARE, REDES, TELECOM, SERVIÇOS IT, CLOUD/DATA,
  CIBERSEGURANÇA, SUPORTE/MANUTENÇÃO IT
- Filtro na fila + ramos na ficha; 51 testes a passar; deploy feito

### Analytics — etiqueta Google ✅ (parcial)
- ID GA4: **G-EH77XFY30W**
- Componente `GoogleAnalytics.tsx` integrado no layout (só carrega **após
  consentimento de cookies de análise** — RGPD)
- Variável `NEXT_PUBLIC_GA_MEASUREMENT_ID` na Vercel (Production + Development)
- Doc: `web/ANALYTICS.md`
- ⚠️ NOTA: integrar eventos de negócio e validar no GA4 (tempo real)

---

## Pendente (menor)
- [ ] Commit & push do código (prospeção por ramo, GA, docs) para o repositório web
- [ ] Adicionar `NEXT_PUBLIC_GA_MEASUREMENT_ID` e `NEXT_PUBLIC_SITE_URL` em **Preview** na Vercel
- [ ] Validar GA a receber dados no tempo real do GA4
