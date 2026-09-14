import { defineConfig } from "vitest/config";

// Suite unitária (sem banco), rodada pelo `npm test` default. Testes de
// integração (contra Postgres real) ficam de fora e vivem em
// vitest.integration.config.ts / `npm run test:integration`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
