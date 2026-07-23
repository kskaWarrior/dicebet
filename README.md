# 🎲 DiceBet

A provably-fair dice betting demo. Virtual coins + Stripe **test mode** only — no real money.

**Web** (Cloudflare Pages) and **mobile** (Capacitor) clients share one Nuxt 3 codebase and consume the same Express API on **Cloud Run**, with Supabase providing Postgres + Auth.

```
┌─────────────────┐     ┌──────────────────┐
│ Nuxt 3 (SPA)    │     │ Same build in    │
│ Cloudflare Pages│     │ Capacitor shell  │
└────────┬────────┘     └────────┬─────────┘
         │   Bearer JWT (Supabase Auth)
         ▼                       ▼
      ┌──────────────────────────────┐      ┌─────────────┐
      │ Express API — Cloud Run      │◄─────┤ Stripe      │
      │ game logic · ledger · seeds  │ hook │ (test mode) │
      └──────────────┬───────────────┘      └─────────────┘
                     ▼ service role
      ┌──────────────────────────────┐
      │ Supabase Postgres            │
      │ wallets · transactions · RLS │
      └──────────────────────────────┘
```

## Why this is interesting

- **Append-only ledger.** `wallets.balance` always equals `sum(transactions.amount)`. Every money movement goes through a single atomic Postgres function (`place_bet` / `apply_deposit`) with row locking — no lost updates, no half-applied bets. Deposits are idempotent on the Stripe session id, so webhook retries are safe.
- **Provably fair.** The server commits to `sha256(serverSeed)` before you bet. Each roll is `HMAC-SHA256(serverSeed, clientSeed:nonce)`. Rotating seeds reveals the old one; the `/fairness` page re-verifies rolls entirely client-side with Web Crypto.
- **One API, two clients.** The Nuxt app builds once (SPA) and ships to both Cloudflare Pages and a Capacitor shell; nothing game-critical runs on the client.

## Local development

```bash
npm install

# 1. Create a Supabase project, then run the SQL in supabase/migrations/ (SQL editor or supabase CLI)
# 2. Copy env templates and fill them in
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

npm run dev:api   # http://localhost:8080
npm run dev:web   # http://localhost:3000
```

Stripe webhooks locally: `stripe listen --forward-to localhost:8080/stripe/webhook` (use the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET`). Test card: `4242 4242 4242 4242`.

Tests (payout math, fairness determinism/uniformity): `npm test`.

## Deploy

**API → Cloud Run** — [.github/workflows/deploy-api.yml](.github/workflows/deploy-api.yml) tests, builds, and deploys on push to `main`. One-time setup:

1. Create an Artifact Registry docker repo (`dicebet`) and enable Cloud Run.
2. Put the four secrets in **Secret Manager**: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
3. Set up Workload Identity Federation for GitHub Actions; add repo secrets `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT`, and repo variables `SUPABASE_URL`, `CORS_ORIGINS`, `CHECKOUT_RETURN_URL`.
4. Point the Stripe webhook endpoint at `https://<cloud-run-url>/stripe/webhook`.

**Web → Cloudflare Pages** — connect the repo; build command `npm run generate -w apps/web`, output dir `apps/web/.output/public`, and set the `NUXT_PUBLIC_*` env vars from [apps/web/.env.example](apps/web/.env.example).

**Mobile** — `npm run generate -w apps/web`, then wrap `apps/web/.output/public` with Capacitor (`npx cap add android`). Remember the API's `CORS_ORIGINS` must include `capacitor://localhost` and `http://localhost`.

## Disclaimer

Demo/portfolio project. Virtual currency only; payments run exclusively in Stripe test mode. Not a gambling product.
