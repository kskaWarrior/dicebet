import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { getOrCreateActiveSeed, rotateSeed } from "../seeds.js";
import { supabase } from "../supabase.js";

export const seeds = Router();

// The current commitment: hash only — the server seed itself stays secret.
seeds.get("/current", requireAuth, async (req, res) => {
  const seed = await getOrCreateActiveSeed(req.userId!);
  return res.json({
    serverSeedHash: seed.server_seed_hash,
    clientSeed: seed.client_seed,
    nonce: seed.nonce,
  });
});

// Rotating reveals the old server seed so past bets become verifiable.
seeds.post("/rotate", requireAuth, async (req, res) => {
  const body = z.object({ clientSeed: z.string().min(1).max(64).optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "INVALID_CLIENT_SEED" });

  const { revealed, next } = await rotateSeed(req.userId!, body.data.clientSeed);
  return res.json({
    revealed: {
      serverSeed: revealed.server_seed,
      serverSeedHash: revealed.server_seed_hash,
      clientSeed: revealed.client_seed,
      lastNonce: revealed.nonce - 1,
    },
    current: {
      serverSeedHash: next.server_seed_hash,
      clientSeed: next.client_seed,
      nonce: next.nonce,
    },
  });
});

seeds.get("/revealed", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("user_seeds")
    .select("server_seed, server_seed_hash, client_seed, nonce, revealed_at")
    .eq("user_id", req.userId!)
    .eq("active", false)
    .not("revealed_at", "is", null)
    .order("revealed_at", { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: "SEEDS_FAILED" });
  return res.json({ seeds: data });
});
