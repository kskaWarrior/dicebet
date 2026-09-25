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
| RTP ≥ 85 % (Art. 28) | RTP teórico 99 %; pior caso **97,06 %** na aposta mínima de R$ 0,50 (alvo 97,06), em qualquer alvo e stake aceitos ([02-memorial-rtp.md](02-memorial-rtp.md), "Efeito do truncamento"; [migration 20260925000001](../../db/migrations/20260925000001_aposta_minima.sql)) |
| RTP divulgado | a UI mostra "1% house edge" ([`useI18n.ts`](../../apps/web/composables/useI18n.ts), `game.rollUnder`), não o RTP em si |

## Portaria SPA/MF 1.231/2024 — jogo responsável

| Requisito | Evidência |
|---|---|
| Limites do apostador | `dicebet.player_limits` aplicado em `settle_bet`: aposta máxima, apostas e perda diárias, limite de sessão (gap de 30 min); apertar vale na hora, afrouxar tem carência global de 24h (`LOOSENING_TOO_SOON`) — [migration 20260925000002](../../db/migrations/20260925000002_jogo_responsavel.sql), [ADR-0003](../adr/0003-jogo-responsavel-paridade-roletafly.md), [`limits.vue`](../../apps/web/pages/limits.vue) |
| Autoexclusão | 30/90/180/365 dias, confirmação digitada, `SELF_EXCLUDED` em toda aposta; não encurta enquanto vigora (`SHORTENING_SELF_EXCLUSION`) — [`responsible-gaming.vue`](../../apps/web/pages/responsible-gaming.vue), mesma migration |
| Relógio/avisos de sessão | relógio no menu com destaque a partir de 80 % do limite ([`app.vue`](../../apps/web/app.vue)); rodapé "18+" e página de ajuda com o CVV (188) |

## Lei 14.790/2023 e Portaria 827/2024

| Requisito | Evidência |
|---|---|
| Proibição a menores | gate 18+ na casca ([`app.vue`](../../apps/web/app.vue)) cobrindo todas as páginas exceto `/login` e `/responsible-gaming` ([`rotas-sem-gate-maioridade.ts`](../../apps/web/shared/rotas-sem-gate-maioridade.ts), com [teste](../../apps/web/tests/gate-maioridade-cobre-tudo.test.ts)); atestação gravada no servidor (`profiles.age_attested_at`). Não é exigida pela RPC de aposta (paridade com o roletafly) |
| KYC/CPF | ausente; demo sem dinheiro real ([README.md](../../README.md), "Aviso") |

## Lacunas conhecidas

Tudo que está marcado **ausente** acima, mais o que falta a qualquer operador licenciado
(PIX, KYC, SIGAP, PLD/FT, cadastro nacional de autoexcluídos). Como no roletafly, a
autoexclusão é local ao jogo e vai até 365 dias (sem opção permanente). O dossiê documenta o sistema
como ele é; corrigir é item novo, não retrabalho deste épico
([spec E14](../../../roletafly/docs/specs/e14-dossie-certificacao.md), "Out of Scope").
