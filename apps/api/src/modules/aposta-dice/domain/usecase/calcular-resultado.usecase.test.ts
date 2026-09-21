import { describe, expect, it } from "vitest";
import { multiplierFor, payoutFor } from "./calcular-resultado.usecase.js";

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
