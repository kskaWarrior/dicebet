// @ts-check
import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

// Feature-first layering (mesmo molde de plinkofly/roletafly, eslint.config.mjs de lá):
// cada feature é uma PASTA (`apps/api/src/modules/<feature>/`, capturada como `feature`) —
// essa é a faceta "element". Dentro dela, domain/model -> domain/usecase -> repository ->
// di -> route é distinção de SUFIXO de arquivo — essa é a faceta "file" (`boundaries/files`).
const boundariesElements = [
  { type: "api-module", pattern: "apps/api/src/modules/*", capture: ["feature"] },
  { type: "api-shared", pattern: "apps/api/src/shared" },
];

const boundariesFiles = [
  { category: "domain-model", pattern: "**/domain/model/*.model.ts" },
  { category: "usecase", pattern: "**/domain/usecase/*.usecase.ts" },
  { category: "repository", pattern: "**/repository/*.repository.ts" },
  { category: "di", pattern: "**/di.ts" },
  { category: "route", pattern: "**/route/*.route.ts" },
];

// `{{from.element.captured.feature}}` restringe a policy à MESMA pasta de feature de quem
// importa (ex.: o usecase de aposta-dice só alcança o repositório da própria aposta-dice,
// nunca o de carteira) — a regra "sem import cross-feature", agora imposta pelo lint.
const sameFeatureLayer = (moduleType, category) => ({
  element: { type: moduleType, captured: { feature: "{{from.element.captured.feature}}" } },
  file: { categories: category },
});
const layer = (moduleType, category) => ({ element: { type: moduleType }, file: { categories: category } });
const sharedOf = (sharedType) => ({ element: { type: sharedType } });

const layerPolicies = (moduleType, sharedType) => [
  // di.ts é o único arquivo que pode ver usecase e repositório juntos — o resto só
  // alcança o repositório através do usecase em que ele é injetado.
  {
    from: layer(moduleType, "di"),
    allow: {
      to: [sameFeatureLayer(moduleType, "usecase"), sameFeatureLayer(moduleType, "repository"), sharedOf(sharedType)],
    },
  },
  {
    from: layer(moduleType, "usecase"),
    allow: {
      to: [sameFeatureLayer(moduleType, "domain-model"), sameFeatureLayer(moduleType, "repository"), sharedOf(sharedType)],
    },
  },
  {
    from: layer(moduleType, "repository"),
    allow: { to: [sameFeatureLayer(moduleType, "domain-model"), sharedOf(sharedType)] },
  },
  {
    from: layer(moduleType, "domain-model"),
    allow: { to: [sameFeatureLayer(moduleType, "domain-model"), sharedOf(sharedType)] },
  },
  // `shared` nunca aparece como `from` acima, então o fallback `default: "disallow"` o
  // impede de importar qualquer camada de feature — shared tem que continuar folha.
];

const boundariesPolicies = [
  ...layerPolicies("api-module", "api-shared"),
  {
    from: layer("api-module", "route"),
    allow: { to: [sameFeatureLayer("api-module", "di"), sharedOf("api-shared")] },
  },
];

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { languageOptions: { ecmaVersion: 2023, sourceType: "module" } },
  {
    files: ["**/*.ts"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // scripts/*.mjs e db/migrate.mjs rodam em Node >= 22 sem TypeScript, então o `no-undef`
    // do js.configs.recommended fica ligado e precisa conhecer os globais do runtime; sem o
    // pacote `globals` na raiz, a lista é explícita (mesmo molde de plinkofly/roletafly).
    files: ["scripts/**/*.mjs", "db/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
  },
  {
    files: ["apps/**/*.ts"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: true },
      "boundaries/elements": boundariesElements,
      "boundaries/files": boundariesFiles,
    },
    rules: {
      "boundaries/dependencies": ["error", { default: "disallow", policies: boundariesPolicies }],
    },
  },
);
