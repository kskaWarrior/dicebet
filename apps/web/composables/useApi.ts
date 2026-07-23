/** $fetch against the Cloud Run API with the Supabase access token attached. */
export function useApi() {
  const config = useRuntimeConfig();
  const supabase = useSupabase();

  return async <T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      navigateTo("/login");
      throw new Error("not authenticated");
    }
    return $fetch<T>(`${config.public.apiBase}${path}`, {
      ...options,
      headers: { ...(options.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  };
}

export function useBalance() {
  // cents; null until first load
  return useState<number | null>("balance", () => null);
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
