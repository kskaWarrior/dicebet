import type { SetLimitsInput } from "../model/jogo-responsavel.model.js";
import type { JogoResponsavelRepository } from "../../repository/jogo-responsavel.repository.js";

export interface AtualizarLimitesInput extends SetLimitsInput {
  userId: string;
}

/** Só delega: a carência de 24h ao afrouxar é da RPC `set_player_limits`, onde não pode ser burlada. */
export function createAtualizarLimitesUseCase({ repository }: { repository: JogoResponsavelRepository }) {
  return {
    execute({ userId, ...limites }: AtualizarLimitesInput): Promise<void> {
      return repository.definirLimites(userId, limites);
    },
  };
}
