import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, dbApi, deleteTestUser, getBalance, rpc, sql } from "./helpers/db-teste.js";

// O que RLS + service_role garantiam antes: o role `dicebet_api` executa as RPCs
// e lê, mas não mexe em saldo nem ledger por fora delas (db/migrate.mjs).
describe("grants do role dicebet_api", () => {
  let userId: string;
  beforeAll(async () => {
    ({ userId } = await createTestUser());
  });
  afterAll(async () => {
    await deleteTestUser(userId);
    await Promise.all([sql.end(), dbApi.end()]);
  });

  it("não consegue escrever wallets/transactions/bets por fora das RPCs", async () => {
    await expect(dbApi.query("update public.wallets set balance = 1 where user_id = $1", [userId])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      dbApi.query(
        "insert into public.transactions (user_id, type, amount, balance_after) values ($1, 'deposit', 1, 1)",
        [userId],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(dbApi.query("delete from public.bets where user_id = $1", [userId])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("lê e executa as RPCs do jogo: place_bet debita, paga e rejeita saldo insuficiente", async () => {
    const { rows } = await dbApi.query("select balance from public.wallets where user_id = $1", [userId]);
    expect(Number(rows[0]!.balance)).toBe(1000);

    // aposta perdida de 300: só o débito
    const perdida = await rpc<{ stake: number; payout: number }[]>("place_bet", [
      userId, 300, 50, 75.5, 0, "hash", "cli", 0,
    ]);
    expect(perdida.error).toBeNull();
    expect(await getBalance(userId)).toBe(700);

    // aposta ganha de 100 com payout 198: -100 +198
    const ganha = await rpc("place_bet", [userId, 100, 50, 12.34, 198, "hash", "cli", 1]);
    expect(ganha.error).toBeNull();
    expect(await getBalance(userId)).toBe(798);

    const semSaldo = await rpc("place_bet", [userId, 5000, 50, 1, 0, "hash", "cli", 2]);
    expect(semSaldo.error?.message).toContain("INSUFFICIENT_FUNDS");
    expect(await getBalance(userId)).toBe(798);

    // apply_deposit é idempotente por ref
    for (let i = 0; i < 2; i++) {
      expect((await rpc("apply_deposit", [userId, 500, "stripe:teste"])).error).toBeNull();
    }
    expect(await getBalance(userId)).toBe(1298);
  });

  it("use_next_nonce devolve o nonce antigo e null para seed inativo", async () => {
    const { rows } = await dbApi.query<{ id: string }>(
      `insert into public.user_seeds (user_id, server_seed, server_seed_hash, client_seed)
       values ($1, 'srv', 'hash', 'cli') returning id`,
      [userId],
    );
    const seedId = rows[0]!.id;
    expect((await rpc("use_next_nonce", [seedId])).data).toBe(0);
    expect((await rpc("use_next_nonce", [seedId])).data).toBe(1);
    await dbApi.query("update public.user_seeds set active = false where id = $1", [seedId]);
    expect((await rpc("use_next_nonce", [seedId])).data).toBeNull();
  });
});
