import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, dbApi, deleteTestUser, rpc, sql } from "./helpers/db-teste.js";

// O que RLS + service_role garantiam antes da Fase M-A/M-B, e o que os GRANTs do
// rollout RGS (docs/adr/0002-carteira-de-rgs.md) garantem agora: o role `dicebet_api`
// executa as RPCs do jogo e lê, mas não mexe em `bets`/`user_seeds` por fora delas —
// e o dinheiro (rgs.demo_wallets/ledger) segue as mesmas regras do pacote
// @kskawarrior/rgs-core, não deste teste.
describe("grants do role dicebet_api", () => {
  let userId: string;
  beforeAll(async () => {
    ({ userId } = await createTestUser());
  });
  afterAll(async () => {
    await deleteTestUser(userId);
    await Promise.all([sql.end(), dbApi.end()]);
  });

  it("não consegue escrever bets/profiles por fora das RPCs", async () => {
    await expect(
      dbApi.query(
        "insert into dicebet.bets (user_id, seed_id, stake, target, roll, server_seed_hash, client_seed, nonce) values ($1, gen_random_uuid(), 1, 50, 1, 'h', 'c', 0)",
        [userId],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      dbApi.query("update dicebet.profiles set username = 'x' where id = $1", [userId]),
    ).rejects.toThrow(/permission denied/);
    // Mas lê e executa normalmente.
    const { rows } = await dbApi.query("select 1 from dicebet.profiles where id = $1", [userId]);
    expect(rows).toHaveLength(1);
  });

  it("validate_bet recusa stake não positivo", async () => {
    expect((await rpc("validate_bet", [0])).error?.message).toContain("INVALID_STAKE");
    expect((await rpc("validate_bet", [-100])).error?.message).toContain("INVALID_STAKE");
    expect((await rpc("validate_bet", [100])).error).toBeNull();
  });

  it("use_next_nonce devolve o nonce antigo e null para seed inativo", async () => {
    const { rows } = await dbApi.query<{ id: string }>(
      `insert into dicebet.user_seeds (user_id, server_seed, server_seed_hash, client_seed)
       values ($1, 'srv', 'hash', 'cli') returning id`,
      [userId],
    );
    const seedId = rows[0]!.id;
    expect((await rpc("use_next_nonce", [seedId])).data).toBe(0);
    expect((await rpc("use_next_nonce", [seedId])).data).toBe(1);
    await dbApi.query("update dicebet.user_seeds set active = false where id = $1", [seedId]);
    expect((await rpc("use_next_nonce", [seedId])).data).toBeNull();
  });
});
