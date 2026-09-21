import { db } from "../../shared/db.js";
import { createConsultarCarteiraUseCase } from "./domain/usecase/consultar-carteira.usecase.js";
import { createRecarregarUseCase } from "./domain/usecase/recarregar.usecase.js";
import { consultarCarteira, recarregar, RefillNotAllowed } from "./repository/carteira.repository.js";

const consultarCarteiraUseCase = createConsultarCarteiraUseCase({
  repository: { consultarCarteira: (userId) => consultarCarteira(db, userId) },
});

const recarregarUseCase = createRecarregarUseCase({
  repository: { recarregar: (userId) => recarregar(db, userId) },
});

export const carteiraDi = {
  consultar: (userId: string) => consultarCarteiraUseCase.execute(userId),
  recarregar: (userId: string) => recarregarUseCase.execute(userId),
  RefillNotAllowed,
};
