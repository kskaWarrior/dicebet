import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../shared/auth.js";
import { MAX_TARGET, MIN_TARGET } from "../domain/usecase/calcular-resultado.usecase.js";
import { apostaDiceDi } from "../di.js";

export const apostasRouter = Router();

const placeBetSchema = z.object({
  stake: z.number().int().min(1).max(1_000_00), // centavos, máx $1000 por aposta
  target: z.number().multipleOf(0.01).min(MIN_TARGET).max(MAX_TARGET),
  // E9: consome uma rodada de uma concessão de rodadas grátis em vez de debitar.
  freeRoundId: z.string().uuid().optional(),
});

apostasRouter.post("/", requireAuth, async (req, res) => {
  const parsed = placeBetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BET", details: parsed.error.issues });
  }
  const { stake, target, freeRoundId } = parsed.data;
  const userId = req.userId!;

  try {
    const { bet, win, multiplier, balance, freeRound } = await apostaDiceDi.apostar({
      userId,
      stake,
      target,
      freeRoundId,
    });
    return res.json({ bet, win, multiplier, balance, ...(freeRound ? { freeRound } : {}) });
  } catch (error) {
    const known = apostaDiceDi.errorCode((error as Error).message);
    if (known) return res.status(known.status).json({ error: known.code });
    console.error("settle_bet failed", error);
    return res.status(500).json({ error: "BET_FAILED" });
  }
});

// E9: concessões de rodada grátis ainda utilizáveis deste jogador.
apostasRouter.get("/free-rounds", requireAuth, async (req, res) => {
  return res.json({ freeRounds: await apostaDiceDi.freeRoundsAtivas(req.userId!) });
});

apostasRouter.get("/", requireAuth, async (req, res) => {
  return res.json({ bets: await apostaDiceDi.listarApostas(req.userId!) });
});
