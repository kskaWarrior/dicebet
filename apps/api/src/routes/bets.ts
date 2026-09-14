import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { computeRoll } from "../fair.js";
import { MAX_TARGET, MIN_TARGET, multiplierFor, payoutFor } from "../dice.js";
import { claimNonce, getOrCreateActiveSeed } from "../seeds.js";
import { db } from "../db.js";

export const bets = Router();

const placeBetSchema = z.object({
  stake: z.number().int().min(1).max(1_000_00), // centavos, máx $1000 por aposta
  target: z.number().multipleOf(0.01).min(MIN_TARGET).max(MAX_TARGET),
});

bets.post("/", requireAuth, async (req, res) => {
  const parsed = placeBetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BET", details: parsed.error.issues });
  }
  const { stake, target } = parsed.data;
  const userId = req.userId!;

  const seed = await getOrCreateActiveSeed(userId);
  const nonce = await claimNonce(seed.id);
  const roll = computeRoll(seed.server_seed, seed.client_seed, nonce);
  const payout = payoutFor(stake, target, roll);

  let bet: unknown;
  try {
    const { rows } = await db.query(
      "select * from public.place_bet($1, $2, $3, $4, $5, $6, $7, $8)",
      [userId, stake, target, roll, payout, seed.server_seed_hash, seed.client_seed, nonce],
    );
    bet = rows[0];
  } catch (error) {
    // O driver põe o texto do `raise exception` da RPC em .message
    if ((error as Error).message.includes("INSUFFICIENT_FUNDS")) {
      return res.status(422).json({ error: "INSUFFICIENT_FUNDS" });
    }
    console.error("place_bet failed", error);
    return res.status(500).json({ error: "BET_FAILED" });
  }

  const { rows: wallet } = await db.query<{ balance: number }>(
    "select balance from public.wallets where user_id = $1",
    [userId],
  );

  return res.json({
    bet,
    win: payout > 0,
    multiplier: multiplierFor(target),
    balance: wallet[0]?.balance ?? null,
  });
});

bets.get("/", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `select id, game, stake, target, roll, payout, server_seed_hash, client_seed, nonce, created_at
     from public.bets where user_id = $1 order by created_at desc limit 50`,
    [req.userId!],
  );
  return res.json({ bets: rows });
});
