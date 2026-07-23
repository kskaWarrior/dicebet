import type { NextFunction, Request, Response } from "express";
import { jwtVerify } from "jose";
import { env } from "./env.js";

const secret = new TextEncoder().encode(env.supabaseJwtSecret);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Verifies the Supabase access token (HS256) sent as a Bearer token. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "MISSING_TOKEN" });
  }
  try {
    const { payload } = await jwtVerify(header.slice(7), secret, {
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string") throw new Error("no sub");
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
}
