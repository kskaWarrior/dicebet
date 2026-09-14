import { defineConfig } from "vitest/config";

// Suite contra Postgres real (o `postgres` do docker-compose, porta 52322),
// rodada separada do unit run default via `npm run test:integration`, que
// aplica as migrations do zero antes (`db/migrate.mjs --reset`).
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:52322/dicebet",
      // auth.integration.test.ts assina tokens com este segredo e importa
      // src/auth.ts, que exige a config de auth no import (env.ts).
      AUTH_JWT_SECRET: "segredo-de-teste",
      AUTH_AUDIENCE: "authenticated",
      // env.ts exige as chaves do Stripe; nenhum teste chama o Stripe.
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_dummy",
    },
  },
});
