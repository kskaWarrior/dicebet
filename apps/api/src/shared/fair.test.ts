import { describe, expect, it } from "vitest";
import { computeRoll, generateServerSeed, hashServerSeed } from "./fair.js";

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
