import { OPERADOR_DEMO_ID } from "@kskawarrior/rgs-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { freeRoundsAtivas } from "../src/modules/aposta-dice/repository/aposta.repository.js";
import { createSeed, createTestUser, dbApiTransacional, deleteTestUser, getBalance, placeBet, sql } from "./helpers/db-teste.js";

// E9 — a rodada grátis fim a fim pela saga do jogo (mesmo molde do piloto roletafly,
// docs/handoff/2026-09-15-e9-plataforma-entregue.md e 2026-09-19-e9-fiacao-*): não debita
// nada, credita o prêmio no fundo da campanha, uma stake divergente é recusada sem gastar
// a rodada, e uma concessão vencida é recusada sem estado parcial.
const STAKE_TRAVADA = 1000; // alvo 50, roll 12.34 → sempre paga (roll < target)

async function criarCampanhaFreeRound(
  opts: { stakeMinor?: number; count?: number; payoutFundType?: "real" | "bonus" } = {},
) {
  const { rows } = await sql.query<{ id: string }>(
    `insert into rgs.campaigns (operator_id, kind, game, currency, free_round_count, free_round_stake_minor, payout_fund_type)
     values ($1, 'free_round', 'dicebet', 'USD', $2, $3, $4) returning id`,
    [OPERADOR_DEMO_ID, opts.count ?? 3, opts.stakeMinor ?? STAKE_TRAVADA, opts.payoutFundType ?? "real"],
  );
  return rows[0]!.id;
}

/** Concede via a função da plataforma (K.2) — precisa do `app.operator_id` setado, como a
 * RLS exige; numa transação própria, fora da que os testes usam para apostar. */
async function concederFreeRound(playerRef: string, campaignId: string) {
  const client = await sql.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.operator_id', $1, true)", [OPERADOR_DEMO_ID]);
    const { rows } = await client.query("select * from rgs.free_rounds_conceder($1, $2, $3)", [
      OPERADOR_DEMO_ID,
      campaignId,
      playerRef,
    ]);
    await client.query("commit");
    return rows[0] as { id: string; rounds_total: number; stake_minor: string };
  } finally {
    client.release();
  }
}

describe("rodada grátis pela saga do jogo (E9)", () => {
  let userId: string;
  let seedId: string;
  let nonce = 0;

  beforeAll(async () => {
    userId = (await createTestUser("dice-free-round")).userId;
    seedId = await createSeed(userId);
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  afterEach(async () => {
    await sql.query(
      "delete from rgs.free_round_uses where free_round_id in (select id from rgs.free_rounds where player_ref = $1)",
      [userId],
    );
    await sql.query("delete from rgs.free_rounds where player_ref = $1", [userId]);
    await sql.query("delete from rgs.campaigns where operator_id = $1 and game = 'dicebet'", [OPERADOR_DEMO_ID]);
  });

  const seed = () => ({ id: seedId, server_seed_hash: "hash", client_seed: "cli" });

  it("não debita nada e credita o prêmio na carteira configurada, com fund_type correto", async () => {
    const campaignId = await criarCampanhaFreeRound({ payoutFundType: "real" });
    const fr = await concederFreeRound(userId, campaignId);
    const antes = await getBalance(userId);
    const meu = nonce++;

    const { data, error } = await placeBet(userId, seed(), meu, STAKE_TRAVADA, 50, 12.34, 2500, fr.id);

    expect(error).toBeNull();
    // Não debitou: o saldo só sobe pelo prêmio, nunca cai pela stake.
    expect(data!.balance).toBe(antes + 2500);
    expect(await getBalance(userId)).toBe(antes + 2500);
    expect(data!.freeRound).toEqual({ roundsRestantes: 2 });

    const { rows } = await sql.query<{ fund_type: string }>("select fund_type from dicebet.bets where id = $1", [
      data!.bet.id,
    ]);
    expect(rows[0]!.fund_type).toBe("free_round");

    const { rows: ledgerRows } = await sql.query<{ fund_type: string; amount_minor: number }>(
      "select fund_type, amount_minor from rgs.ledger where operator_id = $1 and player_ref = $2 order by id desc limit 1",
      [OPERADOR_DEMO_ID, userId],
    );
    expect(ledgerRows[0]).toMatchObject({ fund_type: "real", amount_minor: 2500 });
  });

  it("stake diferente da travada é recusado sem gastar a rodada grátis", async () => {
    const campaignId = await criarCampanhaFreeRound({ stakeMinor: STAKE_TRAVADA });
    const fr = await concederFreeRound(userId, campaignId);
    const meu = nonce++;

    const { error } = await placeBet(userId, seed(), meu, 500, 50, 12.34, 1250, fr.id);

    expect(error?.message).toContain("FREE_ROUND_STAKE_MISMATCH");
    const { rows } = await sql.query<{ rounds_used: number }>("select rounds_used from rgs.free_rounds where id = $1", [
      fr.id,
    ]);
    expect(rows[0]!.rounds_used).toBe(0); // não gastou nada — sem estado parcial
  });

  it("rodada grátis vencida é recusada com FREE_ROUND_EXPIRED, sem estado parcial", async () => {
    const campaignId = await criarCampanhaFreeRound();
    const fr = await concederFreeRound(userId, campaignId);
    await sql.query("update rgs.free_rounds set expires_at = now() - interval '1 minute' where id = $1", [fr.id]);
    const antes = await getBalance(userId);
    const meu = nonce++;

    const { error } = await placeBet(userId, seed(), meu, STAKE_TRAVADA, 50, 12.34, 2500, fr.id);

    expect(error?.message).toContain("FREE_ROUND_EXPIRED");
    expect(await getBalance(userId)).toBe(antes);
    const { rows } = await sql.query<{ rounds_used: number }>("select rounds_used from rgs.free_rounds where id = $1", [
      fr.id,
    ]);
    expect(rows[0]!.rounds_used).toBe(0);
  });

  it("uma rodada grátis não é debitada de lugar nenhum (sem linha 'debit' em wallet_ops)", async () => {
    const campaignId = await criarCampanhaFreeRound();
    const fr = await concederFreeRound(userId, campaignId);
    const meu = nonce++;

    await placeBet(userId, seed(), meu, STAKE_TRAVADA, 50, 12.34, 2500, fr.id);

    const { rows } = await sql.query<{ kind: string }>(
      `select kind from rgs.wallet_ops where operator_id = $1 and player_ref = $2 order by created_at desc limit 5`,
      [OPERADOR_DEMO_ID, userId],
    );
    expect(rows.every((r) => r.kind !== "debit")).toBe(true);
  });
});

describe("freeRoundsAtivas — o que a rota GET /bets/free-rounds lê (E9)", () => {
  let userId: string;

  beforeAll(async () => {
    userId = (await createTestUser("dice-free-round-listagem")).userId;
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  afterEach(async () => {
    await sql.query(
      "delete from rgs.free_round_uses where free_round_id in (select id from rgs.free_rounds where player_ref = $1)",
      [userId],
    );
    await sql.query("delete from rgs.free_rounds where player_ref = $1", [userId]);
    await sql.query("delete from rgs.campaigns where operator_id = $1 and game = 'dicebet'", [OPERADOR_DEMO_ID]);
  });

  it("lista uma concessão ativa com a stake travada e as rodadas restantes", async () => {
    const campaignId = await criarCampanhaFreeRound({ stakeMinor: 500, count: 4 });
    const fr = await concederFreeRound(userId, campaignId);

    const ativas = await freeRoundsAtivas(dbApiTransacional, userId);
    expect(ativas).toEqual([{ id: fr.id, stakeCents: 500, roundsRestantes: 4, expiresAt: expect.any(String) }]);
  });

  it("não lista concessão vencida, cancelada, esgotada, nem de outro jogo", async () => {
    const vencida = await concederFreeRound(userId, await criarCampanhaFreeRound());
    await sql.query("update rgs.free_rounds set expires_at = now() - interval '1 minute' where id = $1", [vencida.id]);

    const cancelada = await concederFreeRound(userId, await criarCampanhaFreeRound());
    await sql.query("update rgs.free_rounds set cancelled_at = now() where id = $1", [cancelada.id]);

    const esgotada = await concederFreeRound(userId, await criarCampanhaFreeRound({ count: 1 }));
    await sql.query("update rgs.free_rounds set rounds_used = 1 where id = $1", [esgotada.id]);

    expect(await freeRoundsAtivas(dbApiTransacional, userId)).toEqual([]);
  });

  it("não vaza a concessão de outro jogador", async () => {
    const campaignId = await criarCampanhaFreeRound();
    await concederFreeRound(userId, campaignId);
    const outro = await createTestUser("dice-free-round-outro");
    try {
      expect(await freeRoundsAtivas(dbApiTransacional, outro.userId)).toEqual([]);
    } finally {
      await deleteTestUser(outro.userId);
    }
  });
});
