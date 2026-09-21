import { carregarCarteiras, criarAbrirSessao } from "@kskawarrior/rgs-core";
import { db } from "../../shared/db.js";
import { env } from "../../shared/env.js";

export interface AbrirSessaoInput {
  operatorId: string;
  launchToken: string;
  locale?: string;
}

/**
 * Abre a sessão de jogo (E13): troca o token de lançamento do operador por uma sessão do
 * RGS. O usecase é do `rgs-core` (os jogos da plataforma montam a mesma rota sem
 * reimplementá-la); daqui vem só o gancho que provisiona o jogador NESTE jogo.
 *
 * Montado por CHAMADA, não no carregamento do módulo: `carregarCarteiras` lê
 * `rgs.operators`, e um operador cadastrado com a API no ar precisa valer sem reinício.
 * Abrir sessão é raro (uma vez por sessão, não por aposta), então a consulta extra não
 * está no caminho quente.
 *
 * Exceção de forma (ADR de boundaries desta migração, mesma exceção de plinkofly/roletafly):
 * `sessao` não tem domain/repository próprios — a lógica real vive inteira no `rgs-core`.
 *
 * Aditivo (E13): as rotas EXISTENTES (bets/seeds/wallet) não foram migradas para o token
 * de sessão emitido aqui — continuam em `requireAuth`/GoTrue (`shared/auth.ts`). Nada além
 * de `POST /sessions` passa a depender deste módulo.
 */
export async function abrirSessao({ operatorId, launchToken, locale }: AbrirSessaoInput) {
  const abrir = criarAbrirSessao({
    db,
    segredoJwt: env.sessionSecret,
    carteiraDe: await carregarCarteiras(db),
    // Ponto de entrada do jogador para quem chega via `/sessions`: cria o profile/carteira
    // do jeito que `shared/auth.ts#ensurePlayer` faz para quem chega via GoTrue. Reusa a
    // mesma RPC (`dicebet.ensure_player`) — o jogador é o mesmo conceito nos dois caminhos,
    // só a via de entrada difere (etapa 1 do rollout ainda não unificou as duas).
    aoAbrir: async (s) => {
      await db.comOperador(s.operatorId, (tx) =>
        tx.query("select dicebet.ensure_player($1, $2)", [s.playerRef, s.playerRef.slice(0, 8)]),
      );
    },
  });
  return abrir({ operatorId, game: env.game, launchToken, locale });
}
