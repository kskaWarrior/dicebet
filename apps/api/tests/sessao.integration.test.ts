import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ErroConfiguracao, OPERADOR_DEMO_ID } from "@kskawarrior/rgs-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.js";
import { abrirSessao } from "../src/modules/sessao/di.js";

/**
 * `POST /sessions` (E13): novo e aditivo — não substitui `requireAuth`/GoTrue em
 * bets/seeds/wallet, que continuam fora deste fluxo (ver handoff desta rodada).
 *
 * Sem um operador cadastrado em `rgs.operator_configs` para o jogo `dicebet`, o caminho
 * feliz (token de lançamento válido → sessão emitida) não é testável aqui sem duplicar o
 * seed de operador de outro repositório — por isso a suíte cobre os dois erros que a rota
 * emite antes de chamar o `authenticate` do operador (validação do corpo e "demo exige
 * login"), pelo HTTP, e o `OPERATOR_NOT_CONFIGURED`, chamando `abrirSessao` (o `di`) da
 * MESMA forma que a rota chama — não uma reimplementação.
 */
let server: Server;
let base: string;

beforeAll(async () => {
  server = criarApp().listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

describe("POST /sessions", () => {
  it("recusa corpo inválido", async () => {
    const r = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "INVALID_BODY" });
  });

  it("recusa o operador demo (exige login por GoTrue, não lançamento)", async () => {
    const r = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operator: OPERADOR_DEMO_ID, launchToken: "qualquer" }),
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "DEMO_REQUIRES_AUTH" });
  });

  it("recusa operador ausente", async () => {
    const r = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ launchToken: "qualquer" }),
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "DEMO_REQUIRES_AUTH" });
  });
});

describe("abrirSessao (di) contra Postgres real", () => {
  it("um operador sem configuração para o jogo dicebet dispara ErroConfiguracao", async () => {
    const operadorInexistente = randomUUID();
    await expect(
      abrirSessao({ operatorId: operadorInexistente, launchToken: "token" }),
    ).rejects.toBeInstanceOf(ErroConfiguracao);
  });
});
