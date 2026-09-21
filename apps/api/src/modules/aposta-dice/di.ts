import { db } from "../../shared/db.js";
import { computeRoll } from "../../shared/fair.js";
import { createApostarUseCase } from "./domain/usecase/apostar.usecase.js";
import { createCalcularResultadoUseCase } from "./domain/usecase/calcular-resultado.usecase.js";
import { createApostaRepository, errorCode, freeRoundsAtivas as freeRoundsAtivasRepo, listarApostas } from "./repository/aposta.repository.js";
import { createSeedRepository, rotateSeed, seedsRevelados } from "./repository/seed.repository.js";
import type { PlaceBetInput } from "./domain/model/aposta.model.js";

const calcularResultadoUseCase = createCalcularResultadoUseCase();

const apostar = createApostarUseCase({
  seedRepository: createSeedRepository(db),
  betRepository: createApostaRepository(db),
  calcularResultadoUseCase,
  fair: { computeRoll },
});

/** Único ponto que vê usecase e repositório juntos (di.ts, ADR de boundaries desta
 *  migração) — as rotas só enxergam este objeto. */
export const apostaDiceDi = {
  apostar: (input: PlaceBetInput) => apostar.execute(input),
  freeRoundsAtivas: (userId: string) => freeRoundsAtivasRepo(db, userId),
  listarApostas: (userId: string) => listarApostas(db, userId),
  seedAtual: (userId: string) => createSeedRepository(db).getOrCreateActiveSeed(userId),
  rotacionarSeed: (userId: string, clientSeed?: string) => rotateSeed(db, userId, clientSeed),
  seedsRevelados: (userId: string) => seedsRevelados(db, userId),
  errorCode,
};
