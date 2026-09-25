# DiceBet — 05. Índice de submissão

Pacote de certificação do DiceBet (formato GLI-19), montado pelo épico E14
([spec](../../../roletafly/docs/specs/e14-dossie-certificacao.md)). Cada peça aponta para
as fontes de onde foi compilada; as fontes continuam sendo a verdade.

## Peças do dossiê

| # | Peça | Conteúdo | Estado |
|---|---|---|---|
| 01 | [Gerador de números](01-gerador-numeros.md) | HMAC sem rótulo, 4 bytes → roll, verificador, evidência estatística; mecanismo comum no [relatório da família](../../../rgs/docs/certificacao/gerador-numeros.md) | pronto, exceto rodada estatística completa e vetores golden |
| 02 | [Memorial de RTP](02-memorial-rtp.md) | RTP fechado 99 %, truncamento (pior caso 97,06 % na aposta mínima de R$ 0,50), Monte Carlo de conferência | pronto |
| 03 | [Descrição funcional](03-descricao-funcional.md) | regras, limites de stake, jogo responsável, fluxo, erros | pronto |
| 04 | [Mapeamento normativo](04-mapeamento-normativo.md) | Portarias 722, 1.207, 1.231, 827 e Lei 14.790 → evidência | pronto; lacunas restantes marcadas (KYC, idioma padrão) |
| 05 | Este índice | — | — |

## Fontes primárias

- Regras e justiça: [dicebet-gameplay-and-fairness.md](../../dicebet-gameplay-and-fairness.md)
- Visão geral: [dicebet-overview.md](../../dicebet-overview.md)
- Decisões: [ADR-0001](../adr/0001-local-total-pg-direto-gotrue.md), [ADR-0002](../adr/0002-carteira-de-rgs.md),
  [ADR-0003](../adr/0003-jogo-responsavel-paridade-roletafly.md) (jogo responsável e aposta mínima)
- Código do gerador: [`fair.ts`](../../apps/api/src/shared/fair.ts); do pagamento:
  [`calcular-resultado.usecase.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/calcular-resultado.usecase.ts)
- **Ausentes neste repo**: `GAME-MATH.md`, `COMPLIANCE.md`, `CONTEXT.md`, `CLAUDE.md` e
  specs próprias — o dossiê foi derivado do código; não foram criados aqui.

## Discrepâncias entre documentação e código

Corrigidas em [dicebet-gameplay-and-fairness.md](../../dicebet-gameplay-and-fairness.md)
(branch `rtp-perfil`):

- ~~cita `apps/api/src/dice.ts` e `apps/api/src/fair.ts`~~ — corrigido: agora aponta para
  `modules/aposta-dice/domain/usecase/calcular-resultado.usecase.ts` e `shared/fair.ts`.
- ~~alvo "em `[1, 98]`" como slider inteiro~~ — corrigido: o documento diz que a API aceita
  1,00–98,00 em passos de 0,01
  ([`apostas.route.ts`](../../apps/api/src/modules/aposta-dice/route/apostas.route.ts)) e que
  a UI oferece só inteiros.
- ~~"1% house edge" sem ressalva~~ — corrigido: o documento registra que é o teórico e que o
  RTP na aposta mínima de R$ 0,50 é ≥ 97,06 % por causa do truncamento em centavos (02,
  "Efeito do truncamento").

## Pendências antes da submissão

1. Rodada completa (≥ 10⁸ bits) do Dieharder e do NIST SP 800-22 sobre `rollDigest`, com
   seed e saída anexadas à peça 01
   ([próximos passos do E14](../../../rgs/docs/handoff/2026-09-21-e14-proximos-passos.md)).
2. Escrever `GAME-MATH.md` e `COMPLIANCE.md` (hoje inexistentes).
3. Fixture de vetores golden compartilhada entre `fair.ts` e `fairness.vue` (peça 01).
4. Relatório de RTP realizado com volume de homologação (peça 02) e reconferência das
   portarias no gov.br (peça 04).
5. Conferir nos operadores reais (não só no de demonstração) que nenhuma campanha de
   rodada grátis ativa tem stake abaixo de 50 centavos: desde a
   [migration 20260925000001](../../db/migrations/20260925000001_aposta_minima.sql) ela
   seria recusada com `INVALID_STAKE`.
6. Revisão externa por pessoa com experiência em certificação, fora do time (spec E14,
   US15).

Resolvidos pelo [ADR-0003](../adr/0003-jogo-responsavel-paridade-roletafly.md): RTP abaixo
de 85 % em stakes de 1–6 centavos (aposta mínima de R$ 0,50, peça 02) e jogo responsável +
gate de maioridade (peça 04).
