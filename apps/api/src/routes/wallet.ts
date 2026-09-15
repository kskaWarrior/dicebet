import { OPERADOR_DEMO_ID } from "@kskawarrior/rgs-core";
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { db } from "../db.js";

export const wallet = Router();

interface LedgerRow {
  id: number;
  ref_id: string;
  amount_minor: number;
  balance_after: number;
  created_at: string;
}

const TIPOS = ["welcome", "refill", "bet", "payout", "rollback"] as const;
type TipoTransacao = (typeof TIPOS)[number] | "outro";

/**
 * Prefixo do `ref_id` (`bet:dicebet:<seed>:<nonce>` → `bet`, `welcome:…` → `welcome`).
 * Um `ref_id` de forma inesperada vira `outro` em vez de um pedaço arbitrário da string.
 */
function tipoDe(refId: string): TipoTransacao {
  const prefixo = refId.split(":", 1)[0]!;
  return (TIPOS as readonly string[]).includes(prefixo) ? (prefixo as TipoTransacao) : "outro";
}

// A carteira vive na plataforma (rollout RGS, docs/adr/0002-carteira-de-rgs.md): saldo
// em `rgs.demo_wallets`, extrato em `rgs.ledger`, chaveados por `(operator_id,
// player_ref)`. Nesta etapa 1 o operador é sempre o `demo`. As duas leituras entram por
// `comOperador` porque a RLS do schema `rgs` falha FECHADA — sem `app.operator_id` na
// transação, o jogador veria saldo zero em vez do saldo real.
wallet.get("/", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { walletRow, ledger } = await db.comOperador(OPERADOR_DEMO_ID, async (tx) => ({
    // Em série, e não `Promise.all`: as duas rodam no MESMO client da transação, que
    // enfileira uma atrás da outra de qualquer jeito.
    walletRow: await tx.query<{ balance_minor: number }>(
      "select balance_minor from rgs.demo_wallets where operator_id = $1 and player_ref = $2 and currency = 'USD'",
      [OPERADOR_DEMO_ID, userId],
    ),
    ledger: await tx.query<LedgerRow>(
      `select id, ref_id, amount_minor, balance_after, created_at
         from rgs.ledger where operator_id = $1 and player_ref = $2
        order by id desc limit 25`,
      [OPERADOR_DEMO_ID, userId],
    ),
  }));
  if (!walletRow.rows[0]) return res.status(404).json({ error: "WALLET_NOT_FOUND" });
  return res.json({
    balance: Number(walletRow.rows[0].balance_minor),
    transactions: ledger.rows.map((t) => ({
      id: String(t.id),
      type: tipoDe(t.ref_id),
      amount: Number(t.amount_minor),
      balance_after: Number(t.balance_after),
      created_at: t.created_at,
    })),
  });
});

// Recarga do operador demo: substitui o depósito Stripe do rollout anterior (ADR-0001
// deste repo) — a regra (só libera perto de zero) é do operador, não do jogo, e nenhum
// jogo irmão manteve um processador de pagamento real depois de adotar a carteira da
// plataforma (docs/adr/0002-carteira-de-rgs.md).
wallet.post("/refill", requireAuth, async (req, res) => {
  const userId = req.userId!;
  try {
    const balance = await db.comOperador(OPERADOR_DEMO_ID, async (tx) => {
      const { rows } = await tx.query<{ balance: number }>("select dicebet.apply_refill($1) as balance", [
        userId,
      ]);
      return rows[0]!.balance;
    });
    res.json({ balance: Number(balance) });
  } catch (error) {
    if ((error as Error).message.includes("REFILL_NOT_ALLOWED")) {
      return res.status(409).json({ error: "REFILL_NOT_ALLOWED" });
    }
    throw error;
  }
});
