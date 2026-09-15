import { OPERADOR_DEMO_ID } from "@kskawarrior/rgs-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeed, createTestUser, deleteTestUser, getBalance, ledgerDe, placeBet, sql } from "./helpers/db-teste.js";

// O que o rollout para a plataforma (docs/adr/0002-carteira-de-rgs.md) mudou no caminho
// do dinheiro e o que NÃO podia mudar. Prova a forma nova: `rgs.wallet_ops` +
// `rgs.ledger` no lugar de `wallets` + `transactions`, movidos pela saga
// `criarExecutarRodadaNoJogo` (mesma saga que `routes/bets.ts` usa —
// `helpers/db-teste.ts#placeBet` chama `settleBetSaga`, não uma reimplementação).
describe("carteira na plataforma", () => {
  let userId: string;
  let seedId: string;
  let nonce = 0;

  beforeAll(async () => {
    userId = (await createTestUser("dice-carteira")).userId;
    seedId = await createSeed(userId);
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  const seed = () => ({ id: seedId, server_seed_hash: "hash", client_seed: "cli" });

  async function opsDaAposta(roundId: string) {
    const { rows } = await sql.query<{ kind: string; status: string }>(
      `select kind, status from rgs.wallet_ops
        where operator_id = $1 and game = 'dicebet' and round_id = $2
        order by kind`,
      [OPERADOR_DEMO_ID, roundId],
    );
    return rows;
  }

  it("uma aposta premiada deixa duas operações de carteira confirmadas e duas linhas de ledger", async () => {
    const meu = nonce++;
    const { error } = await placeBet(userId, seed(), meu, 1000, 50, 12.34, 2500);
    expect(error).toBeNull();

    expect(await opsDaAposta(`${seedId}:${meu}`)).toEqual([
      { kind: "credit", status: "confirmed" },
      { kind: "debit", status: "confirmed" },
    ]);

    const refs = (await ledgerDe(userId)).map((l) => l.ref_id);
    expect(refs).toContain(`bet:dicebet:${seedId}:${meu}`);
    expect(refs).toContain(`payout:dicebet:${seedId}:${meu}`);
  });

  it("uma aposta perdida deixa só o débito — sem linha de payout", async () => {
    const meu = nonce++;
    const { error } = await placeBet(userId, seed(), meu, 500, 50, 75.5, 0);
    expect(error).toBeNull();

    expect(await opsDaAposta(`${seedId}:${meu}`)).toEqual([{ kind: "debit", status: "confirmed" }]);
    const refs = (await ledgerDe(userId)).map((l) => l.ref_id);
    expect(refs).not.toContain(`payout:dicebet:${seedId}:${meu}`);
  });

  it("o saldo é sempre a soma do ledger — o invariante da demo, agora na plataforma", async () => {
    const somaLedger = (await ledgerDe(userId)).reduce((s, l) => s + Number(l.amount_minor), 0);
    expect(await getBalance(userId)).toBe(somaLedger);
  });

  it("a mesma aposta duas vezes é recusada uma vez só, sem mover dinheiro", async () => {
    const meu = nonce++;
    expect((await placeBet(userId, seed(), meu, 1000, 50, 99.99, 0)).error).toBeNull();
    const saldo = await getBalance(userId);

    const repetida = await placeBet(userId, seed(), meu, 1000, 50, 99.99, 0);

    expect(repetida.error?.message).toContain("NONCE_ALREADY_USED");
    expect(await getBalance(userId)).toBe(saldo);
    expect(await opsDaAposta(`${seedId}:${meu}`)).toHaveLength(1);
  });

  it("stake inválido é recusado antes de qualquer débito", async () => {
    const meu = nonce++;
    const saldo = await getBalance(userId);
    const { error } = await placeBet(userId, seed(), meu, 0, 50, 1, 0);
    expect(error?.message).toContain("INVALID_STAKE");
    expect(await getBalance(userId)).toBe(saldo);
    expect(await opsDaAposta(`${seedId}:${meu}`)).toHaveLength(0);
  });

  it("RLS do schema rgs falha fechada: sem app.operator_id, dicebet_api lê zero linhas, não erro", async () => {
    // `sql` (superusuário) prova que a linha existe; a leitura pelo role da API FORA de
    // `comOperador` (sem `set_config('app.operator_id', ...)` na transação) devolve vazio.
    const { dbApi } = await import("./helpers/db-teste.js");
    const direta = await dbApi.query(
      "select balance_minor from rgs.demo_wallets where operator_id = $1 and player_ref = $2",
      [OPERADOR_DEMO_ID, userId],
    );
    expect(direta.rows).toEqual([]);
    const comSuperusuario = await sql.query(
      "select balance_minor from rgs.demo_wallets where operator_id = $1 and player_ref = $2",
      [OPERADOR_DEMO_ID, userId],
    );
    expect(comSuperusuario.rows).toHaveLength(1);
  });
});
