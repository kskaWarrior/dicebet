import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Provably-fair dice.
 *
 * Before any bet, the player sees sha256(serverSeed). Each bet computes
 *   HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`)
 * and turns the first 4 bytes into a roll in [0, 100). When the player
 * rotates seeds, the old serverSeed is revealed so every past roll can be
 * recomputed and checked against the pre-committed hash.
 */

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function hashServerSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}

/** Roll in [0, 100) with two decimals, deterministic in (serverSeed, clientSeed, nonce). */
export function computeRoll(serverSeed: string, clientSeed: string, nonce: number): number {
  const digest = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest();
  const n = digest.readUInt32BE(0); // 0 .. 2^32-1
  return Math.floor((n / 2 ** 32) * 10000) / 100;
}
