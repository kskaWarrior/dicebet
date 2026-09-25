import type { JogoResponsavelRepository } from "../../repository/jogo-responsavel.repository.js";

/** Registra no servidor a declaração 18+ feita no gate da casca do web; devolve o instante da primeira. */
export function createAtestarMaioridadeUseCase({ repository }: { repository: JogoResponsavelRepository }) {
  return {
    execute(userId: string): Promise<string> {
      return repository.atestarMaioridade(userId);
    },
  };
}
