import { randomBytes } from "node:crypto";
import { supabase } from "./supabase.js";
import { generateServerSeed, hashServerSeed } from "./fair.js";

export interface SeedRow {
  id: string;
  user_id: string;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  active: boolean;
  revealed_at: string | null;
}

export async function getOrCreateActiveSeed(userId: string): Promise<SeedRow> {
  const { data } = await supabase
    .from("user_seeds")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (data) return data as SeedRow;

  const serverSeed = generateServerSeed();
  const { data: created, error } = await supabase
    .from("user_seeds")
    .insert({
      user_id: userId,
      server_seed: serverSeed,
      server_seed_hash: hashServerSeed(serverSeed),
      client_seed: randomBytes(8).toString("hex"),
    })
    .select("*")
    .single();
  if (error) throw error;
  return created as SeedRow;
}

/** Deactivates + reveals the current seed and creates a fresh one. */
export async function rotateSeed(userId: string, clientSeed?: string) {
  const current = await getOrCreateActiveSeed(userId);
  const { error } = await supabase
    .from("user_seeds")
    .update({ active: false, revealed_at: new Date().toISOString() })
    .eq("id", current.id);
  if (error) throw error;

  const serverSeed = generateServerSeed();
  const { data: next, error: insertError } = await supabase
    .from("user_seeds")
    .insert({
      user_id: userId,
      server_seed: serverSeed,
      server_seed_hash: hashServerSeed(serverSeed),
      client_seed: clientSeed?.slice(0, 64) || randomBytes(8).toString("hex"),
    })
    .select("*")
    .single();
  if (insertError) throw insertError;

  return { revealed: current, next: next as SeedRow };
}

/** Claims the next nonce atomically (SQL: nonce = nonce + 1 returning old). */
export async function claimNonce(seedId: string): Promise<number> {
  const { data, error } = await supabase.rpc("use_next_nonce", { p_seed_id: seedId });
  if (error) throw error;
  if (data === null) throw new Error("SEED_NOT_ACTIVE");
  return data as number;
}
