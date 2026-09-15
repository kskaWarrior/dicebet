import { randomUUID } from "node:crypto";
import { OPERADOR_DEMO_ID } from "@kskawarrior/rgs-core";
import pg from "pg";
import { criarDbTransacional } from "../../src/db.js";
import { settleBetSaga, type BetRow, type SeedParaAposta } from "../../src/routes/bets.js";

// Scaffolding compartilhado pelas suítes de integração. Não casa `*.test.ts`,
// então nenhum dos dois configs do vitest o coleta.
//
// Aponta para o Postgres do docker-compose do repo `rgs` (banco único, porta 57332);
// `npm run test:integration` roda os dois migrates (`rgs` e `dicebet`) com `--reset`
// antes, como superusuário. `dbApi` é o role da API, para provar que os GRANTs bastam —
// e param onde devem.
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:57332/rgs";
export const API_DATABASE_URL =
  process.env.API_DATABASE_URL ??
  `postgres://dicebet_api:${process.env.API_DB_PASSWORD ?? "dicebet_api"}@127.0.0.1:57332/rgs`;

pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
export const sql = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
export const dbApi = new pg.Pool({ connectionString: API_DATABASE_URL, max: 5 });
export const dbApiTransacional = criarDbTransacional(dbApi);

export interface ResultadoRpc<T = unknown> {
  data: T;
  error: { message: string } | null;
}

/**
 * Chama uma função do schema `dicebet` e devolve no formato `{ data, error }` que as
 * suítes já assertam: erro do Postgres vira `error.message` (com o código que a função
 * levantou), função escalar vira o valor, função de tabela vira as linhas. `fn` entra no
 * SQL por interpolação — só de literais dos próprios testes, nunca de entrada externa.
 */
export async function rpc<T = unknown>(fn: string, args: unknown[]): Promise<ResultadoRpc<T>> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  try {
    const { rows } = await sql.query(`select * from dicebet.${fn}(${placeholders})`, args);
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
  await sql.query("select dicebet.ensure_player($1, $2)", [userId, username]);
  return { userId, username };
}

// Sem `auth.users` não há cascade: apaga na ordem das FKs, nos dois schemas.
export async function deleteTestUser(userId: string) {
  for (const tabela of ["bets", "user_seeds"]) {
    await sql.query(`delete from dicebet.${tabela} where user_id = $1`, [userId]);
  }
  await sql.query("delete from dicebet.profiles where id = $1", [userId]);
  for (const tabela of ["wallet_ops", "ledger", "demo_wallets"]) {
    await sql.query(`delete from rgs.${tabela} where operator_id = $1 and player_ref = $2`, [
      OPERADOR_DEMO_ID,
      userId,
    ]);
  }
}

export async function createSeed(userId: string) {
  const { rows } = await sql.query<{ id: string }>(
    `insert into dicebet.user_seeds (user_id, server_seed, server_seed_hash, client_seed)
     values ($1, 'srv', 'hash', 'cli') returning id`,
    [userId],
  );
  return rows[0]!.id;
}

/** Saldo do jogador na carteira do operador demo (a única que a demo tem). */
export async function getBalance(userId: string): Promise<number> {
  const { rows } = await sql.query<{ balance_minor: number }>(
    "select balance_minor from rgs.demo_wallets where operator_id = $1 and player_ref = $2 and currency = 'USD'",
    [OPERADOR_DEMO_ID, userId],
  );
  if (!rows[0]) throw new Error("carteira não encontrada");
  return Number(rows[0].balance_minor);
}

/** Movimentos do jogador no ledger da plataforma, do mais antigo ao mais novo. */
export async function ledgerDe(userId: string) {
  const { rows } = await sql.query<{ ref_id: string; amount_minor: number; balance_after: number }>(
    "select ref_id, amount_minor, balance_after from rgs.ledger where operator_id = $1 and player_ref = $2 order by id",
    [OPERADOR_DEMO_ID, userId],
  );
  return rows;
}

/**
 * Uma aposta completa pela saga (débito → settle_bet → crédito), como a API faz — mesma
 * função (`settleBetSaga`) que `routes/bets.ts` usa, não uma reimplementação no teste.
 */
export async function placeBet(
  userId: string,
  seed: SeedParaAposta,
  nonce: number,
  stake: number,
  target = 50,
  roll = 99.99,
  payout = 0,
): Promise<ResultadoRpc<{ bet: BetRow; balance: number | null }>> {
  try {
    const r = await settleBetSaga(dbApiTransacional, userId, seed, nonce, stake, target, roll, payout);
    return { data: r, error: null };
  } catch (error) {
    return { data: null as never, error: { message: (error as Error).message } };
  }
}
