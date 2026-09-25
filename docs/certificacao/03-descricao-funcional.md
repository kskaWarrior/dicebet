# DiceBet — 03. Descrição funcional

Parte 3 de 5 do dossiê. Compilação, não fonte. O DiceBet **não tem `CONTEXT.md` nem specs
próprias**; as regras vêm de [dicebet-gameplay-and-fairness.md](../../dicebet-gameplay-and-fairness.md),
[dicebet-overview.md](../../dicebet-overview.md), dos ADRs e do código, citados em cada
seção. Vocabulário de plataforma: [`rgs/CONTEXT.md`](../../../rgs/CONTEXT.md).

## Produto

Dados "roll-under" de quota fixa: não é um dado de seis faces, e sim um número de 0,00 a
99,99; o jogador escolhe um alvo e aposta que o resultado fica abaixo dele
([dicebet-gameplay-and-fairness.md](../../dicebet-gameplay-and-fairness.md)). Moeda
virtual de demonstração, sem dinheiro real ([README.md](../../README.md), "Aviso").

## Regras do jogo

- Alvo de 1,00 a 98,00 (passo 0,01 na API; inteiro na UI); chance de vitória = alvo %.
- Vitória se `roll < alvo`; prêmio `floor(stake · 99/alvo)` — margem fixa de 1 %
  ([02-memorial-rtp.md](02-memorial-rtp.md)).
- Resultado determinístico e verificável pelo jogador
  ([01-gerador-numeros.md](01-gerador-numeros.md)).
- A animação (odômetro, ~1,4 s) só exibe o resultado já calculado pelo servidor
  ([`index.vue`](../../apps/web/pages/index.vue),
  [`DiceOdometer.vue`](../../apps/web/components/DiceOdometer.vue)).

## Limites

Stake de 1 a 100 000 centavos por aposta, uma aposta por requisição, sem teto de prêmio
(máximo possível 9 900 000 centavos) —
[`apostas.route.ts`](../../apps/api/src/modules/aposta-dice/route/apostas.route.ts).
**Não há limites do apostador nem autoexclusão**: decisão explícita registrada em
[ADR-0002](../adr/0002-carteira-de-rgs.md), item 2.

## Fluxo de sessão e aposta

1. Demo: o jogador autentica no GoTrue da plataforma e usa o Bearer token direto nas rotas
   ([`auth.ts`](../../apps/api/src/shared/auth.ts)). Operador externo: `POST /sessions`
   troca o token de lançamento por sessão de jogo (E13); `POST /sessions/demo` não existe
   ([`sessao.route.ts`](../../apps/api/src/modules/sessao/route/sessao.route.ts)).
2. O jogo expõe o compromisso `sha256(serverSeed)` antes de qualquer aposta
   (`GET /seeds/current`).
3. A cada aposta (`POST /bets`): validação, reserva do nonce, cálculo do roll e do
   prêmio, e a saga débito → `dicebet.settle_bet` → crédito numa transação com savepoint
   ([`apostar.usecase.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/apostar.usecase.ts),
   [ADR-0002](../adr/0002-carteira-de-rgs.md)). Rodadas grátis (E9) usam
   `freeRoundId` e não debitam.
4. Na rotação (`POST /seeds/rotate`) a `serverSeed` anterior é revelada e todas as apostas
   daquele par ficam verificáveis em `/fairness`.

## Mensagens de erro

Códigos devolvidos pela API ([`apostas.route.ts`](../../apps/api/src/modules/aposta-dice/route/apostas.route.ts),
[`aposta.repository.ts`](../../apps/api/src/modules/aposta-dice/repository/aposta.repository.ts),
[`seeds.route.ts`](../../apps/api/src/modules/aposta-dice/route/seeds.route.ts)):
`INVALID_BET` (400, corpo inválido), `INVALID_STAKE` (400), `INSUFFICIENT_FUNDS` (422),
`NONCE_ALREADY_USED` (409), `UNKNOWN_FREE_ROUND` (404), `FREE_ROUND_EXPIRED`,
`FREE_ROUND_CANCELLED`, `FREE_ROUND_EXHAUSTED` (409), `FREE_ROUND_STAKE_MISMATCH` (400),
`BET_FAILED` (500), `INVALID_CLIENT_SEED` (400). `SEED_NOT_ACTIVE`
([`seed.repository.ts`](../../apps/api/src/modules/aposta-dice/repository/seed.repository.ts)) não é
mapeado e chega ao cliente como `BET_FAILED` (500). Sessão:
`INVALID_BODY`, `DEMO_REQUIRES_AUTH`, `OPERATOR_NOT_CONFIGURED` (400),
`INVALID_LAUNCH_TOKEN` (401). Autenticação (todas as rotas protegidas,
[`auth.ts`](../../apps/api/src/shared/auth.ts)): `MISSING_TOKEN`, `INVALID_TOKEN` (401). A UI traduz os
casos principais em [`useI18n.ts`](../../apps/web/composables/useI18n.ts) (en/pt/es).

## Registro auditável

Cada aposta grava `seed_id`, `nonce`, `server_seed_hash`, `client_seed`, alvo, roll e
prêmio em `dicebet.bets`, com `unique (seed_id, nonce)`
([`aposta.model.ts`](../../apps/api/src/modules/aposta-dice/domain/model/aposta.model.ts));
o dinheiro passa pelo ledger append-only `rgs.ledger` ([ADR-0002](../adr/0002-carteira-de-rgs.md));
o evento `round.settled` é emitido pela RPC
([migration 0005](../../db/migrations/0005_evento_round_settled.sql)) e o replay por
rodada é consultável pela retaguarda ([migration 0006](../../db/migrations/0006_replay_dados.sql)).
