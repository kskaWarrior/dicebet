import type { ApostaRepository } from "../../repository/aposta.repository.js";
import type { SeedRepository } from "../../repository/seed.repository.js";
import type { PlaceBetInput, PlaceBetResult } from "../model/aposta.model.js";
import type { CalcularResultadoUseCase } from "./calcular-resultado.usecase.js";

export interface FairDependency {
  computeRoll(serverSeed: string, clientSeed: string, nonce: number): number;
}

export interface ApostarUseCaseDeps {
  seedRepository: SeedRepository;
  betRepository: ApostaRepository;
  calcularResultadoUseCase: CalcularResultadoUseCase;
  fair: FairDependency;
}

/**
 * Orquestra uma aposta: reivindica seed + nonce, computa o roll provably-fair, calcula o
 * prêmio e delega a liquidação (débito → registro → crédito) ao repositório — a saga em si
 * mora lá porque precisa do `db` transacional inteiro (savepoints, `comOperador`), que o
 * usecase não vê.
 */
export function createApostarUseCase({ seedRepository, betRepository, calcularResultadoUseCase, fair }: ApostarUseCaseDeps) {
  return {
    async execute({ userId, stake, target, freeRoundId }: PlaceBetInput): Promise<PlaceBetResult> {
      const seed = await seedRepository.getOrCreateActiveSeed(userId);
      // Reivindicado numa consulta própria, fora da transação de liquidação: um rollback
      // da saga não pode devolver o nonce, senão a próxima tentativa repetiria o
      // `roundId` (`seed:nonce`) que `rgs.wallet_ops` já usou.
      const nonce = await seedRepository.claimNonce(seed.id);
      const roll = fair.computeRoll(seed.server_seed, seed.client_seed, nonce);
      const { payoutCents, multiplier, win } = calcularResultadoUseCase.execute({ stakeCents: stake, target, roll });

      const { bet, balance, freeRound } = await betRepository.placeBet({
        userId,
        seed: { id: seed.id, server_seed_hash: seed.server_seed_hash, client_seed: seed.client_seed },
        nonce,
        stake,
        target,
        roll,
        payout: payoutCents,
        freeRoundId,
      });

      return { bet, win, multiplier, balance, ...(freeRound ? { freeRound } : {}) };
    },
  };
}

export type ApostarUseCase = ReturnType<typeof createApostarUseCase>;
