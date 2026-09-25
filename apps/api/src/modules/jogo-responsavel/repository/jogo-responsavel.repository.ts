import type { Db } from "../../../shared/db.js";
import type { JogoResponsavel, SetLimitsInput } from "../domain/model/jogo-responsavel.model.js";

export interface JogoResponsavelRepository {
  consultar(userId: string): Promise<JogoResponsavel | null>;
  definirLimites(userId: string, limites: SetLimitsInput): Promise<void>;
  autoexcluir(userId: string, ate: string): Promise<void>;
  atestarMaioridade(userId: string): Promise<string>;
}

// Recusas das RPCs (migration 20260925000002). 409 quando o pedido é válido mas o estado
// atual o rejeita (carência, exclusão em vigor) — o GET já disse quando isso passa.
const ERROS: Record<string, number> = {
  LOOSENING_TOO_SOON: 409,
  SHORTENING_SELF_EXCLUSION: 409,
  INVALID_PERIOD: 400,
  INVALID_LIMIT: 400,
  PLAYER_NOT_FOUND: 404,
};

export function erroJogoResponsavel(error: unknown): { code: string; status: number } | null {
  const message = (error as { message?: unknown } | null)?.message;
  const texto = typeof message === "string" ? message : String(error);
  for (const [code, status] of Object.entries(ERROS)) {
    if (texto.includes(code)) return { code, status };
  }
  return null;
}

interface Linha {
  max_stake_cents: number | null;
  daily_loss_limit_cents: number | null;
  daily_bet_limit_cents: number | null;
  session_minutes_limit: number | null;
  self_excluded_until: Date | null;
  session_started_at: Date | null;
  session_last_seen_at: Date | null;
  limits_loosenable_at: Date | null;
  age_attested_at: Date | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Tudo do schema `dicebet` (nada de `rgs`), então sem `comOperador`. Escrita só pelas
// RPCs `security definer`: o role da API não tem UPDATE em `player_limits`/`profiles`.
export function createJogoResponsavelRepository(db: Db): JogoResponsavelRepository {
  return {
    async consultar(userId) {
      // `left join`: um jogador que ainda não apostou nem mexeu em limites pode não ter
      // linha em `player_limits` — os limites vêm todos null (sem limite), que é a verdade.
      const { rows } = await db.query<Linha>(
        `select l.max_stake_cents, l.daily_loss_limit_cents, l.daily_bet_limit_cents,
                l.session_minutes_limit, l.self_excluded_until, l.session_started_at,
                l.session_last_seen_at, dicebet.limits_loosenable_at(l) as limits_loosenable_at,
                p.age_attested_at
           from dicebet.profiles p
           left join dicebet.player_limits l on l.user_id = p.id
          where p.id = $1`,
        [userId],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        maxStakeCents: r.max_stake_cents,
        dailyLossLimitCents: r.daily_loss_limit_cents,
        dailyBetLimitCents: r.daily_bet_limit_cents,
        sessionMinutesLimit: r.session_minutes_limit,
        selfExcludedUntil: iso(r.self_excluded_until),
        sessionStartedAt: iso(r.session_started_at),
        sessionLastSeenAt: iso(r.session_last_seen_at),
        limitsLoosenableAt: iso(r.limits_loosenable_at),
        ageAttestedAt: iso(r.age_attested_at),
      };
    },

    async definirLimites(userId, l) {
      await db.query("select dicebet.set_player_limits($1, $2, $3, $4, $5)", [
        userId,
        l.maxStakeCents,
        l.dailyLossLimitCents,
        l.dailyBetLimitCents,
        l.sessionMinutesLimit,
      ]);
    },

    async autoexcluir(userId, ate) {
      await db.query("select dicebet.self_exclude($1, $2)", [userId, ate]);
    },

    async atestarMaioridade(userId) {
      const { rows } = await db.query<{ em: Date }>("select dicebet.attest_age($1) as em", [userId]);
      return rows[0]!.em.toISOString();
    },
  };
}
