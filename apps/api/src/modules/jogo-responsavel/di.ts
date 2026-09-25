import { db } from "../../shared/db.js";
import { createAtestarMaioridadeUseCase } from "./domain/usecase/atestar-maioridade.usecase.js";
import { createAtualizarLimitesUseCase, type AtualizarLimitesInput } from "./domain/usecase/atualizar-limites.usecase.js";
import { createAutoexcluirUseCase, type AutoexcluirInput } from "./domain/usecase/autoexcluir.usecase.js";
import { createConsultarJogoResponsavelUseCase } from "./domain/usecase/consultar-jogo-responsavel.usecase.js";
import { createJogoResponsavelRepository, erroJogoResponsavel } from "./repository/jogo-responsavel.repository.js";

const repository = createJogoResponsavelRepository(db);
const consultar = createConsultarJogoResponsavelUseCase({ repository });
const atualizarLimites = createAtualizarLimitesUseCase({ repository });
const autoexcluir = createAutoexcluirUseCase({ repository });
const atestarMaioridade = createAtestarMaioridadeUseCase({ repository });

/** Único ponto que vê usecases e repositório juntos — a rota só enxerga este objeto. */
export const jogoResponsavelDi = {
  consultar: (userId: string) => consultar.execute(userId),
  atualizarLimites: (input: AtualizarLimitesInput) => atualizarLimites.execute(input),
  autoexcluir: (input: AutoexcluirInput) => autoexcluir.execute(input),
  atestarMaioridade: (userId: string) => atestarMaioridade.execute(userId),
  erro: erroJogoResponsavel,
};
