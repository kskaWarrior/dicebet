import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyOptions } from "jose";
import { db } from "./db.js";
import { env } from "./env.js";

/**
 * Porta de auth (ADR-0001 → roletafly ADR-0011): quem assina o token é
 * configuração — um JWKS ou um segredo HS256 (GoTrue local ou hospedado). O que
 * a API exige do token é só o `sub` (identidade) e, se houver, o `email`
 * (username inicial).
 */
const key = env.auth.jwksUrl
  ? createRemoteJWKSet(new URL(env.auth.jwksUrl))
  : new TextEncoder().encode(env.auth.jwtSecret);

const verifyOptions: JWTVerifyOptions = {
  ...(env.auth.audience ? { audience: env.auth.audience } : {}),
  ...(env.auth.issuer ? { issuer: env.auth.issuer } : {}),
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export interface TokenIdentity {
  userId: string;
  username: string;
}

/** Verifica o access token, devolvendo a identidade ou null. */
export async function verifyToken(token: string): Promise<TokenIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1], verifyOptions);
    return identityFrom(payload);
  } catch {
    return null;
  }
}

export function identityFrom(payload: JWTPayload): TokenIdentity | null {
  if (typeof payload.sub !== "string") return null;
  const email = typeof payload.email === "string" ? payload.email : null;
  return { userId: payload.sub, username: email ? email.split("@")[0]! : payload.sub.slice(0, 8) };
}

// Bootstrap do jogador (profile, carteira com boas-vindas) em toda requisição
// autenticada — substitui o trigger em `auth.users`. A RPC é idempotente e
// barata (lock + um `exists`); sem cache por processo de propósito: um
// `migrate --reset` com a API no ar re-bootstrapa sozinho.
export async function ensurePlayer({ userId, username }: TokenIdentity): Promise<void> {
  await db.query("select public.ensure_player($1, $2)", [userId, username]);
}

/** Verifica o Bearer token e garante que o jogador existe no banco. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "MISSING_TOKEN" });
  }
  const identity = await verifyToken(header.slice(7));
  if (!identity) return res.status(401).json({ error: "INVALID_TOKEN" });
  await ensurePlayer(identity);
  req.userId = identity.userId;
  next();
}
