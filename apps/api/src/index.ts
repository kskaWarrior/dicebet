import { rateLimit, securityHeaders } from "@kskawarrior/rgs-core";
import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { bets } from "./routes/bets.js";
import { seeds } from "./routes/seeds.js";
import { wallet } from "./routes/wallet.js";

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
app.use("/bets", bets);
app.use("/seeds", seeds);
app.use("/wallet", wallet);

// Express 5 forwards rejected async handlers here instead of crashing.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled route error:", err);
    res.status(500).json({ error: "INTERNAL" });
  },
);

app.listen(env.port, "0.0.0.0", () => {
  console.log(`DiceBet API listening on :${env.port}`);
});
