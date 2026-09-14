import { Router, raw } from "express";
import Stripe from "stripe";
import { db } from "../db.js";
import { env } from "../env.js";

export const webhook = Router();

const stripe = new Stripe(env.stripeSecretKey);

// Montado ANTES do express.json() — a verificação de assinatura do Stripe precisa do corpo cru.
webhook.post("/", raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") return res.status(400).send("missing signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);
  } catch {
    return res.status(400).send("invalid signature");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const amount = session.amount_total;
    if (userId && amount && amount > 0) {
      // apply_deposit é idempotente no id da sessão, então retentativas do Stripe são seguras
      try {
        await db.query("select public.apply_deposit($1, $2, $3)", [userId, amount, `stripe:${session.id}`]);
      } catch (error) {
        console.error("apply_deposit failed", error);
        return res.status(500).send("deposit failed"); // o Stripe vai retentar
      }
    }
  }

  return res.json({ received: true });
});
