-- DiceBet initial schema: profiles, wallet ledger, bets, provably-fair seeds.
-- All money values are integer cents. The wallets.balance is derived state:
-- it must always equal sum(transactions.amount) for that user, enforced by
-- doing every balance change inside place_bet/apply_deposit.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('deposit', 'bet', 'payout')),
  -- signed amount in cents: bets are negative, deposits/payouts positive
  amount bigint not null,
  balance_after bigint not null,
  -- external reference (e.g. Stripe session id) used for idempotency
  ref_id text unique,
  created_at timestamptz not null default now()
);

create index transactions_user_idx on public.transactions (user_id, created_at desc);

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null default 'dice',
  stake bigint not null check (stake > 0),
  -- dice: win if roll < target; target in (0, 99), two decimals
  target numeric(5, 2) not null,
  roll numeric(5, 2) not null,
  payout bigint not null default 0,
  server_seed_hash text not null,
  client_seed text not null,
  nonce integer not null,
  created_at timestamptz not null default now()
);

create index bets_user_idx on public.bets (user_id, created_at desc);

-- Provably-fair seed pairs. Managed exclusively by the API (service role):
-- the plain server_seed must never be readable by clients until revealed.
create table public.user_seeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  server_seed text not null,
  server_seed_hash text not null,
  client_seed text not null,
  nonce integer not null default 0,
  active boolean not null default true,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index user_seeds_one_active_idx on public.user_seeds (user_id) where active;

-- ---------------------------------------------------------------------------
-- Row Level Security: clients may read their own rows. All writes go through
-- the API using the service role key (which bypasses RLS), so no insert/update
-- policies are defined.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.bets enable row level security;
alter table public.user_seeds enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "read own wallet" on public.wallets
  for select using (auth.uid() = user_id);
create policy "read own transactions" on public.transactions
  for select using (auth.uid() = user_id);
create policy "read own bets" on public.bets
  for select using (auth.uid() = user_id);
-- user_seeds intentionally has no select policy: unrevealed server seeds
-- must stay secret. The API exposes the hash / revealed seeds explicitly.

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile + wallet + a small welcome balance so the demo
-- is playable before any (test-mode) deposit.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  welcome constant bigint := 1000; -- $10.00 in demo cents
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));

  insert into public.wallets (user_id, balance)
  values (new.id, welcome);

  insert into public.transactions (user_id, type, amount, balance_after, ref_id)
  values (new.id, 'deposit', welcome, welcome, 'welcome:' || new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- place_bet: the single atomic entry point for gameplay money movement.
-- The API computes roll/payout (provably fair), this function guarantees the
-- ledger invariant: stake deduction, payout credit, wallet update and the bet
-- row all commit together or not at all.
-- ---------------------------------------------------------------------------
create or replace function public.place_bet(
  p_user_id uuid,
  p_stake bigint,
  p_target numeric,
  p_roll numeric,
  p_payout bigint,
  p_seed_hash text,
  p_client_seed text,
  p_nonce integer
)
returns public.bets
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance bigint;
  v_bet public.bets;
begin
  if p_stake <= 0 then
    raise exception 'INVALID_STAKE';
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  if v_balance < p_stake then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  v_balance := v_balance - p_stake;
  insert into public.transactions (user_id, type, amount, balance_after)
  values (p_user_id, 'bet', -p_stake, v_balance);

  insert into public.bets (user_id, stake, target, roll, payout,
                           server_seed_hash, client_seed, nonce)
  values (p_user_id, p_stake, p_target, p_roll, p_payout,
          p_seed_hash, p_client_seed, p_nonce)
  returning * into v_bet;

  if p_payout > 0 then
    v_balance := v_balance + p_payout;
    insert into public.transactions (user_id, type, amount, balance_after, ref_id)
    values (p_user_id, 'payout', p_payout, v_balance, 'bet:' || v_bet.id);
  end if;

  update public.wallets
  set balance = v_balance, updated_at = now()
  where user_id = p_user_id;

  return v_bet;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_deposit: idempotent on ref_id so Stripe webhook retries are safe.
-- ---------------------------------------------------------------------------
create or replace function public.apply_deposit(
  p_user_id uuid,
  p_amount bigint,
  p_ref text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance bigint;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if exists (select 1 from public.transactions where ref_id = p_ref) then
    return; -- already applied
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  v_balance := v_balance + p_amount;

  insert into public.transactions (user_id, type, amount, balance_after, ref_id)
  values (p_user_id, 'deposit', p_amount, v_balance, p_ref);

  update public.wallets
  set balance = v_balance, updated_at = now()
  where user_id = p_user_id;
end;
$$;
