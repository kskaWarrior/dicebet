import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { SignJWT } from "jose";
import { afterAll, describe, expect, it } from "vitest";
import { requireAuth } from "../src/shared/auth.js";
import { deleteTestUser, getBalance, ledgerDe, sql } from "./helpers/db-teste.js";

// "Usuário novo faz o primeiro GET /wallet e recebe o bônus de boas-vindas".
// Exercita `requireAuth` de verdade — token HS256 assinado com o AUTH_JWT_SECRET
// do vitest.integration.config.ts — contra o Postgres real, sem subir o Express:
// o middleware é o que liga token a jogador.
const segredo = new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);

const token = (sub: string, email?: string) =>
  new SignJWT({ ...(email ? { email } : {}), aud: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(segredo);

async function passarPeloMiddleware(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as Request;
  let status: number | undefined;
  let body: unknown;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  } as unknown as Response;
  let passou = false;
  const next: NextFunction = () => {
    passou = true;
  };
  await requireAuth(req, res, next);
  return { passou, status, body, userId: req.userId };
}

describe("requireAuth contra Postgres real", () => {
  const criados: string[] = [];
  afterAll(async () => {
    for (const id of criados) await deleteTestUser(id);
  });

  it("primeira requisição de um jogador novo cria a carteira com $10 de boas-vindas", async () => {
    const sub = randomUUID();
    criados.push(sub);
    const r = await passarPeloMiddleware(`Bearer ${await token(sub, "novo@dicebet.test")}`);

    expect(r.passou).toBe(true);
    expect(r.userId).toBe(sub);
    expect(await getBalance(sub)).toBe(1000);
    const { rows } = await sql.query("select username from dicebet.profiles where id = $1", [sub]);
    expect(rows[0]!.username).toBe("novo");
  });

  it("requisições concorrentes do mesmo jogador novo não duplicam o bônus nem falham", async () => {
    const sub = randomUUID();
    criados.push(sub);
    const bearer = `Bearer ${await token(sub, "paralelo@dicebet.test")}`;
    const resultados = await Promise.all(Array.from({ length: 5 }, () => passarPeloMiddleware(bearer)));

    expect(resultados.every((r) => r.passou)).toBe(true);
    expect(await getBalance(sub)).toBe(1000);
    const refs = (await ledgerDe(sub)).map((l) => l.ref_id);
    expect(refs.filter((r) => r.startsWith("welcome:"))).toHaveLength(1);
  });

  it("username colidindo com outro jogador ganha sufixo do id", async () => {
    const a = randomUUID();
    const b = randomUUID();
    criados.push(a, b);
    await passarPeloMiddleware(`Bearer ${await token(a, "colisao@dicebet.test")}`);
    const r = await passarPeloMiddleware(`Bearer ${await token(b, "colisao@outro.test")}`);
    expect(r.passou).toBe(true);
    const { rows } = await sql.query("select username from dicebet.profiles where id = $1", [b]);
    expect(rows[0]!.username).toBe(`colisao-${b.slice(0, 8)}`);
  });

  it("token sem `email` ainda ganha um username", async () => {
    const sub = randomUUID();
    criados.push(sub);
    await passarPeloMiddleware(`Bearer ${await token(sub)}`);
    const { rows } = await sql.query("select username from dicebet.profiles where id = $1", [sub]);
    expect(rows[0]!.username).toBe(sub.slice(0, 8));
  });

  it("rejeita token ausente, assinatura errada e audience errada sem tocar no banco", async () => {
    expect((await passarPeloMiddleware()).status).toBe(401);

    const outroSegredo = new TextEncoder().encode("outro");
    const forjado = await new SignJWT({ aud: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(randomUUID())
      .setExpirationTime("5m")
      .sign(outroSegredo);
    expect((await passarPeloMiddleware(`Bearer ${forjado}`)).body).toEqual({ error: "INVALID_TOKEN" });

    const sub = randomUUID();
    const audErrada = await new SignJWT({ aud: "outra" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(sub)
      .setExpirationTime("5m")
      .sign(segredo);
    expect((await passarPeloMiddleware(`Bearer ${audErrada}`)).status).toBe(401);
    const { rows } = await sql.query("select 1 from dicebet.profiles where id = $1", [sub]);
    expect(rows).toHaveLength(0);
  });
});
