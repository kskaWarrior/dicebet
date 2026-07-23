import { Router } from "express";
import { requireAuth } from "../auth.js";
import { supabase } from "../supabase.js";

export const wallet = Router();

wallet.get("/", requireAuth, async (req, res) => {
  const [{ data: w }, { data: txs }] = await Promise.all([
    supabase.from("wallets").select("balance").eq("user_id", req.userId!).single(),
    supabase
      .from("transactions")
      .select("id, type, amount, balance_after, created_at")
      .eq("user_id", req.userId!)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  if (!w) return res.status(404).json({ error: "WALLET_NOT_FOUND" });
  return res.json({ balance: w.balance, transactions: txs ?? [] });
});
