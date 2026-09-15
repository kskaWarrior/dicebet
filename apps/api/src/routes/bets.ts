import { criarExecutarRodadaNoJogo, ErroRodada, OPERADOR_DEMO_ID } from "@kskawarrior/rgs-core";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { db, type DbTransacional } from "../db.js";
import { MAX_TARGET, MIN_TARGET, multiplierFor, payoutFor } from "../dice.js";
import { computeRoll } from "../fair.js";
import { claimNonce, getOrCreateActiveSeed } from "../seeds.js";

const GAME = "dicebet";

export const bets = Router();

const placeBetSchema = z.object({
  stake: z.number().int().min(1).max(1_000_00), // centavos, máx $1000 por aposta
  target: z.number().multipleOf(0.01).min(MIN_TARGET).max(MAX_TARGET),
});

const KNOWN_ERRORS: Record<string, number> = {
  INSUFFICIENT_FUNDS: 422,
  INVALID_STAKE: 400,
  NONCE_ALREADY_USED: 409,
};

function errorCode(message: string): { code: string; status: number } | null {
  for (const [code, status] of Object.entries(KNOWN_ERRORS)) {
    if (message.includes(code)) return { code, status };
  }
  return null;
}

/**
 * A saga embrulha: `LIQUIDACAO_FALHOU` carrega o erro da função SQL (INVALID_STAKE,
 * NONCE_ALREADY_USED, …), que é o que `errorCode` acima sabe mapear; `INSUFFICIENT_FUNDS`
 * vem da carteira e mantém o nome antigo.
 */
function desembrulhar(e: unknown): unknown {
  // A guarda de replay `(seed_id, nonce)` dispara um passo antes: o `roundId` da saga é
  // `seed:nonce` e `rgs.wallet_ops` tem `unique (operator, game, round_id, kind)`.
  const pgErr = e as { code?: string; table?: string };
  if (pgErr.code === "23505" && pgErr.table === "wallet_ops") {
    return new Error("NONCE_ALREADY_USED", { cause: e });
  }
  if (!(e instanceof ErroRodada)) return e;
  if (e.codigo === "LIQUIDACAO_FALHOU" && e.causa) return e.causa;
  return new Error(e.codigo, { cause: e });
}

export interface SeedParaAposta {
  id: string;
  server_seed_hash: string;
  client_seed: string;
}

export interface BetRow {
  id: string;
  user_id: string;
  seed_id: string;
  stake: number;
  target: number;
  roll: number;
  payout: number;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  created_at: string;
}

/**
 * Saga da aposta (rgs ADR-0003, docs/adr/0002-carteira-de-rgs.md): débito na carteira
 * do operador demo → `settle_bet` (guarda de replay + registro da aposta, sem ledger) →
 * crédito se houve prêmio. O `roundId` é o `(seed_id, nonce)`, único por aposta.
 * Exportada (não só usada pela rota) para as suítes de integração chamarem a MESMA saga
 * que a API usa, em vez de reimplementar a orquestração no teste — recebendo `db` por
 * parâmetro, e não o singleton do módulo, para os testes poderem passar o role da API
 * e provar que os GRANTs bastam, no lugar do `db` de produção (`env.databaseUrl`).
 */
export async function settleBetSaga(
  db: DbTransacional,
  userId: string,
  seed: SeedParaAposta,
  nonce: number,
  stake: number,
  target: number,
  roll: number,
  payout: number,
): Promise<{ bet: BetRow; balance: number | null }> {
  try {
    const r = await db.comOperador(OPERADOR_DEMO_ID, async (tx) => {
      // Stake inválido é recusado antes de qualquer débito (sem efeitos).
      await tx.query("select dicebet.validate_bet($1)", [stake]);

      // A liquidação roda sob savepoint: um `raise` da função (NONCE_ALREADY_USED, …)
      // não aborta a transação, e a saga ainda consegue registrar o estorno.
      async function liquidar() {
        await tx.query("savepoint liquidacao");
        try {
          const { rows } = await tx.query<{ bet_id: string; payout: number }>(
            "select * from dicebet.settle_bet($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [userId, seed.id, nonce, stake, target, roll, payout, seed.server_seed_hash, seed.client_seed],
          );
          await tx.query("release savepoint liquidacao");
          const row = rows[0]!;
          return { betId: row.bet_id, payoutMinor: Number(row.payout) };
        } catch (e) {
          await tx.query("rollback to savepoint liquidacao");
          throw e;
        }
      }

      const executar = await criarExecutarRodadaNoJogo({ tx, semTransacao: db, operatorId: OPERADOR_DEMO_ID });
      return executar(
        {
          operatorId: OPERADOR_DEMO_ID,
          playerRef: userId,
          // A seed, não uma sessão de jogo: a etapa 1 não tem sessão do RGS ainda.
          sessionId: seed.id,
          game: GAME,
          roundId: `${seed.id}:${nonce}`,
          stakeMinor: stake,
          currency: "USD",
        },
        liquidar,
      );
    });

    const { rows } = await db.query<BetRow>("select * from dicebet.bets where id = $1", [r.liquidacao.betId]);
    return { bet: rows[0]!, balance: r.balanceMinor };
  } catch (e) {
    throw desembrulhar(e);
  }
}

bets.post("/", requireAuth, async (req, res) => {
  const parsed = placeBetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BET", details: parsed.error.issues });
  }
  const { stake, target } = parsed.data;
  const userId = req.userId!;

  const seed = await getOrCreateActiveSeed(userId);
  // Reivindicado numa consulta própria, fora da transação de liquidação abaixo: um
  // rollback da saga não pode devolver o nonce, senão a próxima tentativa repetiria o
  // `roundId` (`seed:nonce`) que `rgs.wallet_ops` já usou.
  const nonce = await claimNonce(seed.id);
  const roll = computeRoll(seed.server_seed, seed.client_seed, nonce);
  const payout = payoutFor(stake, target, roll);

  let bet: BetRow;
  let balance: number | null;
  try {
    ({ bet, balance } = await settleBetSaga(db, userId, seed, nonce, stake, target, roll, payout));
  } catch (error) {
    const known = errorCode((error as Error).message);
    if (known) return res.status(known.status).json({ error: known.code });
    console.error("settle_bet failed", error);
    return res.status(500).json({ error: "BET_FAILED" });
  }

  return res.json({
    bet,
    win: payout > 0,
    multiplier: multiplierFor(target),
    balance,
  });
});

bets.get("/", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `select id, stake, target, roll, payout, server_seed_hash, client_seed, nonce, created_at
     from dicebet.bets where user_id = $1 order by created_at desc limit 50`,
    [req.userId!],
  );
  return res.json({ bets: rows });
});
