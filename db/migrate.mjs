// Aplica db/migrations/*.sql em ordem, uma vez cada, contra DATABASE_URL —
// substitui o `supabase db push`/`db reset` (ADR-0001, que adota o ADR-0010 do
// roletafly). Cada arquivo roda numa transação e é registrado em
// `schema_migrations`; rodar de novo é no-op.
//
// Ao final, cria (se preciso) e (re)concede ao role `dicebet_api` — o único que
// a API usa — o que ela precisa e nada mais: EXECUTE nas RPCs, SELECT nas tabelas,
// INSERT e UPDATE só em `user_seeds` (o repositório de seeds insere o par novo e
// desativa/revela o antigo por SQL direto; o nonce vai pela RPC `use_next_nonce`).
// Repetido a cada execução para cobrir objetos novos, sem depender de `alter
// default privileges`. A senha vem de API_DB_PASSWORD (default só para o compose
// local; fora dele é segredo).
//
//   node db/migrate.mjs               # DATABASE_URL opcional (default: compose local)
//   node db/migrate.mjs --reset       # dropa e recria o schema public antes (testes)
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Default = o `postgres` do docker-compose, como superusuário (cria o role da API).
const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:52322/dicebet";
const reset = process.argv.includes("--reset");
const dir = fileURLToPath(new URL("./migrations/", import.meta.url));

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (reset) {
    await client.query("drop schema public cascade; create schema public;");
  }
  await client.query(
    "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const aplicadas = new Set(
    (await client.query("select name from public.schema_migrations")).rows.map((r) => r.name),
  );
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (aplicadas.has(name)) continue;
    await client.query("begin");
    try {
      await client.query(readFileSync(dir + name, "utf8"));
      await client.query("insert into public.schema_migrations (name) values ($1)", [name]);
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
  await client.query(`
    revoke execute on all functions in schema public from public;
    grant usage on schema public to dicebet_api;
    grant select on all tables in schema public to dicebet_api;
    grant insert, update on public.user_seeds to dicebet_api;
    grant execute on all functions in schema public to dicebet_api;
  `);
  console.log("grants de dicebet_api ok");
} finally {
  await client.end();
}
