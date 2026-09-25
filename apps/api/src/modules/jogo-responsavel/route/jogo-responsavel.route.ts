import { rateLimit } from "@kskawarrior/rgs-core";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../shared/auth.js";
import { jogoResponsavelDi } from "../di.js";

// Jogo responsável (Portaria SPA/MF 1.231/2024; docs/adr/0003). As regras — carência de
// 24h ao afrouxar, autoexclusão que não encurta, limites aplicados na aposta — vivem nas
// RPCs; aqui só se valida a forma do pedido e se traduz a recusa.

const limite = z.number().int().positive().nullable();
const limitesSchema = z.object({
  maxStakeCents: limite,
  dailyLossLimitCents: limite,
  dailyBetLimitCents: limite,
  sessionMinutesLimit: z.number().int().positive().max(1440).nullable(),
});

const autoexclusaoSchema = z.object({
  days: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]),
});

export const jogoResponsavelRouter = Router();
jogoResponsavelRouter.use(requireAuth);
jogoResponsavelRouter.use(rateLimit({ windowMs: 60_000, max: 20, keyFn: (req) => req.userId ?? "anon" }));

jogoResponsavelRouter.get("/", async (req, res) => {
  const estado = await jogoResponsavelDi.consultar(req.userId!);
  if (!estado) return res.status(404).json({ error: "PLAYER_NOT_FOUND" });
  return res.json(estado);
});

jogoResponsavelRouter.put("/limits", async (req, res) => {
  const parsed = limitesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY" });
  try {
    await jogoResponsavelDi.atualizarLimites({ userId: req.userId!, ...parsed.data });
    return res.json({ ok: true });
  } catch (error) {
    const known = jogoResponsavelDi.erro(error);
    if (known) return res.status(known.status).json({ error: known.code });
    console.error("set_player_limits failed", error);
    return res.status(500).json({ error: "SET_LIMITS_FAILED" });
  }
});

jogoResponsavelRouter.post("/self-exclude", async (req, res) => {
  const parsed = autoexclusaoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY" });
  try {
    const selfExcludedUntil = await jogoResponsavelDi.autoexcluir({ userId: req.userId!, days: parsed.data.days });
    return res.json({ selfExcludedUntil });
  } catch (error) {
    const known = jogoResponsavelDi.erro(error);
    if (known) return res.status(known.status).json({ error: known.code });
    console.error("self_exclude failed", error);
    return res.status(500).json({ error: "SELF_EXCLUDE_FAILED" });
  }
});

jogoResponsavelRouter.post("/age-attestation", async (req, res) => {
  try {
    const ageAttestedAt = await jogoResponsavelDi.atestarMaioridade(req.userId!);
    return res.json({ ageAttestedAt });
  } catch (error) {
    const known = jogoResponsavelDi.erro(error);
    if (known) return res.status(known.status).json({ error: known.code });
    console.error("attest_age failed", error);
    return res.status(500).json({ error: "ATTEST_AGE_FAILED" });
  }
});
