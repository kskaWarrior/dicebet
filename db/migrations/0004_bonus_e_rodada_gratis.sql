-- Rollout E9 (bônus e rodadas grátis, plano da plataforma RGS) — DiceBet é o
-- primeiro dos 5 irmãos depois do piloto (roletafly). Camada de plataforma já
-- pronta em `rgs` (fund_type ampliado, rgs.bonus_wallets, rgs.free_rounds,
-- rgs.fundo_para_debito, rgs.free_round_consumir — nada a fazer lá). O que
-- falta é só o schema do JOGO: `fund_type` até `dicebet.bets` e `settle_bet`
-- recebendo e gravando `p_fund_type` (K.1: sem isso a coluna fica sempre no
-- default 'real' e a apuração separada de GGR promocional é impossível).
--
-- `settle_bet` ganha aridade nova (10 argumentos, era 9): a regra do rollout
-- (handoff 2026-09-19 do roletafly) é dropar a assinatura velha ANTES do
-- `create or replace`, senão a antiga sobrevive e o grant do migrate.mjs para
-- de bater com o que a API chama.

alter table dicebet.bets
  add column fund_type text not null default 'real'
    check (fund_type in ('real', 'bonus', 'free_round'));

-- Sem histórico de produção (demo local): backfill do default já cobre as
-- linhas existentes, nenhum dado real fica com o fundo errado.

drop function dicebet.settle_bet(uuid, uuid, integer, bigint, numeric, numeric, bigint, text, text);

create or replace function dicebet.settle_bet(
  p_user_id uuid,
  p_seed_id uuid,
  p_nonce integer,
  p_stake bigint,
  p_target numeric,
  p_roll numeric,
  p_payout bigint,
  p_seed_hash text,
  p_client_seed text,
  p_fund_type text
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
  if p_fund_type not in ('real', 'bonus', 'free_round') then
    raise exception 'INVALID_FUND_TYPE';
  end if;

  begin
    insert into dicebet.bets (user_id, seed_id, stake, target, roll, payout,
                               server_seed_hash, client_seed, nonce, fund_type)
    values (p_user_id, p_seed_id, p_stake, p_target, p_roll, p_payout,
            p_seed_hash, p_client_seed, p_nonce, p_fund_type)
    returning id into v_bet_id;
  exception when unique_violation then
    raise exception 'NONCE_ALREADY_USED';
  end;

  return query select v_bet_id, p_payout;
end;
$$;
