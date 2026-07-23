-- Atomically claims the next nonce for a seed pair, so concurrent bets from
-- the same user can never reuse a nonce.
create or replace function public.use_next_nonce(p_seed_id uuid)
returns integer
language sql
security definer set search_path = public
as $$
  update public.user_seeds
  set nonce = nonce + 1
  where id = p_seed_id and active
  returning nonce - 1;
$$;
