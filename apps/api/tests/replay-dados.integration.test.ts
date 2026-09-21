import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { criarDbTransacional } from "../src/shared/db.js";
import { dbApi, sql } from "./helpers/db-teste.js";
import { OPERADOR_DEMO_ID } from "@kskawarrior/rgs-core";

// E11 (rgs) — dicebet.replay_dados (db/migrations/0006_replay_dados.sql): segundo jogo
// depois de roletafly, mesma reimplementação em SQL do HMAC de fair.ts. Vetores gerados
// com o PRÓPRIO computeRoll de apps/api/src/fair.ts (este repo não tinha golden vectors
// antes — dívida nomeada na spec E11, fechada aqui como consequência de precisar validar
// a função SQL, não como objetivo em si).
const VETORES = [
  { serverSeed: "golden-server-seed-0", clientSeed: "golden-client-seed-0", nonce: 0, roll: 29.52 },
  { serverSeed: "golden-server-seed-1", clientSeed: "golden-client-seed-1", nonce: 1, roll: 72.18 },
  { serverSeed: "golden-server-seed-2", clientSeed: "golden-client-seed-2", nonce: 42, roll: 37.31 },
  { serverSeed: "golden-server-seed-3", clientSeed: "golden-client-seed-3", nonce: 999999, roll: 27.19 },
];

const dbApiTransacional = criarDbTransacional(dbApi);
async function replayDados(roundId: string) {
  return dbApiTransacional.comOperador(OPERADOR_DEMO_ID, (tx) =>
    tx.query("select * from dicebet.replay_dados($1, $2)", [OPERADOR_DEMO_ID, roundId]),
  );
}

const criados: string[] = [];

afterAll(async () => {
  for (const seedId of criados) {
    await sql.query("delete from dicebet.bets where seed_id = $1", [seedId]);
    await sql.query("delete from dicebet.user_seeds where id = $1", [seedId]);
  }
});

async function plantarAposta(vetor: (typeof VETORES)[number]) {
  const userId = randomUUID();
  const { rows } = await sql.query<{ id: string }>(
    `insert into dicebet.user_seeds (user_id, server_seed, server_seed_hash, client_seed)
     values ($1, $2, 'hash-nao-usado-no-replay', $3) returning id`,
    [userId, vetor.serverSeed, vetor.clientSeed],
  );
  const seedId = rows[0]!.id;
  criados.push(seedId);
  await sql.query(
    `insert into dicebet.bets (user_id, seed_id, stake, target, roll, server_seed_hash, client_seed, nonce)
     values ($1, $2, 100, 50, $3, 'hash-nao-usado-no-replay', $4, $5)`,
    [userId, seedId, vetor.roll, vetor.clientSeed, vetor.nonce],
  );
  return seedId;
}

describe("dicebet.replay_dados", () => {
  it.each(VETORES)("recalcula o mesmo roll do vetor de ouro (nonce=$nonce)", async (vetor) => {
    const seedId = await plantarAposta(vetor);
    const { rows } = await replayDados(`${seedId}:${vetor.nonce}`);
    const { proof_material, params } = rows[0]!;

    expect(proof_material.serverSeed).toBe(vetor.serverSeed);
    expect(proof_material.clientSeed).toBe(vetor.clientSeed);
    expect(Number(params.rollPago)).toBe(vetor.roll);
    expect(Number(params.rollRecalculado)).toBe(vetor.roll);
    expect(params.bate).toBe(true);
  });

  // Teste de contrato (spec E11, "Testing Decisions"): a forma da assinatura — entrada =
  // round id, saída = proof_material/params — serve de exemplo para o próximo jogo.
  it("respeita a forma do contrato <jogo>.replay_dados: entrada = round id, saída = proof_material/params", async () => {
    const vetor = VETORES[0]!;
    const seedId = await plantarAposta(vetor);
    const { rows } = await replayDados(`${seedId}:${vetor.nonce}`);

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(["params", "proof_material"]);
    expect(typeof rows[0]!.proof_material).toBe("object");
    expect(typeof rows[0]!.params).toBe("object");
  });

  it("UNKNOWN_ROUND para round_id de seed/nonce inexistente", async () => {
    await expect(replayDados(`${randomUUID()}:0`)).rejects.toThrow(/UNKNOWN_ROUND/);
  });

  it("bate=false quando o roll pago foi adulterado", async () => {
    const vetor = VETORES[0]!;
    const seedId = await plantarAposta(vetor);
    await sql.query("update dicebet.bets set roll = 99.99 where seed_id = $1", [seedId]);

    const { rows } = await replayDados(`${seedId}:${vetor.nonce}`);
    expect(rows[0]!.params.bate).toBe(false);
  });
});
