-- E10 (rollout aos irmãos) — a liquidação passa a emitir `round.settled` na outbox da
-- plataforma. Camada de plataforma já pronta no `rgs` (rgs.events, rgs.evento_registrar,
-- despachante) — nada a fazer lá; aqui é só o lado do jogo.
--
-- A emissão é DAQUI, e não da API depois do commit (decisão J.3 do piloto): é o que faz o
-- evento morrer junto com a aposta quando a liquidação dá rollback. Um
-- `NONCE_ALREADY_USED` levantado abaixo desfaz o insert e o evento com ele — que é a
-- propriedade que justificou a outbox (rgs ADR-0005).
--
-- `p_event_id` vem de FORA, gerado pelo `uuidv7()` do `@kskawarrior/rgs-core`, pela mesma
-- razão que o `txId` da carteira vem: o id é do FATO, não da tentativa, e quem retenta
-- reenvia o mesmo. Passar `null` continua valendo para quem não quer evento — aí é escolha,
-- não esquecimento, porque a aridade nova quebra alto em quem não foi atualizado.
--
-- O operador sai de `rgs.operador_atual()` (o `app.operator_id` que `comOperador` já seta
-- em toda transação) em vez de virar parâmetro novo: o DiceBet ainda identifica o jogador
-- por `user_id`, sem o par (operator_id, player_ref) do E7, e widenizar a assinatura aqui
-- seria antecipar esse épico sem precisar dele para emitir. Mesma escolha do LuckyTiger.
--
-- `sessionId` NÃO entra no payload: a sessão de jogo do RGS é do E7, que este jogo ainda
-- não tem. Emitir `null` só fingiria um dado que não existe. `target`/`roll` entram porque
-- são o vocabulário desta aposta — o equivalente ao `pocket` do piloto.

drop function dicebet.settle_bet(uuid, uuid, integer, bigint, numeric, numeric, bigint, text, text, text);

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
  p_fund_type text,
  p_event_id uuid
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

  -- O evento para o CRM do operador (E10). Sai pela rede, ao contrário de qualquer trilha
  -- interna do jogo (rgs ADR-0005).
  if p_event_id is not null then
    -- `evento_registrar` compara o operador do parâmetro com o da sessão e recusa se
    -- diferirem; passando o próprio `operador_atual()` essa comparação é tautológica, e é
    -- de propósito (ver cabeçalho). O que resta checar é o caso que a tautologia
    -- esconderia — `comOperador` esquecido, com `app.operator_id` nulo.
    if rgs.operador_atual() is null then
      raise exception 'SEM_OPERADOR' using errcode = 'insufficient_privilege';
    end if;
    perform rgs.evento_registrar(
      p_event_id, rgs.operador_atual(), 'dicebet', 'round.settled',
      jsonb_build_object(
        'roundId', p_seed_id::text || ':' || p_nonce::text,
        'betId', v_bet_id,
        'playerRef', p_user_id::text,
        'currency', 'BRL',
        'stakeMinor', p_stake,
        'payoutMinor', p_payout,
        'fundType', p_fund_type,
        'target', p_target,
        'roll', p_roll));
  end if;

  return query select v_bet_id, p_payout;
end;
$$;
