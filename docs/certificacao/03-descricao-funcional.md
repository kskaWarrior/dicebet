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

Stake de **50 a 100 000 centavos** (R$ 0,50 a R$ 1 000,00) por aposta, uma aposta por
requisição, sem teto de prêmio (máximo possível 9 900 000 centavos) —
[`apostas.route.ts`](../../apps/api/src/modules/aposta-dice/route/apostas.route.ts) e
`validate_bet` ([migration 20260925000001](../../db/migrations/20260925000001_aposta_minima.sql)).

Jogo responsável ([ADR-0003](../adr/0003-jogo-responsavel-paridade-roletafly.md), que
substitui o item 2 do ADR-0002; [migration 20260925000002](../../db/migrations/20260925000002_jogo_responsavel.sql)),
aplicado dentro de `settle_bet`, com a saga estornando o débito de uma aposta recusada:

- **Limites do apostador**: aposta máxima, apostas diárias e perda diária (janela móvel de
  24h; a perda conta a aposta corrente como perdida) e limite de sessão contínua (nova
  sessão depois de 30 min sem apostar). `null` = sem limite; zero é recusado. Página
  [`limits.vue`](../../apps/web/pages/limits.vue).
- **Carência ao afrouxar**: apertar vale na hora; afrouxar qualquer limite (inclusive
  removê-lo) só é aceito 24h depois do último afrouxamento, de forma global; a tela avisa
  a data antes da tentativa.
- **Autoexclusão**: 30, 90, 180 ou 365 dias, com a palavra `AUTOEXCLUIR` digitada;
  enquanto vigora não pode ser encurtada, só estendida
  ([`responsible-gaming.vue`](../../apps/web/pages/responsible-gaming.vue)).
- **Gate 18+** na casca do web ([`app.vue`](../../apps/web/app.vue)), em todas as páginas
  exceto `/login` e `/responsible-gaming`
  ([`rotas-sem-gate-maioridade.ts`](../../apps/web/shared/rotas-sem-gate-maioridade.ts));
  a declaração é gravada na conta (`profiles.age_attested_at`).
- **Relógio de sessão** no menu, com destaque a partir de 80 % do limite.

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
`SELF_EXCLUDED`, `LIMIT_EXCEEDED`, `SESSION_LIMIT` (403, jogo responsável),
`BET_FAILED` (500), `INVALID_CLIENT_SEED` (400). Jogo responsável
([`jogo-responsavel.route.ts`](../../apps/api/src/modules/jogo-responsavel/route/jogo-responsavel.route.ts)):
`LOOSENING_TOO_SOON`, `SHORTENING_SELF_EXCLUSION` (409), `INVALID_PERIOD`,
`INVALID_LIMIT`, `INVALID_BODY` (400). `SEED_NOT_ACTIVE`
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
Mudanças de limite (dizendo se afrouxaram), autoexclusões e atestações de idade ficam na
trilha interna `dicebet.audit_events`
([migration 20260925000002](../../db/migrations/20260925000002_jogo_responsavel.sql)).
