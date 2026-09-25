import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_STAKE_CENTS, MIN_STAKE_CENTS, stakeValida } from "./calcular-resultado.usecase.js";

// Aposta mínima de R$ 0,50 (50 centavos) — abaixo disso o truncamento do `floor` derruba o
// RTP do pior alvo para menos de 85 % (docs/certificacao/02-memorial-rtp.md). O limite
// vive em DOIS lugares: o zod da rota (usa estas constantes) e `dicebet.validate_bet` no
// banco (a autoridade, chamada antes do débito e de novo dentro de `settle_bet`).
describe("limites de stake", () => {
  it("mínimo de 50 centavos e máximo de 100 000", () => {
    expect(MIN_STAKE_CENTS).toBe(50);
    expect(MAX_STAKE_CENTS).toBe(100_000);
  });

  it("recusa abaixo do mínimo, acima do máximo e fracionário", () => {
    expect(stakeValida(49)).toBe(false);
    expect(stakeValida(1)).toBe(false);
    expect(stakeValida(0)).toBe(false);
    expect(stakeValida(50)).toBe(true);
    expect(stakeValida(100_000)).toBe(true);
    expect(stakeValida(100_001)).toBe(false);
    expect(stakeValida(50.5)).toBe(false);
  });

  // Prende o banco ao mesmo número: sem isto, mudar a constante aqui deixaria o
  // `validate_bet` aceitando o que a API recusa (ou o contrário) sem ninguém notar.
  it("validate_bet da migration nova usa o mesmo mínimo", () => {
    const sql = readFileSync(
      new URL("../../../../../../../db/migrations/20260925000001_aposta_minima.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toMatch(new RegExp(String.raw`p_stake\s*<\s*${MIN_STAKE_CENTS}\b`));
    expect(sql).toMatch(new RegExp(String.raw`p_stake\s*>\s*${MAX_STAKE_CENTS}\b`));
  });
});
