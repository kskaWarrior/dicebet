// Carrega ./.env em dev local; em container as env vars vêm da plataforma,
// então a ausência do arquivo é esperada.
try {
  process.loadEnvFile();
} catch {
  /* sem arquivo .env */
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

// Auth (ADR-0001 → roletafly ADR-0011): ou um JWKS (chaves assimétricas) ou um
// segredo HS256 compartilhado (GoTrue local). Exatamente um dos dois.
const jwksUrl = process.env.AUTH_JWKS_URL;
const jwtSecret = process.env.AUTH_JWT_SECRET;
if (!jwksUrl === !jwtSecret) {
  throw new Error("Defina exatamente um: AUTH_JWKS_URL ou AUTH_JWT_SECRET");
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: required("DATABASE_URL"),
  auth: {
    jwksUrl,
    jwtSecret,
    // GoTrue põe `authenticated` em `aud`. Opcional: sem valor, só a
    // assinatura e a expiração são checadas.
    audience: process.env.AUTH_AUDIENCE,
    issuer: process.env.AUTH_ISSUER,
  },
  // Lista separada por vírgula das origens permitidas (web + Capacitor)
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim()),
};
