import { describe, expect, it } from "vitest";
import { errorCode } from "./aposta.repository.js";

describe("errorCode de POST /bets", () => {
  // Recusas de jogo responsável levantadas por `settle_bet` (migration 20260925000002).
  it("limites e autoexclusão são 403", () => {
    expect(errorCode("SELF_EXCLUDED")).toEqual({ code: "SELF_EXCLUDED", status: 403 });
    expect(errorCode("LIMIT_EXCEEDED")).toEqual({ code: "LIMIT_EXCEEDED", status: 403 });
    expect(errorCode("SESSION_LIMIT")).toEqual({ code: "SESSION_LIMIT", status: 403 });
  });

  it("mantém os códigos antigos", () => {
    expect(errorCode("INVALID_STAKE")).toEqual({ code: "INVALID_STAKE", status: 400 });
    expect(errorCode("INSUFFICIENT_FUNDS")).toEqual({ code: "INSUFFICIENT_FUNDS", status: 422 });
  });
});
