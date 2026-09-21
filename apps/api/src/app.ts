import { rateLimit, securityHeaders } from "@kskawarrior/rgs-core";
import cors from "cors";
import express from "express";
import { apostasRouter } from "./modules/aposta-dice/route/apostas.route.js";
import { seedsRouter } from "./modules/aposta-dice/route/seeds.route.js";
import { carteiraRouter } from "./modules/carteira/route/carteira.route.js";
import { sessaoRouter } from "./modules/sessao/route/sessao.route.js";
import { env } from "./shared/env.js";

/**
 * Monta a aplicação Express sem escutar porta nenhuma. Separado de `index.ts` (E13, mesmo
 * molde de plinkofly/roletafly) para que testes de integração ponta a ponta possam subir a
 * API numa porta efêmera em vez de reimplementar a montagem das rotas.
 */
export function criarApp() {
  const app = express();

  // Atrás de um proxy de borda, confiar no X-Forwarded-For dele para que `req.ip` seja o
  // cliente de verdade no rate limit (mesma convenção de roletafly/plinkofly/luckytiger/minefly).
  app.set("trust proxy", true);

  app.use(securityHeaders());

  app.use(
    cors({
      origin: env.corsOrigins,
      allowedHeaders: ["Authorization", "Content-Type"],
      exposedHeaders: ["Retry-After"],
    }),
  );

  // Rate limit global por IP (E12a, US7/US16) — dicebet não tinha nenhum antes.
  app.use(rateLimit({ windowMs: 60_000, max: 120, keyFn: (req) => req.ip ?? "unknown" }));

  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // E13: novo, aditivo. Não substitui `requireAuth`/GoTrue nas rotas abaixo.
  app.use("/sessions", sessaoRouter);
  app.use("/bets", apostasRouter);
  app.use("/seeds", seedsRouter);
  app.use("/wallet", carteiraRouter);

  // Express 5 forwards rejected async handlers here instead of crashing.
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error("Unhandled route error:", err);
      res.status(500).json({ error: "INTERNAL" });
    },
  );

  return app;
}
