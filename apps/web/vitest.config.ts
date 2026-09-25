import { defineConfig } from "vitest/config";

// Unitários do web: só funções puras de `shared/` (sem Nuxt, sem jsdom) — o que dá para
// testar sem montar componente. O `vitest` vem hoisted da raiz (devDependency da API).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
