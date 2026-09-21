import { Router } from "express";
import { requireAuth } from "../../../shared/auth.js";
import { carteiraDi } from "../di.js";

export const carteiraRouter = Router();

carteiraRouter.get("/", requireAuth, async (req, res) => {
  const carteira = await carteiraDi.consultar(req.userId!);
  if (!carteira) return res.status(404).json({ error: "WALLET_NOT_FOUND" });
  return res.json(carteira);
});

carteiraRouter.post("/refill", requireAuth, async (req, res) => {
  try {
    const balance = await carteiraDi.recarregar(req.userId!);
    res.json({ balance });
  } catch (error) {
    if (error instanceof carteiraDi.RefillNotAllowed) {
      return res.status(409).json({ error: "REFILL_NOT_ALLOWED" });
    }
    throw error;
  }
});
