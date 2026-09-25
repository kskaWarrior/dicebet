import type { JogoResponsavel } from "../model/jogo-responsavel.model.js";
import type { JogoResponsavelRepository } from "../../repository/jogo-responsavel.repository.js";

export function createConsultarJogoResponsavelUseCase({ repository }: { repository: JogoResponsavelRepository }) {
  return {
    execute(userId: string): Promise<JogoResponsavel | null> {
      return repository.consultar(userId);
    },
  };
}
