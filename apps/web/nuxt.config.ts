export default defineNuxtConfig({
  // SPA mode: the same static build deploys to Cloudflare Pages and wraps
  // in Capacitor for mobile. All logic lives in the Cloud Run API.
  ssr: false,
  compatibilityDate: "2026-07-01",
  runtimeConfig: {
    public: {
      // Overridable via NUXT_PUBLIC_* env vars at build time
      apiBase: "http://localhost:8080",
      supabaseUrl: "",
      supabaseAnonKey: "",
    },
  },
  app: {
    head: {
      title: "DiceBet — provably fair dice (demo)",
      meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
    },
  },
});
