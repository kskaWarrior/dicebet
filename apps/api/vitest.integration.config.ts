import { defineConfig } from "vitest/config";

// Suíte contra Postgres real (o `postgres` do docker-compose do repo `rgs`, porta 57332),
// rodada separada do unit run default via `npm run test:integration`, que aplica as
// migrations do zero antes (schema `rgs` do pacote e depois `dicebet`).
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:57332/rgs",
      // auth.integration.test.ts assina tokens com este segredo e importa
      // src/auth.ts, que exige a config de auth no import (env.ts).
      AUTH_JWT_SECRET: "segredo-de-teste",
      AUTH_AUDIENCE: "authenticated",
      // E13: exigido pelo módulo `sessao` (POST /sessions), importado por app.ts/di.ts.
      RGS_SESSION_SECRET: "segredo-de-sessao-de-teste",
    },
  },
});
