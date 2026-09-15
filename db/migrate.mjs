// Aplica db/migrations/*.sql em ordem, uma vez cada, no schema `dicebet` do banco único
// da plataforma (rollout RGS, docs/adr/0002-carteira-de-rgs.md daqui). O schema `rgs`
// precisa existir antes: `node node_modules/@kskawarrior/rgs-core/db/migrate.mjs` (o
// `npm run db:migrate` faz os dois). Cada arquivo roda numa transação e é registrado em
// `dicebet.schema_migrations`.
//
// Ao final, cria (se preciso) e (re)concede ao role `dicebet_api` — o único que a API
// usa — o que ela precisa e nada mais: EXECUTE nas RPCs, SELECT nas tabelas e
// INSERT/UPDATE só em `user_seeds`, tudo no schema `dicebet`; e, no schema `rgs`, SÓ o
// que a saga da demo usa — grants explícitos, não filiação a `rgs_api` (que abriria
// `set role` e todo o schema da plataforma).
//
// ALARGAMENTO ACEITO, e vale saber: `rgs.demo_mover`/`demo_rollback` no grant significam
// que o role da API move saldo do operador demo por chamada direta, não só de dentro de
// uma RPC do jogo como antes. É inevitável — quem chama é o adaptador demo do pacote, do
// lado do Node, e é ele quem a saga usa. O que trava um movimento forjado não é mais o
// grant: é a idempotência por `txId` e o par único em `rgs.wallet_ops`.
//
//   node db/migrate.mjs               # DATABASE_URL opcional (default: compose do rgs)
//   node db/migrate.mjs --reset       # dropa e recria o schema dicebet antes (testes)
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Default = o `postgres` do docker-compose do repo `rgs`, como superusuário (cria o role
// da API).
const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:57332/rgs";
const reset = process.argv.includes("--reset");
const dir = fileURLToPath(new URL("./migrations/", import.meta.url));

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (reset) await client.query("drop schema if exists dicebet cascade");
  await client.query("create schema if not exists dicebet");
  await client.query(
    "create table if not exists dicebet.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const aplicadas = new Set(
    (await client.query("select name from dicebet.schema_migrations")).rows.map((r) => r.name),
  );
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (aplicadas.has(name)) continue;
    await client.query("begin");
    try {
      await client.query(readFileSync(dir + name, "utf8"));
      await client.query("insert into dicebet.schema_migrations (name) values ($1)", [name]);
      await client.query("commit");
      console.log(`aplicada ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`migration ${name} falhou: ${error.message}`, { cause: error });
    }
  }

  const senha = process.env.API_DB_PASSWORD ?? "dicebet_api";
  await client.query(
    `do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'dicebet_api') then
        execute format('create role dicebet_api login password %L', $1);
      end if;
    end $$;`.replace("$1", () => "'" + senha.replaceAll("'", "''") + "'"),
  );
  // O `revoke ... from public` é o que impede o `supabase_auth_admin` do GoTrue (e
  // qualquer outro role) de executar as RPCs `security definer`.
  await client.query(`
    revoke execute on all functions in schema dicebet from public;
    grant usage on schema dicebet to dicebet_api;
    grant select on all tables in schema dicebet to dicebet_api;
    grant insert, update on dicebet.user_seeds to dicebet_api;
    grant execute on all functions in schema dicebet to dicebet_api;
    grant usage on schema rgs to dicebet_api;
    grant select on rgs.demo_wallets, rgs.ledger, rgs.wallet_ops to dicebet_api;
    -- A saga resolve a carteira do operador lendo esta tabela. operator_keys NÃO entra:
    -- é a chave do operador http, que a etapa 1 não tem — quem conceder, conceda quando
    -- houver consumidor.
    grant select on rgs.operators to dicebet_api;
    grant execute on function
      rgs.demo_mover(uuid, text, char, bigint, text, text),
      rgs.demo_rollback(uuid, uuid),
      rgs.demo_ensure_wallet(text, char, bigint),
      rgs.demo_refill(text, char),
      rgs.demo_saldo(text),
      rgs.wallet_op_registrar(uuid, uuid, text, text, text, text, text, bigint, char, uuid, text),
      rgs.wallet_op_atualizar(uuid, text, jsonb)
      to dicebet_api;
  `);
  console.log("grants de dicebet_api ok");
} finally {
  await client.end();
}
