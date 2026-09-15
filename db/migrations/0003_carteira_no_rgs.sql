-- Rollout RGS, etapa 1 — o dinheiro sai do DiceBet e vai para a plataforma
-- (rgs ADR-0003; ver docs/adr/0002-carteira-de-rgs.md deste repo). `wallets`/
-- `transactions`/`apply_deposit` morrem; a carteira do jogador da demo é
-- `rgs.demo_wallets` + `rgs.ledger`, movida pela saga (débito → liquidação →
-- crédito) do `@kskawarrior/rgs-core`, na MESMA transação desta liquidação.
--
-- `place_bet` vira `validate_bet` (sem efeitos, chamada ANTES do débito, defesa
-- em profundidade) + `settle_bet` (regra do jogo: guarda de replay e o registro
-- do bet — sem lock de carteira, sem ledger, isso saiu para a saga).
--
-- Na MESMA migration: schema `public` → `dicebet` (namespacing, como os irmãos
-- luckytiger/plinkofly/roletafly).
--
-- Delta em relação ao molde do LuckyTiger (`luckytiger/db/migrations/20260914000001_carteira_no_rgs.sql`):
-- o DiceBet nunca teve `player_limits`/autoexclusão (handoff 2026-09-14, ADR-0001
-- deste repo — só o mínimo que fazia o jogo rodar local, sem inventar RG que o
-- jogo nunca teve) — então `settle_bet` NÃO ganha checagem de limites diários;
-- seria escopo novo, não um delta desta migração. Se a plataforma exigir RG por
-- jogo mais adiante, é outra sessão.
--
-- `bets` ganha `seed_id` (não tinha — o replay dependia só do incremento em série
-- de `use_next_nonce`) com `unique (seed_id, nonce)`, no molde de
-- `luckytiger.spins`/`plinko.plinko_bets`/`roleta.roleta_giros`: dá um
-- `NONCE_ALREADY_USED` limpo em `settle_bet`, antes mesmo de a saga esbarrar no
-- `unique` de `rgs.wallet_ops`. Sem dado de produção a migrar (demo local): o
-- backfill abaixo só cobre o caso de já existir alguma linha de teste local.

create schema if not exists dicebet;

alter table public.profiles set schema dicebet;
alter table public.bets set schema dicebet;
alter table public.user_seeds set schema dicebet;

alter table dicebet.bets add column seed_id uuid references dicebet.user_seeds (id);
update dicebet.bets b set seed_id = (
  select s.id from dicebet.user_seeds s where s.user_id = b.user_id order by s.created_at limit 1
) where seed_id is null;
alter table dicebet.bets alter column seed_id set not null;
create unique index if not exists bets_seed_nonce_idx on dicebet.bets (seed_id, nonce);

drop function public.place_bet(uuid, bigint, numeric, numeric, bigint, text, text, integer);
drop function public.apply_deposit(uuid, bigint, text);
drop function public.ensure_player(uuid, text);
drop function public.use_next_nonce(uuid);
drop table public.transactions;
drop table public.wallets;

create or replace function dicebet.use_next_nonce(p_seed_id uuid)
returns integer
language sql
security definer set search_path = dicebet, pg_temp
as $$
  update dicebet.user_seeds
  set nonce = nonce + 1
  where id = p_seed_id and active
  returning nonce - 1;
$$;

-- O jogador nasce com carteira na plataforma (boas-vindas de $10,00 é do operador
-- demo, não mais uma linha desta migração — rgs.demo_ensure_wallet decide o valor
-- via o argumento que a API passa).
create or replace function dicebet.ensure_player(p_user_id uuid, p_username text)
returns void
language plpgsql
security definer set search_path = dicebet, rgs, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if exists (select 1 from dicebet.profiles where id = p_user_id) then
    return;
  end if;

  begin
    insert into dicebet.profiles (id, username) values (p_user_id, p_username);
  exception when unique_violation then
    insert into dicebet.profiles (id, username)
    values (p_user_id, p_username || '-' || left(p_user_id::text, 8));
  end;

  perform rgs.demo_ensure_wallet(p_user_id::text, 'USD', 1000);
end;
$$;

-- Recarga: a regra (só perto de zero) é do operador demo (rgs.demo_refill);
-- substitui o depósito Stripe (nenhum jogo irmão manteve um processador de
-- pagamento real depois de adotar a carteira da plataforma — ver ADR).
create or replace function dicebet.apply_refill(p_user_id uuid)
returns bigint
language plpgsql
security definer set search_path = dicebet, rgs, pg_temp
as $$
begin
  return rgs.demo_refill(p_user_id::text, 'USD');
end;
$$;

-- Validação barata da aposta, sem efeitos: a saga debita ANTES de liquidar,
-- então a API chama isto primeiro — um stake inválido não pode custar um
-- débito + estorno no operador. `settle_bet` chama de novo (defesa em
-- profundidade). Mesma checagem que `place_bet` antigo fazia sobre `p_stake`.
create or replace function dicebet.validate_bet(p_stake bigint)
returns void
language plpgsql immutable
set search_path = pg_temp
as $$
begin
  if p_stake <= 0 then
    raise exception 'INVALID_STAKE';
  end if;
end;
$$;

create or replace function dicebet.settle_bet(
  p_user_id uuid,
  p_seed_id uuid,
  p_nonce integer,
  p_stake bigint,
  p_target numeric,
  p_roll numeric,
  p_payout bigint,
  p_seed_hash text,
  p_client_seed text
)
returns table (bet_id uuid, payout bigint)
language plpgsql
security definer set search_path = dicebet, pg_temp
as $$
declare
  v_bet_id uuid;
begin
  perform dicebet.validate_bet(p_stake);
  if p_payout < 0 then
    raise exception 'INVALID_STAKE';
  end if;

  begin
    insert into dicebet.bets (user_id, seed_id, stake, target, roll, payout,
                               server_seed_hash, client_seed, nonce)
    values (p_user_id, p_seed_id, p_stake, p_target, p_roll, p_payout,
            p_seed_hash, p_client_seed, p_nonce)
    returning id into v_bet_id;
  exception when unique_violation then
    raise exception 'NONCE_ALREADY_USED';
  end;

  return query select v_bet_id, p_payout;
end;
$$;
