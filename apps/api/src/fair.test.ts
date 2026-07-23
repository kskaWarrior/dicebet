import { describe, expect, it } from "vitest";
import { computeRoll, generateServerSeed, hashServerSeed } from "./fair.js";
import { multiplierFor, payoutFor } from "./dice.js";

describe("provably fair rolls", () => {
  it("is deterministic for the same seed/clientSeed/nonce", () => {
    const seed = "a".repeat(64);
    expect(computeRoll(seed, "client", 0)).toBe(computeRoll(seed, "client", 0));
  });

  it("changes with the nonce", () => {
    const seed = generateServerSeed();
    const rolls = new Set(Array.from({ length: 100 }, (_, n) => computeRoll(seed, "c", n)));
    expect(rolls.size).toBeGreaterThan(90); // collisions are possible but rare
  });

  it("stays within [0, 100) with two decimals", () => {
    const seed = generateServerSeed();
    for (let n = 0; n < 1000; n++) {
      const roll = computeRoll(seed, "c", n);
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(100);
      // two decimal places, up to float representation error
      expect(Math.abs(roll * 100 - Math.round(roll * 100))).toBeLessThan(1e-6);
    }
  });

  it("commit hash matches the revealed seed", () => {
    const seed = generateServerSeed();
    expect(hashServerSeed(seed)).toHaveLength(64);
    expect(hashServerSeed(seed)).toBe(hashServerSeed(seed));
  });

  it("is roughly uniform (win rate ~ target%)", () => {
    const seed = generateServerSeed();
    const target = 50;
    let wins = 0;
    const trials = 10_000;
    for (let n = 0; n < trials; n++) {
      if (computeRoll(seed, "uniformity", n) < target) wins++;
    }
    expect(wins / trials).toBeGreaterThan(0.47);
    expect(wins / trials).toBeLessThan(0.53);
  });
});

describe("dice payouts", () => {
  it("pays 99/target on a win", () => {
    expect(multiplierFor(50)).toBeCloseTo(1.98);
    expect(payoutFor(1000, 50, 12.34)).toBe(1980);
  });

  it("pays nothing on a loss (roll >= target)", () => {
    expect(payoutFor(1000, 50, 50)).toBe(0);
    expect(payoutFor(1000, 50, 99.99)).toBe(0);
  });

  it("floors fractional cents in the house's favor", () => {
    // 99/98 * 100 = 101.02... -> 101
    expect(payoutFor(100, 98, 1)).toBe(101);
  });

  it("keeps a 1% house edge (EV < stake)", () => {
    for (const target of [1, 10, 25, 50, 75, 98]) {
      const stake = 100_00;
      const ev = (target / 100) * stake * multiplierFor(target);
      expect(ev).toBeLessThan(stake);
      expect(ev).toBeGreaterThan(stake * 0.98);
    }
  });
});
