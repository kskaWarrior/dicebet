# DiceBet — 04. Mapeamento normativo

Parte 4 de 5 do dossiê. O DiceBet **não tem `COMPLIANCE.md`**: esta tabela foi montada
diretamente do código e dos ADRs, e não substitui o rastreio que os jogos irmãos mantêm
desde o desenvolvimento (ver [05-indice-submissao.md](05-indice-submissao.md)). Onde não
há evidência, a célula diz **ausente**.

> As Portarias SPA/MF evoluem: reconferir no gov.br antes da submissão
> ([spec E14](../../../roletafly/docs/specs/e14-dossie-certificacao.md)).

## Portaria SPA/MF 722/2024 — requisitos técnicos

| Requisito | Evidência |
|---|---|
| RNG auditável | [01-gerador-numeros.md](01-gerador-numeros.md); [`fair.ts`](../../apps/api/src/shared/fair.ts) e [`fair.test.ts`](../../apps/api/src/shared/fair.test.ts) |
| Regras em português | locale `pt` em [`useI18n.ts`](../../apps/web/composables/useI18n.ts); idioma padrão é `en`; sem teste de paridade de chaves |
| Registro auditável | `dicebet.bets` + `rgs.ledger` ([ADR-0002](../adr/0002-carteira-de-rgs.md)); evento `round.settled` ([migration 0005](../../db/migrations/0005_evento_round_settled.sql)) |

## Portaria SPA/MF 1.207/2024 — regras dos jogos e RTP

| Requisito | Evidência |
|---|---|
| RTP ≥ 85 % (Art. 28) | RTP teórico 99 % ([02-memorial-rtp.md](02-memorial-rtp.md)); **stakes de 1–6 centavos ficam abaixo de 85 %** por truncamento ([02-memorial-rtp.md](02-memorial-rtp.md), "Efeito do truncamento") |
| RTP divulgado | a UI mostra "1% house edge" ([`useI18n.ts`](../../apps/web/composables/useI18n.ts), `game.rollUnder`), não o RTP em si |

## Portaria SPA/MF 1.231/2024 — jogo responsável

| Requisito | Evidência |
|---|---|
| Limites do apostador | **ausente** — decisão registrada em [ADR-0002](../adr/0002-carteira-de-rgs.md), item 2 |
| Autoexclusão | **ausente** — idem |
| Relógio/avisos de sessão | não encontrado em [`index.vue`](../../apps/web/pages/index.vue) |

## Lei 14.790/2023 e Portaria 827/2024

| Requisito | Evidência |
|---|---|
| Proibição a menores | **ausente** — não há gate de maioridade em [`login.vue`](../../apps/web/pages/login.vue) |
| KYC/CPF | ausente; demo sem dinheiro real ([README.md](../../README.md), "Aviso") |

## Lacunas conhecidas

Tudo que está marcado **ausente** acima, mais o que falta a qualquer operador licenciado
(PIX, KYC, SIGAP, PLD/FT, cadastro nacional de autoexcluídos). O dossiê documenta o sistema
como ele é; corrigir é item novo, não retrabalho deste épico
([spec E14](../../../roletafly/docs/specs/e14-dossie-certificacao.md), "Out of Scope").
