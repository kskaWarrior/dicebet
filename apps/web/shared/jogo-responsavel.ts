// Regras de jogo responsável do lado do web — ESPELHOS das RPCs da migration
// 20260925000002 (set_player_limits, self_exclude, settle_bet). O banco é a autoridade:
// ele recusa com LOOSENING_TOO_SOON / SHORTENING_SELF_EXCLUSION / SESSION_LIMIT, e estas
// cópias existem só para a tela avisar ANTES da tentativa. Funções puras, sem Nuxt, para
// os testes de `tests/` importarem.

export interface Limites {
  maxStakeCents: number | null;
  dailyLossLimitCents: number | null;
  dailyBetLimitCents: number | null;
  sessionMinutesLimit: number | null;
}

export interface EstadoJogoResponsavel extends Limites {
  selfExcludedUntil: string | null;
  sessionStartedAt: string | null;
  sessionLastSeenAt: string | null;
  limitsLoosenableAt: string | null;
  ageAttestedAt: string | null;
}

/** Espelho de `dicebet.afrouxa_limite`: `null` = SEM limite, então valor -> null afrouxa ao máximo. */
export function afrouxaLimite(atual: number | null | undefined, novo: number | null): boolean {
  if (atual == null) return false;
  if (novo == null) return true;
  return novo > atual;
}

/** O formulário afrouxa algum limite E a carência (global, 24h) ainda não venceu? */
export function bloqueadoPelaCarencia(
  atual: (Limites & { limitsLoosenableAt: string | null }) | null,
  novo: Limites,
  agora: number,
): boolean {
  const afrouxa =
    afrouxaLimite(atual?.maxStakeCents, novo.maxStakeCents) ||
    afrouxaLimite(atual?.dailyLossLimitCents, novo.dailyLossLimitCents) ||
    afrouxaLimite(atual?.dailyBetLimitCents, novo.dailyBetLimitCents) ||
    afrouxaLimite(atual?.sessionMinutesLimit, novo.sessionMinutesLimit);
  const liberaEm = atual?.limitsLoosenableAt;
  return afrouxa && !!liberaEm && Date.parse(liberaEm) > agora;
}

/** Mesmo gap que `settle_bet` usa para decidir se a sessão continua. */
export const SESSION_GAP_MS = 30 * 60_000;
/** A partir de 80 % do limite o relógio ganha destaque. */
export const SESSION_WARNING_RATIO = 0.8;

export interface Sessao {
  minutos: number;
  limiteMinutos: number | null;
  perto: boolean;
  atingido: boolean;
}

/**
 * Relógio de sessão com a regra da RPC: a sessão do servidor só vale se a última aposta
 * foi há no máximo 30 min; senão a próxima aposta abre uma nova e o relógio mostra zero —
 * nunca um limite "estourado" que o banco não aplicaria.
 */
export function calcularSessao(
  estado: Pick<EstadoJogoResponsavel, "sessionStartedAt" | "sessionLastSeenAt" | "sessionMinutesLimit"> | null,
  agora: number,
): Sessao {
  const inicio = estado?.sessionStartedAt ? Date.parse(estado.sessionStartedAt) : null;
  const vista = estado?.sessionLastSeenAt ? Date.parse(estado.sessionLastSeenAt) : null;
  const valida = inicio !== null && vista !== null && agora - vista <= SESSION_GAP_MS;
  const minutos = valida ? Math.max(0, Math.floor((agora - inicio) / 60_000)) : 0;
  const limiteMinutos = estado?.sessionMinutesLimit ?? null;
  const atingido = limiteMinutos !== null && minutos >= limiteMinutos;
  const perto = limiteMinutos !== null && !atingido && minutos >= limiteMinutos * SESSION_WARNING_RATIO;
  return { minutos, limiteMinutos, perto, atingido };
}

/** Presets aceitos pela API (`POST /responsible-gaming/self-exclude`). */
export const PERIODOS_AUTOEXCLUSAO_DIAS = [30, 90, 180, 365] as const;

/**
 * Confirmação digitada da autoexclusão: a mesma palavra em todos os idiomas (a tela diz
 * qual digitar), para um clique acidental não trancar ninguém por um ano.
 */
export const FRASE_CONFIRMACAO = "AUTOEXCLUIR";

export function confirmacaoAutoexclusaoValida(digitado: string): boolean {
  return digitado.trim().toUpperCase() === FRASE_CONFIRMACAO;
}

/** Centavos -> texto do input em reais/dólares ("" = sem limite), e o caminho de volta. */
export function centsParaCampo(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export function campoParaCents(campo: string): number | null {
  const t = campo.trim().replace(",", ".");
  if (t === "") return null;
  const n = Math.round(Number(t) * 100);
  return Number.isFinite(n) && n > 0 ? n : Number.NaN;
}
