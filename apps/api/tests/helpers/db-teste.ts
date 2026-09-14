import { randomUUID } from "node:crypto";
import pg from "pg";

// Scaffolding compartilhado pelas suítes de integração. Não casa `*.test.ts`,
// então nenhum dos dois configs do vitest o coleta.
//
// Aponta para o Postgres do docker-compose (porta 52322); `npm run test:integration`
// roda `db/migrate.mjs --reset` antes, como superusuário. `dbApi` é o role da API,
// para provar que os GRANTs bastam (e que não passam disso).
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:52322/dicebet";
export const API_DATABASE_URL =
  process.env.API_DATABASE_URL ??
  `postgres://dicebet_api:${process.env.API_DB_PASSWORD ?? "dicebet_api"}@127.0.0.1:52322/dicebet`;

pg.types.setTypeParser(20, (v) => Number(v));
export const sql = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
export const dbApi = new pg.Pool({ connectionString: API_DATABASE_URL, max: 5 });

export interface ResultadoRpc<T = unknown> {
  data: T;
  error: { message: string } | null;
}

/**
 * Chama uma RPC como o role da API e devolve `{ data, error }`: erro do Postgres
 * vira `error.message` (com o código que a RPC levantou), função escalar vira o
 * valor, função de tabela vira as linhas. `fn` entra no SQL por interpolação —
 * só de literais dos próprios testes.
 */
export async function rpc<T = unknown>(fn: string, args: unknown[]): Promise<ResultadoRpc<T>> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  try {
    const { rows } = await dbApi.query(`select * from public.${fn}(${placeholders})`, args);
    const escalar = rows.length === 1 && Object.keys(rows[0]).length === 1 && fn in rows[0];
    return { data: (escalar ? rows[0][fn] : rows) as T, error: null };
  } catch (error) {
    return { data: null as T, error: { message: (error as Error).message } };
  }
}

/** Jogador novo: identidade é só um uuid (o `sub` do token), bootstrap via ensure_player. */
export async function createTestUser(prefixo = "dice-test") {
  const userId = randomUUID();
  const username = `${prefixo}-${userId.slice(0, 8)}`;
  await sql.query("select public.ensure_player($1, $2)", [userId, username]);
  return { userId, username };
}

// Sem `auth.users` não há cascade: apaga na ordem das FKs.
export async function deleteTestUser(userId: string) {
  for (const tabela of ["bets", "transactions", "user_seeds", "wallets"]) {
    await sql.query(`delete from public.${tabela} where user_id = $1`, [userId]);
  }
  await sql.query("delete from public.profiles where id = $1", [userId]);
}

export async function getBalance(userId: string): Promise<number> {
  const { rows } = await sql.query<{ balance: number }>(
    "select balance from public.wallets where user_id = $1",
    [userId],
  );
  if (!rows[0]) throw new Error("wallet não encontrada");
  return Number(rows[0].balance);
}
