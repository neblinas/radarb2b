# Scripts de arranque — Autopilot (staging)

Comandos prontos a copiar-colar. **Preenche os valores entre `< >` antes de
executar.** Nada aqui liga envio real — o sistema arranca em simulação.

- `setup.sh` / `setup.ps1` — segredos + deploy das Edge Functions
- `cron.sql` — agendamento dos 3 workers (pg_cron) + verificação
- `flags.sql` — inspeção/alteração das flags do autopilot

> Requer a [Supabase CLI](https://supabase.com/docs/guides/cli) instalada e
> autenticada (`supabase login`), a correr de dentro de `web/`.
