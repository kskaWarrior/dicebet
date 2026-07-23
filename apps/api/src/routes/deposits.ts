import { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";

export const deposits = Router();

const stripe = new Stripe(env.stripeSecretKey);

const depositSchema = z.object({
  // cents; test mode only, but keep sane bounds anyway
  amount: z.number().int().min(1_00).max(500_00),
});

deposits.post("/", requireAuth, async (req, res) => {
  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_AMOUNT" });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "DiceBet demo coins" },
          unit_amount: parsed.data.amount,
        },
        quantity: 1,
      },
    ],
    metadata: { user_id: req.userId! },
    success_url: `${env.checkoutReturnUrl}/?deposit=success`,
    cancel_url: `${env.checkoutReturnUrl}/?deposit=cancelled`,
  });

  return res.json({ url: session.url });
});
