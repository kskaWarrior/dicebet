/** Os quatro limites que o próprio jogador define. `null` = sem limite (zero não existe). */
export interface SetLimitsInput {
  maxStakeCents: number | null;
  dailyLossLimitCents: number | null;
  dailyBetLimitCents: number | null;
  sessionMinutesLimit: number | null;
}

export interface JogoResponsavel extends SetLimitsInput {
  selfExcludedUntil: string | null;
  // Sessão contínua mantida por `settle_bet` (gap de 30 min) — o web calcula o relógio
  // com a mesma regra.
  sessionStartedAt: string | null;
  sessionLastSeenAt: string | null;
  // A partir de quando afrouxar volta a ser aceito; null = pode agora. Calculado no banco
  // (`dicebet.limits_loosenable_at`) para a duração da carência existir num lugar só.
  limitsLoosenableAt: string | null;
  ageAttestedAt: string | null;
}

/** Presets de autoexclusão (dias). Prazos mais longos ou permanentes são lacuna conhecida. */
export const PERIODOS_AUTOEXCLUSAO_DIAS = [30, 90, 180, 365] as const;
