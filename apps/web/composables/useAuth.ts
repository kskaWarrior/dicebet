import { GoTrueClient } from "@supabase/auth-js";

// Porta de auth do web (ADR-0001 → roletafly ADR-0011): o único lugar que sabe
// QUEM emite o token. Localmente é o GoTrue sozinho (docker-compose, raiz em
// NUXT_PUBLIC_AUTH_URL); o cliente é o mesmo que o supabase-js embrulhava,
// apontado para a raiz em vez de `/auth/v1`. Singleton no nível do módulo,
// como o antigo useSupabase.
let client: GoTrueClient | null = null;

export function useAuth(): GoTrueClient {
  if (!client) {
    const config = useRuntimeConfig();
    client = new GoTrueClient({
      url: config.public.authUrl,
      autoRefreshToken: true,
      persistSession: true,
      storageKey: "dicebet-auth",
    });
  }
  return client;
}
