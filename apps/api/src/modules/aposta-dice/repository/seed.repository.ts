import { randomBytes } from "node:crypto";
import type { Db } from "../../../shared/db.js";
import { generateServerSeed, hashServerSeed } from "../../../shared/fair.js";
import type { SeedRow } from "../domain/model/aposta.model.js";

async function insertSeed(db: Db, userId: string, clientSeed: string): Promise<SeedRow> {
  const serverSeed = generateServerSeed();
  const { rows } = await db.query<SeedRow>(
    `insert into dicebet.user_seeds (user_id, server_seed, server_seed_hash, client_seed)
     values ($1, $2, $3, $4) returning *`,
    [userId, serverSeed, hashServerSeed(serverSeed), clientSeed],
  );
  return rows[0]!;
}

export async function getOrCreateActiveSeed(db: Db, userId: string): Promise<SeedRow> {
  const { rows } = await db.query<SeedRow>(
    "select * from dicebet.user_seeds where user_id = $1 and active limit 1",
    [userId],
  );
  if (rows[0]) return rows[0];
  return insertSeed(db, userId, randomBytes(8).toString("hex"));
}

/** Desativa + revela o seed atual e cria um novo. */
export async function rotateSeed(db: Db, userId: string, clientSeed?: string) {
  const current = await getOrCreateActiveSeed(db, userId);
  await db.query("update dicebet.user_seeds set active = false, revealed_at = now() where id = $1", [
    current.id,
  ]);
  const next = await insertSeed(db, userId, clientSeed?.slice(0, 64) || randomBytes(8).toString("hex"));
  return { revealed: current, next };
}

/** Reivindica o próximo nonce atomicamente (SQL: nonce = nonce + 1 returning old). */
export async function claimNonce(db: Db, seedId: string): Promise<number> {
  const { rows } = await db.query<{ nonce: number | null }>(
    "select dicebet.use_next_nonce($1) as nonce",
    [seedId],
  );
  const nonce = rows[0]?.nonce ?? null;
  if (nonce === null) throw new Error("SEED_NOT_ACTIVE");
  return nonce;
}

export async function seedsRevelados(db: Db, userId: string) {
  const { rows } = await db.query(
    `select server_seed, server_seed_hash, client_seed, nonce, revealed_at from dicebet.user_seeds
     where user_id = $1 and not active and revealed_at is not null
     order by revealed_at desc limit 20`,
    [userId],
  );
  return rows;
}

/** Contrato que o usecase enxerga (di.ts injeta a implementação ligada ao `db`
 *  singleton do módulo). */
export interface SeedRepository {
  getOrCreateActiveSeed(userId: string): Promise<SeedRow>;
  claimNonce(seedId: string): Promise<number>;
}

export function createSeedRepository(db: Db): SeedRepository {
  return {
    getOrCreateActiveSeed: (userId) => getOrCreateActiveSeed(db, userId),
    claimNonce: (seedId) => claimNonce(db, seedId),
  };
}
