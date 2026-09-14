export default defineNuxtConfig({
  // Modo SPA: o mesmo build estático roda no nginx local (docker-compose) e
  // embrulhado no Capacitor para mobile. Toda a lógica vive na API Express.
  ssr: false,
  compatibilityDate: "2026-07-01",
  runtimeConfig: {
    public: {
      // Overridable via NUXT_PUBLIC_* env vars at build time
      apiBase: "http://localhost:8080",
      // Raiz do GoTrue (porta de auth): local = o container do docker-compose
      authUrl: "http://127.0.0.1:52321",
    },
  },
  app: {
    head: {
      title: "DiceBet — provably fair dice (demo)",
      meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
    },
  },
});
