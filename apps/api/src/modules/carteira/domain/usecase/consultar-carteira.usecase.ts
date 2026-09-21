import type { Carteira } from "../model/carteira.model.js";

export interface CarteiraRepositoryPort {
  consultarCarteira(userId: string): Promise<Carteira | null>;
}

export function createConsultarCarteiraUseCase({ repository }: { repository: CarteiraRepositoryPort }) {
  return {
    execute(userId: string): Promise<Carteira | null> {
      return repository.consultarCarteira(userId);
    },
  };
}

export type ConsultarCarteiraUseCase = ReturnType<typeof createConsultarCarteiraUseCase>;
