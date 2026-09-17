import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeed, createTestUser, deleteTestUser, placeBet, sql } from "./helpers/db-teste.js";

// E10 — o evento nasce DENTRO da liquidação (`settle_bet`), não na API depois do commit.
// É isso que faz o evento existir exatamente quando a aposta existe: uma liquidação que dá
// rollback leva o evento junto. Nenhum teste de unidade prova isso — precisa de transação
// de verdade, e por isso a suíte passa pela saga real (`placeBet`), o mesmo caminho da API.
describe("round.settled na outbox da plataforma (E10)", () => {
  let userId: string;
  let seedId: string;
  let nonce = 0;

  beforeAll(async () => {
    userId = (await createTestUser("dice-evento")).userId;
    seedId = await createSeed(userId);
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  const seed = () => ({ id: seedId, server_seed_hash: "hash", client_seed: "cli" });

  it("uma aposta liquidada grava exatamente um round.settled com o payload do jogo", async () => {
    const meu = nonce++;

    const { data, error } = await placeBet(userId, seed(), meu, 500, 50, 12.34, 1250);
    expect(error).toBeNull();

    const { rows } = await sql.query<{ type: string; game: string; payload: Record<string, unknown> }>(
      "select type, game, payload from rgs.events where game = 'dicebet' and payload->>'roundId' = $1",
      [`${seedId}:${meu}`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("round.settled");
    expect(rows[0]!.payload.betId).toBe(data.bet.id);
    expect(rows[0]!.payload.playerRef).toBe(userId);
    expect(rows[0]!.payload.stakeMinor).toBe(500);
    expect(rows[0]!.payload.payoutMinor).toBe(1250);
    expect(rows[0]!.payload.fundType).toBe("real");
    // Vocabulário desta aposta — o equivalente ao `pocket` do piloto.
    expect(Number(rows[0]!.payload.target)).toBe(50);
    expect(Number(rows[0]!.payload.roll)).toBe(12.34);
  });

  it("liquidação recusada não deixa evento para trás", async () => {
    const meu = nonce++;

    // A primeira grava aposta e evento; a segunda bate na guarda de replay (seed, nonce)
    // DEPOIS de já ter entrado na transação — é o rollback que precisa levar o evento.
    const primeira = await placeBet(userId, seed(), meu, 500, 50, 12.34, 1250);
    expect(primeira.error).toBeNull();
    const repetida = await placeBet(userId, seed(), meu, 500, 50, 12.34, 1250);
    expect(repetida.error?.message).toContain("NONCE_ALREADY_USED");

    const { rows } = await sql.query<{ n: number }>(
      "select count(*)::int as n from rgs.events where game = 'dicebet' and payload->>'roundId' = $1",
      [`${seedId}:${meu}`],
    );
    // Exatamente um: o da liquidação que vingou, nenhum da que desfez.
    expect(rows[0]!.n).toBe(1);
  });
});
