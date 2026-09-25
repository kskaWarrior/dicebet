# DiceBet — 05. Índice de submissão

Pacote de certificação do DiceBet (formato GLI-19), montado pelo épico E14
([spec](../../../roletafly/docs/specs/e14-dossie-certificacao.md)). Cada peça aponta para
as fontes de onde foi compilada; as fontes continuam sendo a verdade.

## Peças do dossiê

| # | Peça | Conteúdo | Estado |
|---|---|---|---|
| 01 | [Gerador de números](01-gerador-numeros.md) | HMAC sem rótulo, 4 bytes → roll, verificador, evidência estatística; mecanismo comum no [relatório da família](../../../rgs/docs/certificacao/gerador-numeros.md) | pronto, exceto rodada estatística completa e vetores golden |
| 02 | [Memorial de RTP](02-memorial-rtp.md) | RTP fechado 99 %, truncamento, Monte Carlo de conferência | pronto; achado de RTP < 85 % em stakes mínimas |
| 03 | [Descrição funcional](03-descricao-funcional.md) | regras, limites, fluxo, erros | pronto |
| 04 | [Mapeamento normativo](04-mapeamento-normativo.md) | Portarias 722, 1.207, 1.231, 827 e Lei 14.790 → evidência | pronto, com lacunas marcadas |
| 05 | Este índice | — | — |

## Fontes primárias

- Regras e justiça: [dicebet-gameplay-and-fairness.md](../../dicebet-gameplay-and-fairness.md)
- Visão geral: [dicebet-overview.md](../../dicebet-overview.md)
- Decisões: [ADR-0001](../adr/0001-local-total-pg-direto-gotrue.md), [ADR-0002](../adr/0002-carteira-de-rgs.md)
- Código do gerador: [`fair.ts`](../../apps/api/src/shared/fair.ts); do pagamento:
  [`calcular-resultado.usecase.ts`](../../apps/api/src/modules/aposta-dice/domain/usecase/calcular-resultado.usecase.ts)
- **Ausentes neste repo**: `GAME-MATH.md`, `COMPLIANCE.md`, `CONTEXT.md`, `CLAUDE.md` e
  specs próprias — o dossiê foi derivado do código; não foram criados aqui.

## Discrepâncias entre documentação e código

- [dicebet-gameplay-and-fairness.md](../../dicebet-gameplay-and-fairness.md) cita
  `apps/api/src/dice.ts` e `apps/api/src/fair.ts`; os arquivos atuais são
  `modules/aposta-dice/domain/usecase/calcular-resultado.usecase.ts` e `shared/fair.ts`.
- O mesmo documento diz alvo "em `[1, 98]`" como slider inteiro; a API aceita passos de
  0,01 ([`apostas.route.ts`](../../apps/api/src/modules/aposta-dice/route/apostas.route.ts)).
- "1% house edge" é o teórico; o RTP efetivo depende da stake (02, "Efeito do
  truncamento").

## Pendências antes da submissão

1. Rodada completa (≥ 10⁸ bits) do Dieharder e do NIST SP 800-22 sobre `rollDigest`, com
   seed e saída anexadas à peça 01
   ([próximos passos do E14](../../../rgs/docs/handoff/2026-09-21-e14-proximos-passos.md)).
2. Decidir o tratamento de stakes de 1–6 centavos, cujo RTP fica abaixo de 85 % (peça 02).
3. Registrar o perfil de RTP do DiceBet em `rgs.game_rtp_profiles` (não encontrado).
4. Escrever `GAME-MATH.md` e `COMPLIANCE.md` (hoje inexistentes) e, se a plataforma
   exigir, jogo responsável e gate de maioridade (peça 04).
5. Fixture de vetores golden compartilhada entre `fair.ts` e `fairness.vue` (peça 01).
6. Relatório de RTP realizado com volume de homologação (peça 02) e reconferência das
   portarias no gov.br (peça 04).
7. Revisão externa por pessoa com experiência em certificação, fora do time (spec E14,
   US15).
