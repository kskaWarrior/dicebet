const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

export const env = {
  port: Number(process.env.PORT ?? 8080),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  stripeSecretKey: required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  // Comma-separated list of allowed browser origins (web app + Capacitor)
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim()),
  // Where Stripe Checkout redirects back to after payment
  checkoutReturnUrl: process.env.CHECKOUT_RETURN_URL ?? "http://localhost:3000",
};
