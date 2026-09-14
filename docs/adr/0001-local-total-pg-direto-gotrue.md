---
status: accepted
---

# DiceBet adota as decisões 0010–0012 do roletafly: pg direto, porta de auth GoTrue, RLS por jogador removida (ADR-0001)

## Contexto

O DiceBet era o primeiro dos jogos irmãos e nasceu amarrado ao Supabase hospedado: a API
chamava as RPCs pelo `supabase-js` (PostgREST + chave `service_role`), verificava tokens só
no JWKS do projeto Supabase, o jogador nascia por trigger em `auth.users`, e as tabelas
tinham RLS `auth.uid()` para um caminho de leitura direta pelo navegador que o web nunca
usou (verificado por grep em 2026-09-14: só `useSupabase().auth.*`, nenhum `.from(...)`).

O roletafly já passou por isso nas Fases M-A (local total) e M-B (desacoplar do Supabase),
com três ADRs — [0010](https://github.com/kskaWarrior/roletafly/blob/main/docs/adr/0010-porta-de-banco-pg-direto.md)
(porta de banco), [0011](https://github.com/kskaWarrior/roletafly/blob/main/docs/adr/0011-porta-de-auth-gotrue-configuravel.md)
(porta de auth + `ensure_player`) e [0012](https://github.com/kskaWarrior/roletafly/blob/main/docs/adr/0012-rls-por-jogador-removida.md)
(RLS por jogador removida). O plano fundido da plataforma RGS vai mover carteira, sessões e
bootstrap do jogador para o pacote `rgs`; o que fica aqui é o mínimo que faz o jogo rodar
100% local até lá.

## Decisão

Adotamos as três decisões do roletafly como estão, com estes deltas do DiceBet:

- **Banco** (`apps/api/src/db.ts`): `pg.Pool` como porta `Db`; a API conecta como o role
  `dicebet_api`, que só tem EXECUTE nas RPCs (`place_bet`, `apply_deposit`, `use_next_nonce`,
  `ensure_player`), SELECT nas tabelas e **INSERT + UPDATE em `user_seeds`** — o UPDATE é a
  diferença para o roletafly: `seeds.ts` desativa/revela o par antigo por SQL direto
  (`rotateSeed`), sem RPC própria; o nonce continua indo pela RPC `use_next_nonce`. Toda
  movimentação de saldo segue dentro das RPCs `security definer`. `db/migrate.mjs` aplica
  `db/migrations/*.sql` (tabela `schema_migrations`) e reconcede os grants a cada execução.
- **Tipos**: além de `bigint`, `numeric` (OID 1700) também vira `Number` — `bets.target`/`roll`
  são `numeric(5,2)` e o web faz `bet.roll.toFixed(2)`, como quando o PostgREST devolvia
  número.
- **Auth** (`apps/api/src/auth.ts`, `env.ts`): exatamente um de `AUTH_JWKS_URL` /
  `AUTH_JWT_SECRET`; `requireAuth` chama `ensure_player(sub, username)` em toda requisição
  autenticada (sem cache por processo). `ensure_player` cria profile + carteira com **$10,00
  (1000 centavos)** + lançamento `deposit` com `ref_id = 'welcome:<sub>'` — o tipo `welcome`
  não existe no `check` de `transactions` deste jogo e não vale a pena mudar o schema para
  algo que a carteira de plataforma vai substituir.
- **Web** (`composables/useAuth.ts`): `GoTrueClient` de `@supabase/auth-js` na raiz de
  `NUXT_PUBLIC_AUTH_URL`, `storageKey: "dicebet-auth"`.
- **Stripe** fica como está (rotas `/deposits` e `/stripe/webhook`): a única dependência de
  Supabase era a RPC `apply_deposit`, agora chamada por `pg`. O webhook não usa nada do
  Supabase além do banco. Localmente as chaves são placeholders no compose: o depósito
  falha, o resto do jogo não.
- **RLS por jogador, grants a `anon/authenticated/service_role`, trigger em `auth.users`,
  `references auth.users`**: removidos das migrations; `0003_grants.sql` apagada.
- **Local**: `docker-compose.yml` (postgres:17-alpine na 52322, `supabase/auth` na 52321,
  `migrate`, `api`, `web` em nginx) + `scripts/local-up.sh`. Sem bots: este jogo nunca teve.
- **Cloud**: `deploy-api.yml` e `mobile.yml` só por `workflow_dispatch`; o Cloud Run
  `dicebet-api`, o Worker `dicebet` e o projeto Supabase `DiceBet` são desligados (ver o
  handoff `docs/handoff/2026-09-14-m-a-m-b-dicebet.md` para o que ainda depende do humano).

## Consequências

- Um bug de `where user_id = $1` na API vaza dados de outro jogador — antes a RLS seria a
  segunda barreira (que nunca foi exercitada). Mitigação futura: RLS por operador no RGS.
- Sem cascade a partir de `auth.users`: apagar um jogador é responsabilidade da aplicação
  (os testes fazem por tabela).
- `mobile.yml` ainda lê as vars `SUPABASE_URL`/`SUPABASE_ANON_KEY`: quando a infra voltar,
  viram `AUTH_URL` + `API_BASE` — registrado como pendência, não feito agora porque o
  workflow está desligado.
