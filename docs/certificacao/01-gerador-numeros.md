# DiceBet — 01. Gerador de números

Parte 1 de 5 do dossiê de certificação (formato GLI-19). Índice:
[05-indice-submissao.md](05-indice-submissao.md).

## Relatório compartilhado

O mecanismo comum aos cinco jogos de seed-pair (HMAC-SHA256, commit/reveal, `user_seeds`,
rotação) está descrito uma única vez no relatório da família:
[`rgs/docs/certificacao/gerador-numeros.md`](../../../rgs/docs/certificacao/gerador-numeros.md).
Este arquivo não o repete; registra só o que é próprio do DiceBet.

## Derivação específica do DiceBet

Um HMAC por aposta, **sem rótulo**: chave `serverSeed`, mensagem `${clientSeed}:${nonce}`
(`rollDigest` em [`fair.ts`](../../apps/api/src/shared/fair.ts)). Só os 4 primeiros bytes
do digest são consumidos (`computeRoll`):

```
n    = uint32 big-endian dos bytes 0..3      (0 … 2³²−1)
roll = floor(n / 2³² · 10000) / 100          (0,00 … 99,99)
```

Não há amostragem por rejeição: `2³² / 10000 = 429 496,7296` não é inteiro, então 7 296
dos 10 000 valores de `roll` têm 429 497 pré-imagens e 2 704 têm 429 496. O desvio
relativo máximo de `P(roll < alvo)` em relação a `alvo/100` é ≈ 2 · 10⁻⁸ (calculado em
aritmética inteira para os 9 701 alvos válidos; ver [02-memorial-rtp.md](02-memorial-rtp.md)).
Como `n · 10000 < 2⁴⁶` é representável exatamente num double, o `floor` não sofre erro de
ponto flutuante. Descrição em prosa:
[dicebet-gameplay-and-fairness.md](../../dicebet-gameplay-and-fairness.md), seção
"Provable fairness".

## Seeds e nonce

`serverSeed` de 32 bytes aleatórios (`randomBytes`); compromisso `sha256(serverSeed)`
exposto antes da aposta (`GET /seeds/current`); rotação revela a seed anterior
(`POST /seeds/rotate`) — [`seeds.route.ts`](../../apps/api/src/modules/aposta-dice/route/seeds.route.ts).
O nonce é reivindicado fora da transação de liquidação, para que um rollback nunca o
devolva ([`apostar.usecase.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/apostar.usecase.ts)),
e a reutilização dispara `NONCE_ALREADY_USED` na guarda de `wallet_ops` da saga:
`unique (operator, game, round_id, kind)` em `rgs.wallet_ops`, com `round_id = seed:nonce`
([`aposta.repository.ts`](../../apps/api/src/modules/aposta-dice/repository/aposta.repository.ts)).
O `unique (seed_id, nonce)` em `bets` fica como segunda barreira
([ADR-0002](../adr/0002-carteira-de-rgs.md), item 3).

## Verificabilidade pelo jogador

A página [`fairness.vue`](../../apps/web/pages/fairness.vue) recalcula o HMAC no navegador
(WebCrypto), sem chamar a API, e confere `sha256(serverSeed)` contra o compromisso.
Diferente do RoletaFly, **não há fixture de vetores golden** compartilhada entre servidor e
verificador: a fórmula está duplicada no cliente e a paridade não é provada por teste
(pendência em [05-indice-submissao.md](05-indice-submissao.md)). Os testes de servidor
([`fair.test.ts`](../../apps/api/src/shared/fair.test.ts)) cobrem determinismo, mudança
com o nonce, faixa `[0, 100)` com duas casas, compromisso e uniformidade aproximada.

## Evidência estatística

O digest cru é exportado por `rollDigest` em [`fair.ts`](../../apps/api/src/shared/fair.ts)
e amostrado pelo script único da família
[`rgs/scripts/nist-dieharder.ts`](../../../rgs/scripts/nist-dieharder.ts), que importa a
função de produção (não uma cópia). Estado em 2026-09-25: Dieharder em modo reduzido
aprovado; a rodada completa (≥ 10⁸ bits) e o NIST SP 800-22 ainda não foram executados —
ver [`rgs/docs/handoff/2026-09-21-e14-proximos-passos.md`](../../../rgs/docs/handoff/2026-09-21-e14-proximos-passos.md).
Observação ao laboratório: o script amostra o digest inteiro (32 bytes), mas o jogo consome
só os bytes 0..3.
