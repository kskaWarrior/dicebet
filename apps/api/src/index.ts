import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { bets } from "./routes/bets.js";
import { seeds } from "./routes/seeds.js";
import { wallet } from "./routes/wallet.js";

const app = express();

app.use(
  cors({
    origin: env.corsOrigins,
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/bets", bets);
app.use("/seeds", seeds);
app.use("/wallet", wallet);

app.listen(env.port, "0.0.0.0", () => {
  console.log(`DiceBet API listening on :${env.port}`);
});
