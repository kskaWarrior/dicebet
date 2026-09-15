import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { db } from "../db.js";
import { getOrCreateActiveSeed, rotateSeed } from "../seeds.js";

export const seeds = Router();

// O compromisso atual: só o hash — o server seed em si continua secreto.
seeds.get("/current", requireAuth, async (req, res) => {
  const seed = await getOrCreateActiveSeed(req.userId!);
  return res.json({
    serverSeedHash: seed.server_seed_hash,
    clientSeed: seed.client_seed,
    nonce: seed.nonce,
  });
});

// Rotacionar revela o server seed antigo, tornando as apostas passadas verificáveis.
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
  const { rows } = await db.query(
    `select server_seed, server_seed_hash, client_seed, nonce, revealed_at from dicebet.user_seeds
     where user_id = $1 and not active and revealed_at is not null
     order by revealed_at desc limit 20`,
    [req.userId!],
  );
  return res.json({ seeds: rows });
});
