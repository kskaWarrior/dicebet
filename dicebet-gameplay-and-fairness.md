# DiceBet — Gameplay & Fairness Mechanics

This is a **roll-under** dice game, not a physical six-sided die: the "roll" is a number between 0 and 100, and you win by picking a target and betting that the roll lands below it.

## The bet

1. Player picks a **target** `T` in `[1, 98]` — this doubles as their implied win chance (`T`%).
2. Player picks a **stake**.
3. Server generates a **roll** `R` in `[0, 100)`, two decimals.
4. **Win** if `R < T`. Payout is `stake × (99 / T)`.

Source: [`apps/api/src/dice.ts`](apps/api/src/dice.ts)

```ts
export const MIN_TARGET = 1;
export const MAX_TARGET = 98;
export const HOUSE_EDGE_NUMERATOR = 99;

export function multiplierFor(target: number): number {
  return HOUSE_EDGE_NUMERATOR / target;
}
```

A fair multiplier would be `100 / T` (win chance `T%` → payout `100/T`x). Paying `99 / T` instead bakes in a flat **1% house edge** regardless of the target chosen — low-target/high-multiplier "moonshot" bets and high-target/low-multiplier "safe" bets are taxed equally.

| Target (win chance) | Multiplier | $1 stake pays |
|---|---|---|
| 2 | 49.5000x | $49.50 |
| 10 | 9.9000x | $9.90 |
| 50 | 1.9800x | $1.98 |
| 90 | 1.1000x | $1.10 |
| 98 | 1.0102x | $1.01 |

## Provable fairness

Source: [`apps/api/src/fair.ts`](apps/api/src/fair.ts)

- Before any bet, the server commits to `sha256(serverSeed)` — published to the player up front.
- Each roll is deterministic: `HMAC-SHA256(serverSeed, "${clientSeed}:${nonce}")`, and the first 4 bytes of that digest map to a roll in `[0, 100)`.
- Nonce increments per bet, so no roll can be replayed or predicted ahead of time.
- When the player rotates seeds, the *old* `serverSeed` is revealed. Since the hash was published beforehand, anyone can now recompute every past roll and confirm the server didn't change it after the fact.
- The `/fairness` page ([`apps/web/pages/fairness.vue`](apps/web/pages/fairness.vue)) reruns this HMAC entirely client-side via Web Crypto — verification never has to trust the server.

## Current UI treatment

Source: [`apps/web/pages/index.vue`](apps/web/pages/index.vue)

- A slider sets the target (1–98), a number input sets the stake.
- On roll: a ~1.4s "suspense" window plays a shake sound and ticks a random number in the result area (a static 🎲 emoji today), then reveals the real roll and win/lose state.
- Sound is fully synthesized with Web Audio ([`apps/web/composables/useDiceAudio.ts`](apps/web/composables/useDiceAudio.ts)) — clustered noise-burst "ice hits" during the shake, a low knock on the throw, a two-note chime on a win, a low thud on a loss. No audio assets to load.
- `prefers-reduced-motion` skips the shake animation and ticker entirely, jumping straight to the result.

## Where a visual dice fits

The emoji + ticking number works but doesn't sell the "shake and throw" premise the audio already promises. Because the roll is a **continuous 0–100 value**, not a 1–6 face, the visual needs a different metaphor than a literal cube — options worth weighing next:
- An animated gauge/arc (0–100) with a needle or fill that settles on the roll, target line overlaid so win/lose is visually obvious.
- A tumbling die-shaped object whose face displays the ticking/final number, keeping the 🎲 spirit but replacing the static emoji with real motion matched to `playShake`'s timing.
- A horizontal number strip/odometer that scrolls to the final roll, with a marker for the target threshold.
