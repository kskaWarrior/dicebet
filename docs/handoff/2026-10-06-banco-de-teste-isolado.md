# Handoff — integração num banco de teste isolado (2026-10-06)

O `test:integration` do `apps/api` rodava os migrates com `--reset` sem `DATABASE_URL`,
caindo no banco `rgs` compartilhado por todos os jogos; o reset do rgs-core dropa o schema
`rgs` inteiro (aconteceu em 2026-10-06, a partir do trucofly). Mesma correção do trucofly:

- `scripts/test-integration.mjs`: cria/usa `dicebet_teste`, seta `DATABASE_URL`/`API_DATABASE_URL`
  (role `dicebet_api`), roda os dois migrates com `--reset` nele e o vitest, repetindo a rodada
  uma vez só na queda do worker sem teste reprovado.
- `apps/api/package.json`: `test:integration` → `cd ../.. && node scripts/test-integration.mjs`.
- Fallbacks dos helpers de teste e do `vitest.integration.config.ts` apontam para `dicebet_teste`.

Verificação: suíte de integração verde; `rgs.demo_wallets` intacto (2 carteiras, sem escrita).
