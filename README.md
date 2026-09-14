# 🎲 DiceBet

Demo de dados provably-fair. Moedas virtuais + Stripe **test mode** apenas — sem dinheiro real.

**Web** e **mobile** (Capacitor) compartilham uma base Nuxt 3 e consomem a mesma API Express,
que fala **Postgres direto** e verifica tokens do **GoTrue** (Supabase Auth sozinho). Desde
2026-09-14 tudo roda 100% local ([ADR-0001](docs/adr/0001-local-total-pg-direto-gotrue.md));
a cloud (Cloud Run / Worker / Supabase) está desligada até a migração para a plataforma RGS.

```
┌─────────────────┐     ┌──────────────────┐
│ Nuxt 3 (SPA)    │     │ Mesmo build no   │
│ nginx (compose) │     │ shell Capacitor  │
└────────┬────────┘     └────────┬─────────┘
         │   Bearer JWT (GoTrue, HS256)
         ▼                       ▼
      ┌──────────────────────────────┐      ┌─────────────┐
      │ API Express                  │◄─────┤ Stripe      │
      │ regras · ledger · seeds      │ hook │ (test mode) │
      └──────────────┬───────────────┘      └─────────────┘
                     ▼ role dicebet_api (pg)
      ┌──────────────────────────────┐
      │ Postgres 17                  │
      │ wallets · transactions · RPCs│
      └──────────────────────────────┘
```

## Stack

- `apps/api` — Express 5 + `pg` (`src/db.ts`), `jose` para o token (`src/auth.ts`: JWKS ou
  HS256), Stripe. RPCs em `db/migrations/`.
- `apps/web` — Nuxt 3 `ssr: false`; `composables/useAuth.ts` é o `GoTrueClient`.
- `db/migrate.mjs` — aplica as migrations e (re)concede os grants do role `dicebet_api`,
  que não tem UPDATE em `wallets`/`transactions`: a invariante do ledger vale mesmo com bug
  na API (provado por teste).
- `docker-compose.yml` — postgres (52322), gotrue (52321), migrate, api (8080), web (3000).

## Por que é interessante

- **Ledger append-only.** `wallets.balance` é sempre igual a `sum(transactions.amount)`. Toda movimentação passa por uma única função Postgres atômica (`place_bet` / `apply_deposit`) com lock de linha — sem lost updates, sem aposta pela metade. Depósitos são idempotentes no id da sessão Stripe, então retentativas do webhook são seguras.
- **Provably fair.** O servidor se compromete com `sha256(serverSeed)` antes da aposta. Cada rolagem é `HMAC-SHA256(serverSeed, clientSeed:nonce)`. Rotacionar seeds revela o antigo; a página `/fairness` re-verifica as rolagens no cliente com Web Crypto.
- **Uma API, dois clientes.** O Nuxt gera um SPA que serve tanto o nginx quanto o shell Capacitor; nada crítico do jogo roda no cliente.

## Rodar localmente

```bash
npm install
scripts/local-up.sh                       # gera .env (segredo aleatório) e sobe tudo
# WEB_PORT=3002 API_PORT=8082 scripts/local-up.sh   se 3000/8080 estiverem ocupadas
```

Abra `http://localhost:3000`, cadastre um e-mail qualquer (o GoTrue autoconfirma) e jogue:
a primeira requisição autenticada cria a carteira com $10,00 de boas-vindas.

Para desenvolver a API ou o web fora do container, com o compose no ar:

```bash
cp apps/api/.env.example apps/api/.env   # AUTH_JWT_SECRET = o do .env da raiz
cp apps/web/.env.example apps/web/.env
npm run dev:api   # http://localhost:8080
npm run dev:web   # http://localhost:3000
```

Stripe local: `stripe listen --forward-to localhost:8080/stripe/webhook` e as chaves de test
mode em `.env` (raiz, para o compose) ou `apps/api/.env`. Sem elas só o depósito não funciona.
Cartão de teste: `4242 4242 4242 4242`.

Testes: `npm test` (payout e fairness), `npm run typecheck`, e `npm run test:integration`
contra o Postgres do compose (reaplica as migrations do zero: `requireAuth` com token HS256
real, concorrência do bootstrap, grants do role, RPCs do jogo). `npm run db:migrate` aplica
migrations novas sem reset.

## Deploy (desativado)

[deploy-api.yml](.github/workflows/deploy-api.yml) (Cloud Run) e
[mobile.yml](.github/workflows/mobile.yml) (Firebase Test Lab / App Distribution) só rodam
por `workflow_dispatch` e vão falhar até a infra voltar — ainda esperam secrets/vars
`SUPABASE_*`. [ci.yml](.github/workflows/ci.yml) roda typecheck, unitários e integração
(Postgres 17 como service) em todo push fora de `main` e em PRs. `wrangler.jsonc` fica para
quando o Worker for recriado. O `CORS_ORIGINS` da API precisa incluir `capacitor://localhost`
e `http://localhost` para o shell mobile.

## Aviso

Projeto demo/portfólio. Moeda virtual apenas; pagamentos só em Stripe test mode. Não é um produto de apostas.
