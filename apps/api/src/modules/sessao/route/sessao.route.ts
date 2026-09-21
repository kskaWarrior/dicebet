import { AbrirSessaoRequest, ErroConfiguracao, OPERADOR_DEMO_ID, rateLimit } from "@kskawarrior/rgs-core";
import { Router } from "express";
import { abrirSessao } from "../di.js";

/**
 * Troca o token de lançamento de um operador externo por uma sessão de jogo (E13).
 *
 * Só `POST /` (lançamento de operador) — dicebet não tem, hoje, um conceito de "login
 * demo" separado de `requireAuth` (GoTrue) como plinkofly/roletafly têm
 * (`requireLoginDemo` + `POST /sessions/demo`): a demo daqui sempre autenticou batendo o
 * Bearer token do GoTrue direto nas rotas de jogo (`shared/auth.ts#requireAuth`), sem um
 * passo de "trocar por sessão" no meio. Inventar esse fluxo agora seria escopo novo (auth
 * migration), fora do combinado desta rodada — ver handoff. `POST /sessions/demo` fica
 * para quando (se) a demo migrar para o token de sessão do RGS.
 */
export const sessaoRouter = Router();

sessaoRouter.use(rateLimit({ windowMs: 60_000, max: 10, keyFn: (req) => req.ip ?? "sem-ip" }));

sessaoRouter.post("/", async (req, res) => {
  const parsed = AbrirSessaoRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY" });
  const { operator, launchToken, locale } = parsed.data;
  if (!operator || operator === OPERADOR_DEMO_ID) return res.status(400).json({ error: "DEMO_REQUIRES_AUTH" });
  try {
    const { token, sessao } = await abrirSessao({ operatorId: operator, launchToken, locale });
    res.json({ token, currency: sessao.currency, locale: sessao.locale, expiresAt: sessao.expiresAt });
  } catch (e) {
    if (e instanceof ErroConfiguracao) return res.status(400).json({ error: "OPERATOR_NOT_CONFIGURED" });
    console.error("abrir sessao falhou", e);
    res.status(401).json({ error: "INVALID_LAUNCH_TOKEN" });
  }
});
