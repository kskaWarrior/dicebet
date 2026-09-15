# DiceBet — Project Overview

A provably-fair dice betting demo. Virtual demo coins only — no real money changes hands.

## Stack

One Nuxt 3 codebase, two shells, one API, on the shared RGS platform database
(see [`docs/adr/0002-carteira-de-rgs.md`](docs/adr/0002-carteira-de-rgs.md) and
[`docs/adr/0001-local-total-pg-direto-gotrue.md`](docs/adr/0001-local-total-pg-direto-gotrue.md)):

```
┌──────────────────┐     ┌───────────────────┐
│ Nuxt 3 (SPA)     │     │ Same build wrapped │
│ nginx (compose)  │     │ in a Capacitor     │
│                  │     │ shell (iOS/Android)│
└─────────┬────────┘     └─────────┬──────────┘
          │      Bearer JWT (GoTrue, HS256)
          ▼                        ▼
      ┌───────────────────────────────────┐
      │ Express API                       │
      │ game logic · seeds                │
      └────────────────┬──────────────────┘
                        ▼ role dicebet_api (pg)
      ┌───────────────────────────────────┐
      │ RGS platform Postgres             │
      │ schema dicebet: profiles · bets ·  │
      │ user_seeds · RPCs                 │
      │ schema rgs: demo operator wallet   │
      │ (rgs.demo_wallets/ledger, saga)    │
      └───────────────────────────────────┘
```

| Layer | Tech |
|---|---|
| Web client | Nuxt 3 (SPA), served locally via nginx (compose) |
| Mobile client | Same Nuxt build, wrapped with Capacitor for iOS/Android |
| API | Express — game logic, dice math, fairness, seed management |
| Database | RGS platform Postgres (shared with sibling games), schema `dicebet` + `rgs` |
| Auth | GoTrue (the platform's), verified via JWKS or shared HS256 secret |
| Payments | None — demo coins only, refilled from the platform's `demo` operator |

## Repo layout

```
apps/
  api/    Express API — auth, dice math, fairness, routes for bets/seeds/wallet
  web/    Nuxt 3 app shared by web + mobile (android/, ios/ via Capacitor)
db/
  migrations/   Postgres schema `dicebet`: profiles, bets, seed/nonce tracking, RPCs
docs/     Architecture & requirements docs (EN + PT-BR; most are .docx + PNG)
```

## Why it's interesting

- **Wallet on the platform.** The player's balance lives in `rgs.demo_wallets` + `rgs.ledger` (append-only), moved by a saga (`criarExecutarRodadaNoJogo` from `@kskawarrior/rgs-core`): debit → `dicebet.settle_bet` (game rule, replay guard) → credit if there was a payout — all in one transaction with a savepoint, so a rule failure can't leave a half-applied bet.
- **Provably fair.** The server commits to `sha256(serverSeed)` before you bet. Each roll is `HMAC-SHA256(serverSeed, clientSeed:nonce)`. Rotating seeds reveals the old one, and the `/fairness` page re-verifies past rolls entirely client-side with Web Crypto.
- **One API, two clients.** The Nuxt app builds once as an SPA and ships to both nginx and a Capacitor shell — nothing game-critical runs on the client.

## Local development

Needs the `rgs` repo cloned alongside this one (`../rgs`) — that's where the shared
Postgres and GoTrue come from:

```bash
npm install
scripts/local-up.sh   # brings up rgs (if needed), generates .env, brings up this game

cp apps/api/.env.example apps/api/.env   # AUTH_JWT_SECRET = the root .env's
cp apps/web/.env.example apps/web/.env

npm run dev:api   # http://localhost:8080
npm run dev:web   # http://localhost:3000
```

Tests: `npm test` (payout math, fairness determinism/uniformity), `npm run typecheck`,
`npm run test:integration` (against the `rgs` repo's Postgres — reapplies the `rgs` and
`dicebet` schemas from scratch).

## Deploy

Disabled since the local-only phase (ADR-0001) and still pending the RGS rollout's
cloud story: `.github/workflows/deploy-api.yml` (Cloud Run) and `mobile.yml` only run on
`workflow_dispatch` and still expect pre-rollout `SUPABASE_*`/`STRIPE_*` secrets — see
the README's "Deploy (desativado)" section for the up-to-date pendency list.

## Disclaimer

Demo/portfolio project. Virtual demo currency only — no payment processor, no real
money. Not a gambling product.
