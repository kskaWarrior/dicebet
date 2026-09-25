import { describe, expect, it } from "vitest";
import { erroJogoResponsavel } from "./jogo-responsavel.repository.js";

// A recusa é justamente o que o jogador precisa entender: sem o mapeamento, carência e
// encurtamento chegariam como 500 genérico.
describe("erroJogoResponsavel", () => {
  it("mapeia as recusas das RPCs", () => {
    expect(erroJogoResponsavel(new Error("LOOSENING_TOO_SOON"))).toEqual({ code: "LOOSENING_TOO_SOON", status: 409 });
    expect(erroJogoResponsavel(new Error("SHORTENING_SELF_EXCLUSION"))).toEqual({
      code: "SHORTENING_SELF_EXCLUSION",
      status: 409,
    });
    expect(erroJogoResponsavel(new Error("INVALID_PERIOD"))).toEqual({ code: "INVALID_PERIOD", status: 400 });
    expect(erroJogoResponsavel(new Error("INVALID_LIMIT"))).toEqual({ code: "INVALID_LIMIT", status: 400 });
    // `attest_age` de um usuário sem perfil: 404, não 500.
    expect(erroJogoResponsavel(new Error("PLAYER_NOT_FOUND"))).toEqual({ code: "PLAYER_NOT_FOUND", status: 404 });
  });

  it("erro desconhecido fica null (a rota devolve 500)", () => {
    expect(erroJogoResponsavel(new Error("boom"))).toBeNull();
  });
});
