import { PERIODOS_AUTOEXCLUSAO_DIAS } from "../model/jogo-responsavel.model.js";
import type { JogoResponsavelRepository } from "../../repository/jogo-responsavel.repository.js";

export { PERIODOS_AUTOEXCLUSAO_DIAS };

export interface AutoexcluirInput {
  userId: string;
  days: number;
}

/**
 * Converte o período escolhido na data final e grava. A regra "não encurta enquanto
 * vigora" é da RPC `self_exclude` (SHORTENING_SELF_EXCLUSION); aqui só se recusa um
 * período fora dos presets.
 */
export function createAutoexcluirUseCase({
  repository,
  agora = Date.now,
}: {
  repository: JogoResponsavelRepository;
  agora?: () => number;
}) {
  return {
    async execute({ userId, days }: AutoexcluirInput): Promise<string> {
      if (!(PERIODOS_AUTOEXCLUSAO_DIAS as readonly number[]).includes(days)) throw new Error("INVALID_PERIOD");
      const ate = new Date(agora() + days * 86_400_000).toISOString();
      await repository.autoexcluir(userId, ate);
      return ate;
    },
  };
}
