# 🎲 DiceBet

Demo de dados provably-fair. Moedas virtuais de demonstração apenas — sem dinheiro real.

**Web** e **mobile** (Capacitor) compartilham uma base Nuxt 3 e consomem a mesma API Express,
que fala **Postgres direto** e verifica tokens do **GoTrue** — ambos agora o banco único e o
GoTrue da **plataforma RGS** ([ADR-0002](docs/adr/0002-carteira-de-rgs.md)), que substituiu o
Postgres/GoTrue próprios da Fase M-A/M-B ([ADR-0001](docs/adr/0001-local-total-pg-direto-gotrue.md)).
A cloud (Cloud Run / Worker / Supabase) segue desligada.

```
┌─────────────────┐     ┌──────────────────┐
│ Nuxt 3 (SPA)    │     │ Mesmo build no   │
│ nginx (compose) │     │ shell Capacitor  │
└────────┬────────┘     └────────┬─────────┘
         │   Bearer JWT (GoTrue, HS256)
         ▼                       ▼
      ┌──────────────────────────────┐
      │ API Express                  │
      │ regras do jogo · seeds       │
      └──────────────┬───────────────┘
                     ▼ role dicebet_api (pg)
      ┌──────────────────────────────┐
      │ Postgres da plataforma RGS   │
      │ schema dicebet: profiles ·   │
      │ bets · user_seeds · RPCs     │
      │ schema rgs: carteira do      │
      │ operador demo (saga)         │
      └──────────────────────────────┘
```

## Stack

- `apps/api` — Express 5 + `pg`/`@kskawarrior/rgs-core` (`src/db.ts`), `jose` para o token
  (`src/auth.ts`: JWKS ou HS256). RPCs em `db/migrations/`.
- `apps/web` — Nuxt 3 `ssr: false`; `composables/useAuth.ts` é o `GoTrueClient`.
- `db/migrate.mjs` — aplica as migrations do jogo (schema `dicebet`) e (re)concede os
  grants do role `dicebet_api`, que não escreve em `bets`/`profiles` por fora das RPCs
  nem em `rgs.demo_wallets`/`rgs.ledger` por fora da saga/das funções `demo_*` (provado
  por teste).
- `docker-compose.yml` — só o jogo (migrate, api, web); Postgres/GoTrue vêm do compose do
  repo `rgs` (`scripts/local-up.sh` sobe os dois).

## Por que é interessante

- **Carteira na plataforma.** O saldo do jogador vive em `rgs.demo_wallets` + `rgs.ledger` (append-only), movidos por uma saga (`criarExecutarRodadaNoJogo` do `@kskawarrior/rgs-core`): débito → `dicebet.settle_bet` (regra do jogo, guarda de replay) → crédito se houve prêmio, tudo numa transação com savepoint — sem lost updates, sem aposta pela metade, sem depender de bug-free na API.
- **Provably fair.** O servidor se compromete com `sha256(serverSeed)` antes da aposta. Cada rolagem é `HMAC-SHA256(serverSeed, clientSeed:nonce)`. Rotacionar seeds revela o antigo; a página `/fairness` re-verifica as rolagens no cliente com Web Crypto.
- **Uma API, dois clientes.** O Nuxt gera um SPA que serve tanto o nginx quanto o shell Capacitor; nada crítico do jogo roda no cliente.

## Rodar localmente

Precisa do repo `rgs` clonado ao lado (`../rgs`) — é de lá que vêm o Postgres e o GoTrue
compartilhados pelos jogos irmãos:

```bash
npm install
scripts/local-up.sh                       # sobe o rgs (se preciso), gera .env e sobe o jogo
# RGS_DIR=../rgs WEB_PORT=3002 API_PORT=8082 scripts/local-up.sh   se o caminho ou as portas diferirem
```

Abra `http://localhost:3000`, cadastre um e-mail qualquer (o GoTrue autoconfirma) e jogue:
a primeira requisição autenticada cria a carteira com $10,00 de boas-vindas (operador `demo`
da plataforma).

Para desenvolver a API ou o web fora do container, com o compose no ar:

```bash
cp apps/api/.env.example apps/api/.env   # AUTH_JWT_SECRET = o do .env da raiz
cp apps/web/.env.example apps/web/.env
npm run dev:api   # http://localhost:8080
npm run dev:web   # http://localhost:3000
```

Testes: `npm test` (payout e fairness), `npm run typecheck`, e `npm run test:integration`
contra o Postgres do repo `rgs` (reaplica os schemas `rgs` e `dicebet` do zero:
`requireAuth` com token HS256 real, concorrência do bootstrap, grants do role, RPCs do
jogo, a saga da carteira — `débito → settle_bet → crédito`, replay, RLS por operador).
`npm run db:migrate` aplica os dois schemas sem reset.

## Deploy (desativado)

[deploy-api.yml](.github/workflows/deploy-api.yml) (Cloud Run) e
[mobile.yml](.github/workflows/mobile.yml) (Firebase Test Lab / App Distribution) só rodam
por `workflow_dispatch` e vão falhar até a infra voltar — ainda esperam secrets/vars
`SUPABASE_*`/`STRIPE_*` de antes do rollout RGS (pendência para quem religar a cloud).
[ci.yml](.github/workflows/ci.yml) roda typecheck, unitários e integração (Postgres 17
como service, autenticado no GitHub Packages para o `@kskawarrior/rgs-core` privado) em
todo push fora de `main` e em PRs. `wrangler.jsonc` fica para quando o Worker for
recriado. O `CORS_ORIGINS` da API precisa incluir `capacitor://localhost` e
`http://localhost` para o shell mobile.

## Aviso

Projeto demo/portfólio. Moeda virtual de demonstração apenas — sem processador de
pagamento, sem dinheiro real. Não é um produto de apostas.
