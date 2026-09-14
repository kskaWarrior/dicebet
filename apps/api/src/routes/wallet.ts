import { Router } from "express";
import { requireAuth } from "../auth.js";
import { db } from "../db.js";

export const wallet = Router();

wallet.get("/", requireAuth, async (req, res) => {
  const [{ rows: w }, { rows: txs }] = await Promise.all([
    db.query<{ balance: number }>("select balance from public.wallets where user_id = $1", [req.userId!]),
    db.query(
      `select id, type, amount, balance_after, created_at from public.transactions
       where user_id = $1 order by created_at desc limit 25`,
      [req.userId!],
    ),
  ]);
  if (!w[0]) return res.status(404).json({ error: "WALLET_NOT_FOUND" });
  return res.json({ balance: w[0].balance, transactions: txs });
});
