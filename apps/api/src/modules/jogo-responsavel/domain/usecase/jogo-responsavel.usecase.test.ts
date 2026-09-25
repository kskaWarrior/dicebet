import { describe, expect, it, vi } from "vitest";
import type { JogoResponsavelRepository } from "../../repository/jogo-responsavel.repository.js";
import { createAtestarMaioridadeUseCase } from "./atestar-maioridade.usecase.js";
import { createAtualizarLimitesUseCase } from "./atualizar-limites.usecase.js";
import { createAutoexcluirUseCase, PERIODOS_AUTOEXCLUSAO_DIAS } from "./autoexcluir.usecase.js";
import { createConsultarJogoResponsavelUseCase } from "./consultar-jogo-responsavel.usecase.js";

function repo(): JogoResponsavelRepository {
  return {
    consultar: vi.fn().mockResolvedValue(null),
    definirLimites: vi.fn().mockResolvedValue(undefined),
    autoexcluir: vi.fn().mockResolvedValue(undefined),
    atestarMaioridade: vi.fn().mockResolvedValue("2026-09-25T12:00:00.000Z"),
  };
}

describe("jogo responsável — usecases", () => {
  it("atualizar limites delega com os quatro valores (null = sem limite)", async () => {
    const r = repo();
    await createAtualizarLimitesUseCase({ repository: r }).execute({
      userId: "u1",
      maxStakeCents: 5000,
      dailyLossLimitCents: null,
      dailyBetLimitCents: null,
      sessionMinutesLimit: 60,
    });
    expect(r.definirLimites).toHaveBeenCalledWith("u1", {
      maxStakeCents: 5000,
      dailyLossLimitCents: null,
      dailyBetLimitCents: null,
      sessionMinutesLimit: 60,
    });
  });

  it("autoexclusão só nos períodos 30/90/180/365 dias", () => {
    expect(PERIODOS_AUTOEXCLUSAO_DIAS).toEqual([30, 90, 180, 365]);
  });

  it("autoexclusão calcula a data final a partir do relógio e a devolve", async () => {
    const r = repo();
    const agora = Date.parse("2026-09-25T00:00:00.000Z");
    const uc = createAutoexcluirUseCase({ repository: r, agora: () => agora });
    const ate = await uc.execute({ userId: "u1", days: 90 });
    expect(ate).toBe("2026-12-24T00:00:00.000Z");
    expect(r.autoexcluir).toHaveBeenCalledWith("u1", ate);
  });

  it("autoexclusão recusa período fora da lista sem chamar o banco", async () => {
    const r = repo();
    const uc = createAutoexcluirUseCase({ repository: r, agora: () => 0 });
    await expect(uc.execute({ userId: "u1", days: 1 })).rejects.toThrow("INVALID_PERIOD");
    expect(r.autoexcluir).not.toHaveBeenCalled();
  });

  it("consultar e atestar maioridade delegam ao repositório", async () => {
    const r = repo();
    await createConsultarJogoResponsavelUseCase({ repository: r }).execute("u1");
    expect(r.consultar).toHaveBeenCalledWith("u1");
    expect(await createAtestarMaioridadeUseCase({ repository: r }).execute("u1")).toBe("2026-09-25T12:00:00.000Z");
  });
});
