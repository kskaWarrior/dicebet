# DiceBet — 02. Memorial de cálculo de RTP

Parte 2 de 5 do dossiê. RTP de **forma fechada**, derivado diretamente do código de
pagamento, porque o DiceBet **não tem `GAME-MATH.md`** (ver
[05-indice-submissao.md](05-indice-submissao.md)). Fonte:
[`calcular-resultado.usecase.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/calcular-resultado.usecase.ts).

## Perfil de RTP declarado

RTP teórico **99 %** (margem da casa 1 %), único, sem calibração por operador. Perfil
`padrao-99`, registrado para o jogo e para o operador `demo` em
[`db/migrate.mjs`](../../db/migrate.mjs) (tabelas `rgs.game_rtp_profiles` e
`rgs.operator_configs`, criadas em
[`20260916000001_operadores_e_sessoes.sql`](../../../rgs/db/migrations/20260916000001_operadores_e_sessoes.sql)),
reafirmado a cada execução do migrate como nos demais jogos.

## Espaço amostral

`roll ∈ {0,00; 0,01; …; 99,99}` (10 000 valores), quase uniforme
([01-gerador-numeros.md](01-gerador-numeros.md)). O jogador escolhe `alvo ∈ [1,00; 98,00]`
em passos de 0,01 (9 701 valores; `multipleOf(0.01)` em
[`apostas.route.ts`](../../apps/api/src/modules/aposta-dice/route/apostas.route.ts)) e
ganha se `roll < alvo`. A UI só oferece alvos inteiros 1–98
([`index.vue`](../../apps/web/pages/index.vue)); a API também aceita os fracionários.

## Derivação

Com `P(ganhar) = alvo/100` e multiplicador `M = 99/alvo`:

```
EV por unidade apostada = (alvo/100) · (99/alvo) = 0,99
```

para **todo** alvo. Portanto **RTP teórico = 99 %**, acima do piso de 85 % da Portaria
SPA/MF 1.207/2024, Art. 28 ([04-mapeamento-normativo.md](04-mapeamento-normativo.md)),
**com a ressalva de truncamento abaixo**. Regra descrita em
[dicebet-gameplay-and-fairness.md](../../dicebet-gameplay-and-fairness.md), seção "The bet".

Viés do gerador: `P(roll < alvo) = ⌈alvo · 100 · 2³² / 10000⌉ / 2³²`, desvio relativo
máximo ≈ 2 · 10⁻⁸; o maior RTP exato entre todos os alvos (sem truncamento) é 0,99000002.

## Tabela de pagamento

`payout_cents = floor(stake_cents · (99 / alvo))`, zero se `roll ≥ alvo`
([`calcular-resultado.usecase.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/calcular-resultado.usecase.ts)).
Exemplos:

| Alvo | Chance | Retorno total |
|---|---|---|
| 1 | 1 % | 99× |
| 2 | 2 % | 49,5× |
| 10 | 10 % | 9,9× |
| 50 | 50 % | 1,98× |
| 90 | 90 % | 1,1× |
| 98 | 98 % | ≈ 1,0102× |

## Efeito do truncamento

Diferente da roleta, `99/alvo` em geral não é inteiro: o `floor` trunca e a perda por
aposta vencedora é de até 1 centavo. Daí, para qualquer alvo (a menos do viés de 2 · 10⁻⁸):

```
0,99 − (alvo/100) / stake_cents  ≤  RTP  ≤  0,99
```

Valores exatos, calculados com o gerador e o `floor` reais, no pior alvo (fonte da regra:
[`calcular-resultado.usecase.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/calcular-resultado.usecase.ts)):

| Stake (centavos) | RTP mínimo |
|---|---|
| **50 (mínimo aceito)** | **97,06 %** (alvo 97,06: paga 50, devolve só a stake) |
| 51 | 97,10 % (alvo 97,10) |
| 98 | 98,00 % (alvo 98,00) |
| 100 | 98,03 % (alvo 97,06) |
| 100 000 (máximo) | 98,999 % (alvo 97,80) |

**RTP no mínimo de R$ 0,50, exato.** Stake 50 no alvo 97,06: `floor(50 · 99/97,06) =
floor(50,9994…) = 50`, ou seja, a vitória só devolve a stake, e o RTP é a própria
probabilidade de vitória do gerador, `⌈9706 · 2³² / 10000⌉ / 2³² = 4 168 695 258 / 2³²
= 0,970600000117 → 97,06 %`. É o mínimo sobre **todos** os 9 701 alvos e **todas** as
stakes aceitas: conferido exaustivamente para stakes de 50 a 2 000 centavos com o gerador
e o `floor` reais, e acima disso pelo limite `RTP ≥ 0,99 − 0,98/stake ≥ 0,9895`. Fica
12,06 pp acima do piso de 85 % do Art. 28.

Até a migration [`20260925000001`](../../db/migrations/20260925000001_aposta_minima.sql) o
mínimo aceito era 1 centavo, e stakes de 1 a 6 centavos tinham RTP abaixo de 85 % em parte
dos alvos (pior caso 49,51 % com 1 centavo). A aposta mínima de 50 centavos
([`calcular-resultado.usecase.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/calcular-resultado.usecase.ts),
`MIN_STAKE_CENTS`; [ADR-0003](../adr/0003-jogo-responsavel-paridade-roletafly.md)) fecha o
achado: nenhuma stake aceita fica abaixo do piso.

O produto `stake · (99/alvo)` é calculado em ponto flutuante: quando o valor exato é
inteiro, o double às vezes fica logo abaixo e o `floor` perde 1 centavo (ex.: stake 99,
alvo 1,08 → 9 074 em vez de 9 075). O efeito está dentro do limite acima e é sempre a favor
da casa.

## Limites que afetam o retorno

Stake de 50 a 100 000 centavos por aposta, aplicado na rota
([`apostas.route.ts`](../../apps/api/src/modules/aposta-dice/route/apostas.route.ts)) e no
banco (`validate_bet`, [migration 20260925000001](../../db/migrations/20260925000001_aposta_minima.sql)).
**Não há teto de prêmio**: o maior prêmio alcançável é `floor(100 000 · 99/1) = 9 900 000`
centavos (stake máxima no alvo 1), sem efeito sobre o RTP. Os limites que o próprio
jogador define (aposta máxima, apostas e perda diárias, sessão;
[migration 20260925000002](../../db/migrations/20260925000002_jogo_responsavel.sql)) só
recusam apostas — não mudam o pagamento de nenhuma aceita, então não afetam o RTP; uma
aposta máxima do jogador reduz o prêmio alcançável dele para `stake máxima · 99`. Rodadas grátis (E9) usam a mesma fórmula
([migration 0004](../../db/migrations/0004_bonus_e_rodada_gratis.sql)).

## Verificação automatizada e Monte Carlo

Testes: [`calcular-resultado.usecase.test.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/calcular-resultado.usecase.test.ts)
(99/alvo, perda com `roll ≥ alvo`, floor a favor da casa, EV < stake),
[`stake.usecase.test.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/stake.usecase.test.ts)
(stake de 50 a 100 000, e o mesmo intervalo na SQL de `validate_bet`) e
[`fair.test.ts`](../../apps/api/src/shared/fair.test.ts) (taxa de vitória ≈ alvo %). Não
há teste do RTP exato em aritmética racional nem do limite de truncamento.

Conferência Monte Carlo na elaboração deste memorial (algoritmo idêntico ao de
[`fair.ts`](../../apps/api/src/shared/fair.ts); chave `mc-seed-e14-dicebet`, mensagens
`client:0` … `client:1999999`): alvo 50, stake 100, 2 · 10⁶ apostas → RTP 99,137 %,
IC 95 % ± 0,137 pp, compatível com o valor exato 99,00 %. É evidência complementar; o RTP
declarado vem da forma fechada.

Reprodução (Node ≥ 18, na raiz do repositório; imprime `0.99137313`):

```sh
node -e 'const {createHmac}=require("node:crypto");let w=0;const N=2e6;for(let i=0;i<N;i++){const d=createHmac("sha256","mc-seed-e14-dicebet").update(`client:${i}`).digest();const r=Math.floor(d.readUInt32BE(0)/2**32*10000)/100;if(r<50)w+=Math.floor(100*(99/50))}console.log((w/(N*100)).toFixed(8))'
```

O IC usa EP = 0,99/√(2 · 10⁶).

## RTP realizado (evidência complementar)

O RTP observado em operação é reportado pela retaguarda do operador (E11) em
`GET /relatorios/rtp`
([`relatorios.route.ts`](../../../rgs/apps/rgs-api/src/modules/relatorios/route/relatorios.route.ts)),
que lê `rgs.rtp_realizado(operatorId, game, de, ate)` sobre `rgs.ledger`/`rgs.wallet_ops` —
só o operador `demo` (o único cuja carteira vive dentro da plataforma) tem dado ali.

**Evidência em 2026-09-28 — primeiro volume real, operador `demo`.** Bots de demo
([`scripts/bots.mjs`](../../scripts/bots.mjs) — novo nesta sessão, o dicebet não tinha
sidecar de bots; assina o próprio JWT local em vez de passar por GoTrue, já que
`shared/auth.ts` só confere a assinatura HS256 do Bearer token) jogaram por ~63 min
(2026-09-28T02:21–03:24Z), alvo sorteado entre 8 valores fixos (2 a 95):

| Apostas | Jogadores | Stake | Payout | GGR | RTP observado |
|---|---|---|---|---|---|
| 2.429 | 24 | R$ 9.358,50 | R$ 9.460,04 | −R$ 101,54 | **101,0850 %** |

(`rgs.ggr_realizado`/`rgs.rtp_realizado` do operador `demo`, período acima; "24 jogadores"
porque o processo de bots foi reiniciado 2x durante o ajuste do intervalo entre apostas —
cada reinício assina um novo `sub` — não são 24 jogadores distintos de verdade.)

O RTP teórico é 99 % (uniforme em todo alvo); o observado (101,09 %) fica acima por
variância de amostra pequena, não defeito. **O que esta evidência prova é o cano ponta a
ponta** (sessão → aposta → liquidação → `rgs.ledger` → relatório da retaguarda), não uma
reprova estatística do RTP — isso já está coberto pela derivação fechada acima. Volume
maior (e por período mais longo) converge para 99 % pela lei dos grandes números, mas não é
o que este relatório se propõe a demonstrar (mesmo padrão do roletafly/plinkofly,
[`rgs/docs/handoff/2026-09-26-e14-us16-rtp-realizado-roletafly.md`](../../../rgs/docs/handoff/2026-09-26-e14-us16-rtp-realizado-roletafly.md)).

**IC 95 % esperado para N = 2.429.** Simulação Monte Carlo (20.000 repetições de 2.429
apostas, replicando a amostragem de alvo/stake de `scripts/bots.mjs` e a fórmula de
pagamento de produção) dá um intervalo de confiança de 95 % de **[86,5 %; 114,8 %]** para o
RTP observado com essa amostra — o valor medido (101,09 %) cai dentro dele. Script
versionado
[`rgs/scripts/simular-ic-rtp-realizado.mjs`](../../../rgs/scripts/simular-ic-rtp-realizado.mjs)
(`node scripts/simular-ic-rtp-realizado.mjs`, ~1 min).

**Segunda sessão (mais volume, 2026-09-28).** Seguindo o item "rodar por mais tempo" dos
próximos passos, mais uma rodada de 8 bots por ~1h, operador `demo`:

| Apostas | Stake | Payout | RTP observado |
|---|---|---|---|
| 2.205 | R$ 9.860,00 | R$ 9.717,97 | **98,5595 %** |

IC 95 % esperado para N = 2.205: [86,1 %; 115,5 %] — o observado cai dentro, e desta vez
bem mais perto do teórico (98,56 % vs 101,09 % na primeira sessão), consistente com a
convergência esperada pela lei dos grandes números.

**Terceira sessão (volume bem maior, 8h, 2026-09-30).** 8 bots por 8h completas, operador
`demo`, com monitor de saúde a cada 20 min (nenhum alerta; ver
[`rgs/docs/handoff/2026-09-30-e14-us16-terceira-sessao-dicebet-plinkofly.md`](../../../rgs/docs/handoff/2026-09-30-e14-us16-terceira-sessao-dicebet-plinkofly.md)).
Janela: apostas com `created_at > 2026-09-30 14:58:11 UTC` até 22:58 UTC.

| Apostas | Stake | Payout | RTP observado |
|---|---|---|---|
| 17.663 | R$ 62.375,00 | R$ 63.310,29 | **101,4995 %** |

IC 95 % esperado para N = 17.663: [94,0 %; 104,4 %] — o observado cai dentro. Fica acima do
teórico (99 %), como na primeira sessão, mas é a amostra ~8x maior de todas e o IC segue
cobrindo; alvos agressivos (2 %, 10 %) dão payouts de até 49,5x, então a variância por aposta
é alta e 2,5 p.p. acima está dentro do esperado. Sem indício de bug.
