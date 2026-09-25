import { describe, expect, it } from "vitest";
import {
  PERIODOS_AUTOEXCLUSAO_DIAS,
  afrouxaLimite,
  bloqueadoPelaCarencia,
  calcularSessao,
  confirmacaoAutoexclusaoValida,
  FRASE_CONFIRMACAO,
} from "../shared/jogo-responsavel.js";

// Espelhos em TypeScript das regras do banco (migration 20260925000002). O banco é a
// autoridade; estas cópias existem para a tela avisar ANTES da tentativa.
describe("afrouxaLimite (null = sem limite)", () => {
  it("valor -> null é afrouxar; null -> valor é apertar", () => {
    expect(afrouxaLimite(100, null)).toBe(true);
    expect(afrouxaLimite(null, 100)).toBe(false);
    expect(afrouxaLimite(null, null)).toBe(false);
    expect(afrouxaLimite(100, 200)).toBe(true);
    expect(afrouxaLimite(100, 50)).toBe(false);
    expect(afrouxaLimite(100, 100)).toBe(false);
  });
});

describe("bloqueadoPelaCarencia (global)", () => {
  const agora = Date.parse("2026-09-25T12:00:00Z");
  const base = {
    maxStakeCents: 500,
    dailyLossLimitCents: null,
    dailyBetLimitCents: 1000,
    sessionMinutesLimit: 60,
    limitsLoosenableAt: "2026-09-26T00:00:00Z",
  };

  it("afrouxar qualquer um dentro da carência bloqueia", () => {
    expect(bloqueadoPelaCarencia(base, { ...base, sessionMinutesLimit: 90 }, agora)).toBe(true);
    expect(bloqueadoPelaCarencia(base, { ...base, dailyBetLimitCents: null }, agora)).toBe(true);
  });

  it("apertar nunca bloqueia", () => {
    expect(bloqueadoPelaCarencia(base, { ...base, maxStakeCents: 100, dailyLossLimitCents: 300 }, agora)).toBe(false);
  });

  it("carência vencida ou inexistente libera", () => {
    expect(bloqueadoPelaCarencia({ ...base, limitsLoosenableAt: null }, { ...base, maxStakeCents: null }, agora)).toBe(false);
    expect(
      bloqueadoPelaCarencia({ ...base, limitsLoosenableAt: "2026-09-25T11:00:00Z" }, { ...base, maxStakeCents: null }, agora),
    ).toBe(false);
  });
});

describe("calcularSessao (gap de 30 min, como settle_bet)", () => {
  const agora = Date.parse("2026-09-25T12:00:00Z");
  it("sessão do servidor válida conta desde o início dela", () => {
    const s = calcularSessao(
      { sessionStartedAt: "2026-09-25T11:10:00Z", sessionLastSeenAt: "2026-09-25T11:55:00Z", sessionMinutesLimit: 60 },
      agora,
    );
    expect(s).toEqual({ minutos: 50, limiteMinutos: 60, perto: true, atingido: false });
  });

  it("parado há mais de 30 min: a próxima aposta abre sessão nova", () => {
    const s = calcularSessao(
      { sessionStartedAt: "2026-09-25T09:00:00Z", sessionLastSeenAt: "2026-09-25T11:00:00Z", sessionMinutesLimit: 60 },
      agora,
    );
    expect(s).toEqual({ minutos: 0, limiteMinutos: 60, perto: false, atingido: false });
  });

  it("limite atingido", () => {
    const s = calcularSessao(
      { sessionStartedAt: "2026-09-25T11:00:00Z", sessionLastSeenAt: "2026-09-25T11:59:00Z", sessionMinutesLimit: 60 },
      agora,
    );
    expect(s.atingido).toBe(true);
  });
});

describe("autoexclusão", () => {
  it("presets 30/90/180/365", () => {
    expect(PERIODOS_AUTOEXCLUSAO_DIAS).toEqual([30, 90, 180, 365]);
  });

  it("exige a frase digitada exatamente (sem diferenciar maiúsculas e espaços nas pontas)", () => {
    expect(confirmacaoAutoexclusaoValida(FRASE_CONFIRMACAO)).toBe(true);
    expect(confirmacaoAutoexclusaoValida(`  ${FRASE_CONFIRMACAO.toLowerCase()} `)).toBe(true);
    expect(confirmacaoAutoexclusaoValida("")).toBe(false);
    expect(confirmacaoAutoexclusaoValida("sim")).toBe(false);
  });
});
