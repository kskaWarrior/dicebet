import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { bets } from "./routes/bets.js";
import { deposits } from "./routes/deposits.js";
import { seeds } from "./routes/seeds.js";
import { wallet } from "./routes/wallet.js";
import { webhook } from "./routes/webhook.js";

const app = express();

app.use(
  cors({
    origin: env.corsOrigins,
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);

// Raw-body route must come before the JSON parser.
app.use("/stripe/webhook", webhook);

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/bets", bets);
app.use("/seeds", seeds);
app.use("/wallet", wallet);
app.use("/deposits", deposits);

app.listen(env.port, "0.0.0.0", () => {
  console.log(`DiceBet API listening on :${env.port}`);
});
