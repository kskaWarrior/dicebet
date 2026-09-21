import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../shared/auth.js";
import { apostaDiceDi } from "../di.js";

export const seedsRouter = Router();

// O compromisso atual: só o hash — o server seed em si continua secreto.
seedsRouter.get("/current", requireAuth, async (req, res) => {
  const seed = await apostaDiceDi.seedAtual(req.userId!);
  return res.json({
    serverSeedHash: seed.server_seed_hash,
    clientSeed: seed.client_seed,
    nonce: seed.nonce,
  });
});

// Rotacionar revela o server seed antigo, tornando as apostas passadas verificáveis.
seedsRouter.post("/rotate", requireAuth, async (req, res) => {
  const body = z.object({ clientSeed: z.string().min(1).max(64).optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "INVALID_CLIENT_SEED" });

  const { revealed, next } = await apostaDiceDi.rotacionarSeed(req.userId!, body.data.clientSeed);
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

seedsRouter.get("/revealed", requireAuth, async (req, res) => {
  return res.json({ seeds: await apostaDiceDi.seedsRevelados(req.userId!) });
});
