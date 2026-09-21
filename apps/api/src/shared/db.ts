import { criarDbTransacional, type Db, type DbTransacional } from "@kskawarrior/rgs-core";
import pg from "pg";
import { env } from "./env.js";

/**
 * Porta de banco (ADR-0001 → rollout RGS, docs/adr/0002-carteira-de-rgs.md): a API
 * fala Postgres direto, com o role `dicebet_api`, que só pode EXECUTAR as RPCs
 * `security definer`, LER as tabelas e INSERT/UPDATE em `user_seeds`. Toda
 * movimentação de saldo continua dentro das RPCs/da saga, então as invariantes
 * do ledger valem independente de bugs aqui — o que antes o GRANT do role já
 * garantia (provado em tests/grants.integration.test.ts).
 *
 * `criarDbTransacional`/`comOperador` vêm do PACOTE `@kskawarrior/rgs-core`, não de
 * uma cópia local: a plataforma precisa da mesma semântica de `app.operator_id`, e
 * duas cópias divergiriam justo no detalhe que importa (o `true` do `set_config`,
 * que prende o valor à transação em vez de à conexão do pool). A RLS do schema
 * `rgs` falha FECHADA — sem `app.operator_id` na transação, ler `rgs.demo_wallets`
 * devolve zero linhas, sem erro — então todo acesso a `rgs` entra por `comOperador`
 * desde esta etapa 1.
 */
export type { Db, DbTransacional };
export { criarDbTransacional };

// bigint e numeric chegam como string por padrão; as colunas de centavos e as
// numeric(5,2) de target/roll cabem em Number — e o web faz `bet.roll.toFixed(2)`,
// como quando o PostgREST devolvia número.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export const db: DbTransacional = criarDbTransacional(
  new pg.Pool({
    connectionString: env.databaseUrl,
    max: 10,
    // Uma aposta é uma transação curta; algo preso por mais de 5 s é problema.
    statement_timeout: 5_000,
  }),
);
