import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env.js";

// Supabase signs access tokens with asymmetric keys (ES256); the public keys
// are served at the project's JWKS endpoint. jose caches them between calls.
const jwks = createRemoteJWKSet(
  new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`),
);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Verifies the Supabase access token sent as a Bearer token. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "MISSING_TOKEN" });
  }
  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, {
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string") throw new Error("no sub");
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
}
