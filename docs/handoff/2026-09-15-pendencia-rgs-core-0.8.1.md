# Pendência — atualizar para `rgs-core` 0.8.1 (drift com o `rgs` compartilhado)

- **Data:** 2026-09-15. Anotado a partir de uma sessão no CrashFly
  (`docs/handoffs/2026-09-15-review-e-drift-rgs.md` daquele repo), que achou e corrigiu o
  mesmo problema lá e no MineFly. Este arquivo é só o registro da pendência aqui — nenhuma
  mudança de código foi feita no DiceBet nesta sessão.

## O problema

O Postgres compartilhado do repo `rgs` (usado por todos os jogos irmãos) avançou para
`rgs-core 0.8.1` (feature de bônus, E9, commits `c315468`/`e959cca` no repo `rgs`), que mudou
a ARIDADE de `rgs.demo_mover` de 5 para 6 parâmetros (ganhou `p_fund_type`). O DiceBet ainda
pinha `@kskawarrior/rgs-core: ^0.7.0` (confirmar em `apps/api/package.json`) e o grant em
`db/migrate.mjs` ainda deve listar a assinatura antiga de 5 args
(`rgs.demo_mover(uuid, text, char, bigint, text)`).

Sintoma esperado: `db/migrate.mjs` falha com `function rgs.demo_mover(uuid, text, character,
bigint, text) does not exist` ao migrar contra o Postgres compartilhado atual.

## O que fazer

Seguir o mesmo padrão aplicado no CrashFly (`2ff9def`) e no MineFly (`7e501ab`):

1. `apps/api/package.json`: `@kskawarrior/rgs-core` `^0.7.0` → `^0.8.1`.
2. `db/migrate.mjs`: grant de `rgs.demo_mover(uuid, text, char, bigint, text)` →
   `rgs.demo_mover(uuid, text, char, bigint, text, text)` (6 args).
3. `npm install --workspace apps/api` para atualizar `node_modules`/lockfile.
4. Conferir se o código que chama `carteira.debit`/`carteira.credit`
   (`apps/api/src/routes/wallet.ts`/`bets.ts` — arquitetura por rota, não um `walletSaga.ts`
   único como CrashFly/MineFly) já passa `fundType` explícito. Se sim, só o bump resolve; se
   não, é plumbing pequeno (o `rgs-core` 0.7.0 já aceitava o campo, restrito ao enum
   `["real"]`).
5. `npm run typecheck` no workspace da API.
6. Smoke test completo (`scripts/local-up.sh --demo` ou equivalente do DiceBet).

## Achado colateral (visto no MineFly, pode se repetir aqui)

Se o smoke test falhar com `INVALID_SESSION` mesmo com a migration OK: não é o drift de
`rgs-core` — é a tabela de perfil do jogo com linhas ÓRFÃS cujo `rgs.demo_wallets` foi
limpo independentemente (schemas com ciclos de vida diferentes). A função
`ensure_player`-equivalente costuma ter um early-return "perfil já existe" que pula a
criação da carteira demo se a carteira já foi apagada depois do perfil criado. Não é bug do
rollout RGS nem desta pendência — só vale saber antes de investigar do zero.
