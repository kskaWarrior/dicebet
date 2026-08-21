# DiceBet — Project Overview

A provably-fair dice betting demo. Virtual coins + Stripe **test mode** only — no real money changes hands.

## Stack

One Nuxt 3 codebase, two shells, one API:

```
┌──────────────────┐     ┌───────────────────┐
│ Nuxt 3 (SPA)     │     │ Same build wrapped │
│ Cloudflare Pages │     │ in a Capacitor     │
│                  │     │ shell (iOS/Android)│
└─────────┬────────┘     └─────────┬──────────┘
          │      Bearer JWT (Supabase Auth)
          ▼                        ▼
      ┌───────────────────────────────────┐      ┌─────────────┐
      │ Express API — Cloud Run          │◄─────┤ Stripe      │
      │ game logic · ledger · seeds      │ hook │ (test mode) │
      └────────────────┬──────────────────┘      └─────────────┘
                        ▼ service role
      ┌───────────────────────────────────┐
      │ Supabase Postgres                 │
      │ wallets · transactions · RLS      │
      └───────────────────────────────────┘
```

| Layer | Tech |
|---|---|
| Web client | Nuxt 3 (SPA), deployed to Cloudflare Pages |
| Mobile client | Same Nuxt build, wrapped with Capacitor for iOS/Android |
| API | Express on Cloud Run — game logic, ledger, seed management |
| Database | Supabase Postgres (wallets, transactions, RLS policies) |
| Auth | Supabase Auth, verified via Supabase's public JWKS |
| Payments | Stripe, test mode only |

## Repo layout

```
apps/
  api/    Express API — auth, dice math, fairness, routes for bets/deposits/seeds/wallet/webhook
  web/    Nuxt 3 app shared by web + mobile (android/, ios/ via Capacitor)
supabase/
  migrations/   Postgres schema: wallets, transactions, seed/nonce tracking, grants
docs/     Architecture & requirements docs (EN + PT-BR)
```

## Why it's interesting

- **Append-only ledger.** `wallets.balance` always equals `sum(transactions.amount)`. Every money movement goes through a single atomic Postgres function (`place_bet` / `apply_deposit`) with row locking — no lost updates, no half-applied bets. Deposits are idempotent on the Stripe session id, so webhook retries are safe.
- **Provably fair.** The server commits to `sha256(serverSeed)` before you bet. Each roll is `HMAC-SHA256(serverSeed, clientSeed:nonce)`. Rotating seeds reveals the old one, and the `/fairness` page re-verifies past rolls entirely client-side with Web Crypto.
- **One API, two clients.** The Nuxt app builds once as an SPA and ships to both Cloudflare Pages and a Capacitor shell — nothing game-critical runs on the client.

## Local development

```bash
npm install

# 1. Create a Supabase project, then run the SQL in supabase/migrations/
# 2. Copy env templates and fill them in
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

npm run dev:api   # http://localhost:8080
npm run dev:web   # http://localhost:3000
```

Stripe webhooks locally: `stripe listen --forward-to localhost:8080/stripe/webhook`. Test card: `4242 4242 4242 4242`.

Tests (payout math, fairness determinism/uniformity): `npm test`.

## Deploy

- **API → Cloud Run**, via `.github/workflows/deploy-api.yml` on push to `main`. Needs Artifact Registry + Cloud Run enabled, three secrets in Secret Manager (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), and Workload Identity Federation for GitHub Actions.
- **Web → Cloudflare Pages** — build command `npm run generate -w apps/web`, output dir `apps/web/.output/public`.
- **Mobile** — same static output wrapped with Capacitor. CI bakes public config (`API_BASE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) into the APK/IPA at build time.

## Disclaimer

Demo/portfolio project. Virtual currency only; payments run exclusively in Stripe test mode. Not a gambling product.
