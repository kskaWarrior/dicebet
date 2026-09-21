export interface RecarregarRepositoryPort {
  recarregar(userId: string): Promise<number>;
}

export function createRecarregarUseCase({ repository }: { repository: RecarregarRepositoryPort }) {
  return {
    execute(userId: string): Promise<number> {
      return repository.recarregar(userId);
    },
  };
}

export type RecarregarUseCase = ReturnType<typeof createRecarregarUseCase>;
