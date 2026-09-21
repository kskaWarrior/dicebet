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

export interface SeedParaAposta {
  id: string;
  server_seed_hash: string;
  client_seed: string;
}

export type FundType = "real" | "bonus" | "free_round";

export interface BetRow {
  id: string;
  user_id: string;
  seed_id: string;
  stake: number;
  target: number;
  roll: number;
  payout: number;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  fund_type: FundType;
  created_at: string;
}

export interface FreeRoundAtiva {
  id: string;
  stakeCents: number;
  roundsRestantes: number;
  expiresAt: string;
}

export interface PlaceBetInput {
  userId: string;
  stake: number;
  target: number;
  freeRoundId?: string;
}

export interface PlaceBetResult {
  bet: BetRow;
  win: boolean;
  multiplier: number;
  balance: number | null;
  freeRound?: { roundsRestantes: number };
}
