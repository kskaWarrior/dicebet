import pg from "pg";
import { env } from "./env.js";

/**
 * Porta de banco (ADR-0001 → roletafly ADR-0010): a API fala Postgres direto,
 * com o role `dicebet_api`, que só pode EXECUTAR as RPCs `security definer`, LER
 * as tabelas e INSERT/UPDATE em `user_seeds`. Toda movimentação de saldo continua
 * dentro das RPCs, então as invariantes do ledger valem independente de bugs
 * aqui — o que antes o `service_role` garantia, agora é o GRANT do role.
 */
export interface Db {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

// bigint e numeric chegam como string por padrão; as colunas de centavos e as
// numeric(5,2) de target/roll cabem em Number — e o web faz `bet.roll.toFixed(2)`,
// como quando o PostgREST devolvia número.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export const db: Db = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  // Uma aposta é uma transação curta; algo preso por mais de 5 s é problema.
  statement_timeout: 5_000,
});
