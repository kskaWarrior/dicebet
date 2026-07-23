/**
 * Dice rules: pick a target in [1, 98]; you win if the roll is strictly
 * below it. Fair multiplier would be 100/target; we pay 99/target, a 1%
 * house edge.
 */

export const MIN_TARGET = 1;
export const MAX_TARGET = 98;
export const HOUSE_EDGE_NUMERATOR = 99;

export function multiplierFor(target: number): number {
  return HOUSE_EDGE_NUMERATOR / target;
}

/** Payout in cents for a winning bet (0 if the roll lost). */
export function payoutFor(stakeCents: number, target: number, roll: number): number {
  if (roll >= target) return 0;
  return Math.floor(stakeCents * multiplierFor(target));
}
