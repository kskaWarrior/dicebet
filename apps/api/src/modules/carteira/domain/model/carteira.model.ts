export type TipoTransacao = "welcome" | "refill" | "bet" | "payout" | "rollback" | "outro";

export interface LedgerEntry {
  id: string;
  type: TipoTransacao;
  amount: number;
  balance_after: number;
  created_at: string;
}

export interface Carteira {
  balance: number;
  transactions: LedgerEntry[];
}
