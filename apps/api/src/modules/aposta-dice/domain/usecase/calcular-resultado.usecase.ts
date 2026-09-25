/**
 * Dice rules: pick a target in [1.00, 98.00] in 0.01 steps (the UI offers whole
 * numbers); you win if the roll is strictly
 * below it. Fair multiplier would be 100/target; we pay 99/target, a 1%
 * house edge.
 */

export const MIN_TARGET = 1;
export const MAX_TARGET = 98;
export const HOUSE_EDGE_NUMERATOR = 99;

/**
 * Stake por aposta, em centavos. O mínimo de 50 (R$ 0,50) existe por causa do RTP: com o
 * `floor` abaixo, uma stake de poucos centavos perde até 1 centavo por vitória, e de 1 a 6
 * centavos o pior alvo ficava abaixo do piso de 85 % da Portaria SPA/MF 1.207/2024. Com 50
 * centavos o pior caso é 97,06 % (docs/certificacao/02-memorial-rtp.md). O banco aplica o
 * mesmo intervalo em `dicebet.validate_bet` (migration 20260925000001) — é a autoridade.
 */
export const MIN_STAKE_CENTS = 50;
export const MAX_STAKE_CENTS = 100_000;

export function stakeValida(stakeCents: number): boolean {
  return Number.isInteger(stakeCents) && stakeCents >= MIN_STAKE_CENTS && stakeCents <= MAX_STAKE_CENTS;
}

export function multiplierFor(target: number): number {
  return HOUSE_EDGE_NUMERATOR / target;
}

/** Payout in cents for a winning bet (0 if the roll lost). */
export function payoutFor(stakeCents: number, target: number, roll: number): number {
  if (roll >= target) return 0;
  return Math.floor(stakeCents * multiplierFor(target));
}

export interface CalcularResultadoInput {
  stakeCents: number;
  target: number;
  roll: number;
}

export interface CalcularResultadoOutput {
  payoutCents: number;
  multiplier: number;
  win: boolean;
}

/** Fábrica no molde do restante do family (`createXUseCase`), embora sem dependências:
 *  mantém a mesma forma de chamada que `apostar.usecase.ts` usa. */
export function createCalcularResultadoUseCase() {
  return {
    execute({ stakeCents, target, roll }: CalcularResultadoInput): CalcularResultadoOutput {
      const payoutCents = payoutFor(stakeCents, target, roll);
      return { payoutCents, multiplier: multiplierFor(target), win: payoutCents > 0 };
    },
  };
}

export type CalcularResultadoUseCase = ReturnType<typeof createCalcularResultadoUseCase>;
