import { Router, raw } from "express";
import Stripe from "stripe";
import { env } from "../env.js";
import { supabase } from "../supabase.js";

export const webhook = Router();

const stripe = new Stripe(env.stripeSecretKey);

// Mounted BEFORE express.json() — Stripe signature verification needs the raw body.
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
      // apply_deposit is idempotent on the session id, so Stripe retries are safe
      const { error } = await supabase.rpc("apply_deposit", {
        p_user_id: userId,
        p_amount: amount,
        p_ref: `stripe:${session.id}`,
      });
      if (error) {
        console.error("apply_deposit failed", error);
        return res.status(500).send("deposit failed"); // Stripe will retry
      }
    }
  }

  return res.json({ received: true });
});
