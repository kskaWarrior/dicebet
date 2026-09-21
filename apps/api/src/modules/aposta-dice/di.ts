import { db } from "../../shared/db.js";
import { computeRoll } from "../../shared/fair.js";
import { createApostarUseCase } from "./domain/usecase/apostar.usecase.js";
import { createCalcularResultadoUseCase } from "./domain/usecase/calcular-resultado.usecase.js";
import { createApostaRepository, errorCode } from "./repository/aposta.repository.js";
import { createSeedRepository } from "./repository/seed.repository.js";
import type { PlaceBetInput } from "./domain/model/aposta.model.js";

const calcularResultadoUseCase = createCalcularResultadoUseCase();

// Ligadas uma vez ao `db` singleton do módulo — mesmo molde do `aposta-plinko` do
// plinkofly, onde todo acesso ao repositório passa pelo objeto do factory, nunca por
// função solta chamada direto a partir do `di.ts`.
const seedRepository = createSeedRepository(db);
const apostaRepository = createApostaRepository(db);

const apostar = createApostarUseCase({
  seedRepository,
  betRepository: apostaRepository,
  calcularResultadoUseCase,
  fair: { computeRoll },
});

/** Único ponto que vê usecase e repositório juntos (di.ts, ADR de boundaries desta
 *  migração) — as rotas só enxergam este objeto. */
export const apostaDiceDi = {
  apostar: (input: PlaceBetInput) => apostar.execute(input),
  freeRoundsAtivas: (userId: string) => apostaRepository.freeRoundsAtivas(userId),
  listarApostas: (userId: string) => apostaRepository.listarApostas(userId),
  seedAtual: (userId: string) => seedRepository.getOrCreateActiveSeed(userId),
  rotacionarSeed: (userId: string, clientSeed?: string) => seedRepository.rotateSeed(userId, clientSeed),
  seedsRevelados: (userId: string) => seedRepository.seedsRevelados(userId),
  errorCode,
};
