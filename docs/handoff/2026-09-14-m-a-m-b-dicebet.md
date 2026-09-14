# Handoff — Fases M-A + M-B no DiceBet: stack 100% local, API em pg direto, GoTrue sozinho

- **Data:** 2026-09-14. **Branch:** `m-ab-local-pg` (a partir de `main`), sem merge e sem push.
- **Origem:** replicação das Fases M-A/M-B do roletafly (handoffs de 2026-09-13 de lá) com o
  escopo reduzido decidido pelo usuário em 2026-09-14: só o que o RGS não vai refazer.
- **ADR:** [`docs/adr/0001-local-total-pg-direto-gotrue.md`](../adr/0001-local-total-pg-direto-gotrue.md)
  (adota 0010–0012 do roletafly, com os deltas do DiceBet).

## O que mudou

| Antes | Depois |
|---|---|
| `supabase/migrations` (3 arquivos) | `db/migrations/0001_init.sql`, `0002_next_nonce.sql` + `node db/migrate.mjs [--reset]`; `0003_grants.sql` apagada; `supabase/` removido |
| `supabase-js` na API (PostgREST, `service_role`) | `pg.Pool` (`src/db.ts`), role `dicebet_api` com EXECUTE/SELECT + INSERT/UPDATE em `user_seeds` |
| `references auth.users` + trigger `handle_new_user` | `profiles.id` = `sub` do token; `ensure_player(sub, username)` com `pg_advisory_xact_lock` e colisão de username tratada, chamada por `requireAuth` |
| RLS `auth.uid()` em 5 tabelas + grants a `anon/authenticated/service_role` | removidos |
| JWKS fixo do Supabase (`SUPABASE_URL`) | `AUTH_JWKS_URL` **ou** `AUTH_JWT_SECRET` (+ `AUTH_AUDIENCE`/`AUTH_ISSUER`) |
| web `useSupabase()` | `useAuth()` = `GoTrueClient` (`@supabase/auth-js`) em `NUXT_PUBLIC_AUTH_URL`, `storageKey` `dicebet-auth` |
| sem compose, sem testes de integração, sem `ci.yml` | `docker-compose.yml` + `scripts/local-up.sh`; `tests/{auth,grants}.integration.test.ts`; `ci.yml` com Postgres 17 como service |
| `deploy-api.yml`/`mobile.yml` em push para `main` | só `workflow_dispatch`, com o comentário do porquê |

Divergências do roletafly, e por quê (também no ADR):

- `grant insert, update on user_seeds` (lá é só INSERT): `seeds.ts` aqui desativa/revela o
  par antigo por SQL direto, sem RPC `rotate_user_seed`. Criar a RPC seria escopo novo.
- `numeric` (OID 1700) também vira `Number`: `bets.target`/`roll` são `numeric(5,2)` e o web
  faz `bet.roll.toFixed(2)` — achado na verificação por curl (vinha `"42.56"` como string).
- Boas-vindas = 1000 centavos ($10,00), lançamento `deposit` com `ref_id = 'welcome:<sub>'`
  (o `check` de `transactions` não tem tipo `welcome`; não mexi no schema).
- Healthcheck do postgres com `pg_isready -h 127.0.0.1`: pelo socket unix ele respondia já
  no servidor temporário do initdb, e o `migrate` conectava no vazio (`ECONNREFUSED`) na
  primeira subida com volume novo.
- Sem bots (este jogo nunca teve), sem `lint` (não há eslint no repo), sem
  `ARCHITECTURE.md`/`DATA-MODEL.md` (a documentação aqui é `.docx` + PNG; não atualizei os
  `.docx`).
- Stripe fica: as chaves são `required` no `env.ts` como antes; o compose injeta placeholders
  (`sk_test_placeholder`) — sem chaves reais só o depósito falha.

## Verificação (prova)

- `npm run typecheck` verde (inclui `tests/` via `tsconfig.test.json`); `npm test`: 1 arquivo,
  **9 testes** verdes. Não há `lint`.
- `docker compose down -v` + `WEB_PORT=3002 API_PORT=8082 bash scripts/local-up.sh` (sem `.env`
  prévio): `migrate` → `aplicada 0001_init.sql`, `aplicada 0002_next_nonce.sql`, `grants de
  dicebet_api ok`; `gotrue` de pé na 52321; `api` **healthy** na 8082; `web` na 3002
  (`GET /` 200; o bundle contém `127.0.0.1:52321` e `localhost:8082`).
- `npm run test:integration -w apps/api` contra esse Postgres: **2 suítes, 8 testes verdes**
  — `auth` (token HS256 → `requireAuth` → carteira com 1000; 5 concorrentes = 1 bônus;
  colisão de username; token sem e-mail; forjado/aud errada = 401 sem tocar no banco) e
  `grants` (`update wallets`/`insert transactions`/`delete bets` como `dicebet_api` →
  `permission denied`; `place_bet` debita/paga/`INSUFFICIENT_FUNDS`; `apply_deposit`
  idempotente; `use_next_nonce` 0, 1, `null` inativo).
- curl: `POST 127.0.0.1:52321/signup` → token (756 chars) → `GET :8082/wallet` **200**
  `{"balance":1000,"transactions":[{"type":"deposit","amount":1000,…}]}` → `POST :8082/bets`
  `{"stake":100,"target":50}` **200** (`roll` 42.56, `payout` 198, `balance` 1098) →
  `GET /seeds/current` 200 (`nonce` 1) → `GET /wallet` sem token **401** `MISSING_TOKEN`.
- **Navegador: não verificado.** O Browser pane recusou `http://localhost:3002` e
  `http://127.0.0.1:3002` ("navigation denied or failed") e a extensão Claude in Chrome não
  estava conectada. Fica para o humano: abrir `http://localhost:3002`, cadastrar um e-mail
  novo e rolar uma vez (o fluxo equivalente por curl acima passou).

## O que foi desligado na cloud (e como recriar)

Nada ainda — os dois comandos foram **negados pelo classificador de permissões** desta sessão
e, conforme o brief, não contornei. Estado atual: Cloud Run `dicebet-api` ainda listado em
`us-central1`; Worker `dicebet` e projeto Supabase `DiceBet` (ref `ffsqwnipewgvtejuvrud`,
us-east-2) ativos.

## Pendências para o humano

```bash
gcloud run services delete dicebet-api --project dice-bet-503309 --region us-central1 --quiet
npx wrangler delete --name dicebet --force          # na raiz do repo (wrangler.jsonc fica)
supabase projects delete ffsqwnipewgvtejuvrud       # exige TTY; projeto "DiceBet"
```

- Secrets/vars do GitHub e o WIF ficam como estão. Quando a infra voltar: `deploy-api.yml`
  precisa de `DATABASE_URL` + `AUTH_JWT_SECRET`/`AUTH_JWKS_URL` no lugar de `SUPABASE_*`;
  `mobile.yml` precisa de `AUTH_URL` no lugar de `SUPABASE_URL`/`SUPABASE_ANON_KEY`.
- Verificação no navegador (acima).
- `apps/api/.env` e `apps/web/.env` locais (não versionados) ainda têm as variáveis
  `SUPABASE_*` antigas: `npm run dev:api` vai falhar com "Defina exatamente um: AUTH_JWKS_URL
  ou AUTH_JWT_SECRET" até serem recriados a partir dos `.env.example`.
- Code-review de dois eixos (Standards + Spec) e merge.

## Gotchas

- O nome do projeto compose é a pasta (`dicebet`), então containers/volume não colidem com os
  irmãos; só as portas do host (52321/52322 fixas; 3000/8080 via `WEB_PORT`/`API_PORT`).
- `--reset` do `migrate.mjs` dropa o schema `public` — o schema `auth` do GoTrue sobrevive,
  mas os jogadores perdem carteira; `ensure_player` recria na próxima requisição.
- `apps/web/android` e `ios` (com `build/` pesado) ficam fora do contexto Docker pelo
  `.dockerignore` da raiz; sem ele o build do web copiava centenas de MB.
- `vitest run` default só pega `src/**/*.test.ts` (`vitest.config.ts`); sem isso a suíte de
  integração entraria no `npm test` e falharia sem banco.

## Próximo passo

Code-review + merge de `m-ab-local-pg`; depois este jogo entra na fila do RGS (carteira e
sessões de plataforma), que substitui `ensure_player`, `wallets`/`transactions` e o GoTrue
por jogo.
