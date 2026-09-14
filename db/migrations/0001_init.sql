-- Schema inicial do DiceBet: profiles, ledger da carteira, apostas, seeds provably-fair.
-- Todo valor monetário é inteiro em centavos. `wallets.balance` é estado derivado:
-- deve sempre ser igual a sum(transactions.amount) do usuário, garantido por toda
-- mudança de saldo acontecer dentro de place_bet/apply_deposit.
--
-- Postgres puro (ADR-0001 deste repo, que adota os ADRs 0010–0012 do roletafly):
-- não há `auth.users` — a identidade é o `sub` do token (GoTrue) e o jogador nasce
-- em `ensure_player`, chamado pela API na primeira requisição autenticada. Sem RLS
-- por jogador: só a API lê as tabelas, com o role `dicebet_api` (ver db/migrate.mjs).

create table if not exists public.profiles (
  id uuid primary key,
  username text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  type text not null check (type in ('deposit', 'bet', 'payout')),
  -- signed amount in cents: bets are negative, deposits/payouts positive
  amount bigint not null,
  balance_after bigint not null,
  -- external reference (e.g. Stripe session id) used for idempotency
  ref_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_idx on public.transactions (user_id, created_at desc);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
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

create index if not exists bets_user_idx on public.bets (user_id, created_at desc);

-- Provably-fair seed pairs. Managed exclusively by the API (role dicebet_api):
-- the plain server_seed must never be readable by clients until revealed.
create table if not exists public.user_seeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  server_seed text not null,
  server_seed_hash text not null,
  client_seed text not null,
  nonce integer not null default 0,
  active boolean not null default true,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists user_seeds_one_active_idx on public.user_seeds (user_id) where active;

-- ---------------------------------------------------------------------------
-- Bootstrap do jogador: profile + carteira + um pequeno saldo de boas-vindas
-- para a demo ser jogável antes de qualquer depósito (test-mode). Idempotente;
-- substitui o trigger `handle_new_user` em `auth.users`.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_player(p_user_id uuid, p_username text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  welcome constant bigint := 1000; -- $10.00 em centavos de demo
begin
  -- Duas instâncias da API podem receber a 1ª requisição do mesmo jogador ao
  -- mesmo tempo: o lock serializa por jogador, e a segunda vê o perfil pronto.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if exists (select 1 from public.profiles where id = p_user_id) then
    return;
  end if;

  -- Username colidindo com OUTRO jogador ganha sufixo do id (unique_violation
  -- só pode vir de username: o id já foi checado sob o lock).
  begin
    insert into public.profiles (id, username) values (p_user_id, p_username);
  exception when unique_violation then
    insert into public.profiles (id, username)
    values (p_user_id, p_username || '-' || left(p_user_id::text, 8));
  end;

  insert into public.wallets (user_id, balance)
  values (p_user_id, welcome);

  insert into public.transactions (user_id, type, amount, balance_after, ref_id)
  values (p_user_id, 'deposit', welcome, welcome, 'welcome:' || p_user_id);
end;
$$;

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
-- apply_deposit: idempotente em ref_id, então retentativas do webhook Stripe são seguras.
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
