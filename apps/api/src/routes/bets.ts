import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { computeRoll } from "../fair.js";
import { MAX_TARGET, MIN_TARGET, multiplierFor, payoutFor } from "../dice.js";
import { claimNonce, getOrCreateActiveSeed } from "../seeds.js";
import { supabase } from "../supabase.js";

export const bets = Router();

const placeBetSchema = z.object({
  stake: z.number().int().min(1).max(1_000_00), // cents, max $1000 per bet
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

  const { data: bet, error } = await supabase.rpc("place_bet", {
    p_user_id: userId,
    p_stake: stake,
    p_target: target,
    p_roll: roll,
    p_payout: payout,
    p_seed_hash: seed.server_seed_hash,
    p_client_seed: seed.client_seed,
    p_nonce: nonce,
  });

  if (error) {
    if (error.message.includes("INSUFFICIENT_FUNDS")) {
      return res.status(422).json({ error: "INSUFFICIENT_FUNDS" });
    }
    console.error("place_bet failed", error);
    return res.status(500).json({ error: "BET_FAILED" });
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .single();

  return res.json({
    bet,
    win: payout > 0,
    multiplier: multiplierFor(target),
    balance: wallet?.balance ?? null,
  });
});

bets.get("/", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("bets")
    .select("id, game, stake, target, roll, payout, server_seed_hash, client_seed, nonce, created_at")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: "HISTORY_FAILED" });
  return res.json({ bets: data });
});
