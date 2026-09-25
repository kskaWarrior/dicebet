import {
  criarExecutarRodadaNoJogo,
  criarExecutarRodadaSemDebitoNoJogo,
  ErroRodada,
  OPERADOR_DEMO_ID,
  uuidv7,
} from "@kskawarrior/rgs-core";
import type { DbTransacional } from "../../../shared/db.js";
import type { BetRow, FreeRoundAtiva, FundType, SeedParaAposta } from "../domain/model/aposta.model.js";

export type { BetRow, SeedParaAposta };

const GAME = "dicebet";

const KNOWN_ERRORS: Record<string, number> = {
  INSUFFICIENT_FUNDS: 422,
  INVALID_STAKE: 400,
  NONCE_ALREADY_USED: 409,
  // Jogo responsável (migration 20260925000002, docs/adr/0003): `settle_bet` recusa DENTRO
  // da saga, que estorna o débito. 403 como no roletafly: o pedido é válido, o jogador é
  // que está impedido de apostar agora.
  SELF_EXCLUDED: 403,
  LIMIT_EXCEEDED: 403,
  SESSION_LIMIT: 403,
  // E9: rodada grátis. UNKNOWN_FREE_ROUND é 404 (não existe/não é deste jogador/jogo,
  // mesmo tratamento de "não encontrado" que o resto da API usa); os outros três estados
  // da concessão (vencida, cancelada, esgotada) são 409 — a concessão existe, mas não
  // serve mais; STAKE_MISMATCH é erro de requisição (400), não de estado do servidor.
  UNKNOWN_FREE_ROUND: 404,
  FREE_ROUND_EXPIRED: 409,
  FREE_ROUND_CANCELLED: 409,
  FREE_ROUND_EXHAUSTED: 409,
  FREE_ROUND_STAKE_MISMATCH: 400,
};

export function errorCode(message: string): { code: string; status: number } | null {
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

/**
 * Saga da aposta (rgs ADR-0003, docs/adr/0002-carteira-de-rgs.md): débito na carteira
 * do operador demo → `settle_bet` (guarda de replay + registro da aposta, sem ledger) →
 * crédito se houve prêmio. O `roundId` é o `(seed_id, nonce)`, único por aposta.
 *
 * Recebe `db` por parâmetro (nunca importa o pool/singleton) — é o que permite as suítes
 * de integração chamarem a MESMA saga que a API usa, com o role restrito da API
 * (`tests/grants.integration.test.ts`), em vez de reimplementar a orquestração no teste.
 *
 * E9: `freeRoundId` consome uma concessão de rodadas grátis em vez de debitar
 * (`rgs.free_round_consumir`). Sem ele, a ordem de consumo bônus/real
 * (`rgs.fundo_para_debito`, C.25) decide o fundo ANTES do débito comum.
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
  freeRoundId?: string,
): Promise<{ bet: BetRow; balance: number | null; freeRound?: { roundsRestantes: number } }> {
  const roundId = `${seed.id}:${nonce}`;
  try {
    const r = await db.comOperador(OPERADOR_DEMO_ID, async (tx) => {
      // Stake inválido é recusado antes de qualquer débito ou consumo de rodada grátis
      // (sem efeitos).
      await tx.query("select dicebet.validate_bet($1)", [stake]);

      // A liquidação roda sob savepoint: um `raise` da função (NONCE_ALREADY_USED, …)
      // não aborta a transação, e a saga ainda consegue registrar o estorno (ou, na
      // rodada grátis, o repositório ainda consegue devolver a rodada grátis não gasta).
      async function liquidar(fundType: FundType) {
        await tx.query("savepoint liquidacao");
        try {
          const { rows } = await tx.query<{ bet_id: string; payout: number }>(
            "select * from dicebet.settle_bet($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            [
              userId,
              seed.id,
              nonce,
              stake,
              target,
              roll,
              payout,
              seed.server_seed_hash,
              seed.client_seed,
              fundType,
              // E10: id do FATO, não da tentativa — gravado na outbox dentro da mesma
              // transação da liquidação, para que uma aposta recusada não deixe evento
              // para trás. Uma retentativa desta liquidação reusa este mesmo id.
              uuidv7(),
            ],
          );
          await tx.query("release savepoint liquidacao");
          const row = rows[0]!;
          return { betId: row.bet_id, payoutMinor: Number(row.payout) };
        } catch (e) {
          await tx.query("rollback to savepoint liquidacao");
          throw e;
        }
      }

      if (freeRoundId) {
        // Rodada grátis (E9): não debita nada. `rgs.free_round_consumir` valida a
        // concessão (expiração, cancelamento, esgotada) e avança `rounds_used` — sob
        // savepoint, porque a stake só é conferida DEPOIS (a stake travada da campanha só
        // existe lá dentro): um pedido com stake diferente da campanha precisa devolver
        // a rodada grátis intacta, não gastá-la.
        await tx.query("savepoint rodada_gratis");
        let fr: { stake_minor: string; payout_fund_type: "real" | "bonus"; rounds_restantes: number };
        try {
          const { rows } = await tx.query<typeof fr>(
            "select * from rgs.free_round_consumir($1, $2, $3, $4, $5, $6)",
            [OPERADOR_DEMO_ID, freeRoundId, userId, GAME, roundId, uuidv7()],
          );
          fr = rows[0]!;
        } catch (e) {
          await tx.query("rollback to savepoint rodada_gratis");
          throw e;
        }
        if (Number(fr.stake_minor) !== stake) {
          await tx.query("rollback to savepoint rodada_gratis");
          throw new Error("FREE_ROUND_STAKE_MISMATCH");
        }
        await tx.query("release savepoint rodada_gratis");

        const executarSemDebito = await criarExecutarRodadaSemDebitoNoJogo({
          tx,
          semTransacao: db,
          operatorId: OPERADOR_DEMO_ID,
        });
        const rodada = await executarSemDebito(
          {
            operatorId: OPERADOR_DEMO_ID,
            playerRef: userId,
            sessionId: seed.id,
            game: GAME,
            roundId,
            currency: "USD",
            fundType: fr.payout_fund_type,
          },
          () => liquidar("free_round"),
        );
        return { ...rodada, freeRound: { roundsRestantes: Number(fr.rounds_restantes) } };
      }

      // Ordem de consumo (C.25): decide bônus ou real ANTES de debitar. Chamado dentro
      // desta transação porque a função confere `rgs.operador_atual()` (RLS por operador).
      const { rows: fundoRows } = await tx.query<{ fundo: "real" | "bonus" }>(
        "select rgs.fundo_para_debito($1, $2, $3, $4) as fundo",
        [OPERADOR_DEMO_ID, userId, "USD", stake],
      );
      const fundType = fundoRows[0]!.fundo;

      const executar = await criarExecutarRodadaNoJogo({ tx, semTransacao: db, operatorId: OPERADOR_DEMO_ID });
      const rodada = await executar(
        {
          operatorId: OPERADOR_DEMO_ID,
          playerRef: userId,
          // A seed, não uma sessão de jogo: a etapa 1 não tem sessão do RGS ainda.
          sessionId: seed.id,
          game: GAME,
          roundId,
          stakeMinor: stake,
          currency: "USD",
          fundType,
        },
        () => liquidar(fundType),
      );
      return { ...rodada, freeRound: undefined };
    });

    const { rows } = await db.query<BetRow>("select * from dicebet.bets where id = $1", [r.liquidacao.betId]);
    return { bet: rows[0]!, balance: r.balanceMinor, freeRound: r.freeRound };
  } catch (e) {
    throw desembrulhar(e);
  }
}

// E9: concessões de rodada grátis ainda utilizáveis deste jogador. "Utilizável" é o que
// `rgs.free_round_consumir` também checaria (não cancelada, não vencida, com rodadas
// restantes) — listar aqui não duplica a REGRA, só evita mostrar algo que a próxima
// aposta recusaria de cara.
export async function freeRoundsAtivas(db: DbTransacional, userId: string): Promise<FreeRoundAtiva[]> {
  const { rows } = await db.comOperador(OPERADOR_DEMO_ID, (tx) =>
    tx.query<{ id: string; stake_minor: string; rounds_total: number; rounds_used: number; expires_at: Date }>(
      `select id, stake_minor, rounds_total, rounds_used, expires_at
         from rgs.free_rounds
        where operator_id = $1 and player_ref = $2 and game = $3
          and cancelled_at is null and expires_at > now() and rounds_used < rounds_total
        order by expires_at asc`,
      [OPERADOR_DEMO_ID, userId, GAME],
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    stakeCents: Number(r.stake_minor),
    roundsRestantes: r.rounds_total - r.rounds_used,
    expiresAt: r.expires_at.toISOString(),
  }));
}

export async function listarApostas(db: DbTransacional, userId: string): Promise<BetRow[]> {
  const { rows } = await db.query<BetRow>(
    `select id, stake, target, roll, payout, server_seed_hash, client_seed, nonce, fund_type, created_at
     from dicebet.bets where user_id = $1 order by created_at desc limit 50`,
    [userId],
  );
  return rows;
}

/** Contrato que o usecase enxerga (di.ts injeta a implementação ligada ao `db`
 *  singleton do módulo). */
export interface ApostaRepository {
  placeBet(params: {
    userId: string;
    seed: SeedParaAposta;
    nonce: number;
    stake: number;
    target: number;
    roll: number;
    payout: number;
    freeRoundId?: string;
  }): Promise<{ bet: BetRow; balance: number | null; freeRound?: { roundsRestantes: number } }>;
  freeRoundsAtivas(userId: string): Promise<FreeRoundAtiva[]>;
  listarApostas(userId: string): Promise<BetRow[]>;
}

/**
 * `settleBetSaga`/`freeRoundsAtivas`/`listarApostas` acima seguem exportadas como funções
 * soltas com `db` por parâmetro (não só `placeBet`) — é o que permite `tests/grants.
 * integration.test.ts` chamar a MESMA saga com o role restrito da API (ver comentário de
 * `settleBetSaga`). `createApostaRepository` é a fachada que o `di.ts` usa: liga as três ao
 * mesmo `db`, no mesmo molde do `aposta-plinko` do plinkofly (`createApostaRepository`
 * devolvendo todos os métodos do contrato, nunca uma mistura de objeto + função solta).
 */
export function createApostaRepository(db: DbTransacional): ApostaRepository {
  return {
    placeBet: ({ userId, seed, nonce, stake, target, roll, payout, freeRoundId }) =>
      settleBetSaga(db, userId, seed, nonce, stake, target, roll, payout, freeRoundId),
    freeRoundsAtivas: (userId) => freeRoundsAtivas(db, userId),
    listarApostas: (userId) => listarApostas(db, userId),
  };
}
