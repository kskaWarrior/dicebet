-- Jogo responsável no DiceBet — paridade com o roletafly (ADR-0003 deste repo, que
-- substitui o item 2 do ADR-0002). Até aqui o DiceBet não tinha limites do apostador,
-- autoexclusão nem atestação de maioridade; o dossiê de certificação E14
-- (docs/certificacao/04-mapeamento-normativo.md) marcava os três como "ausente".
--
-- Molde: roletafly `db/migrations/20260909000006_autoexclusao_nao_encurta.sql`
-- (autoexclusão não encurta), `20260909000008_carencia_afrouxar_limites.sql` (carência
-- de 24h ao afrouxar), `20260909000009_errata_zero_nao_e_sem_limite.sql` (só `null` é
-- "sem limite") e o bloco de limites de `settle_roulette_spin`
-- (`20260919000018_settle_fund_type.sql`). Adaptado ao DiceBet: o jogador é `user_id`
-- (sem o par operator_id/player_ref do E7) e não há limites por segmento de operador.
--
-- Como no roletafly, a guarda vive nas RPCs `security definer`, não na API: é ali que
-- ela não pode ser burlada. O role `dicebet_api` só LÊ `player_limits`/`audit_events`
-- (grant de `db/migrate.mjs`: select em todas as tabelas, execute em todas as funções).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table dicebet.player_limits (
  user_id uuid primary key references dicebet.profiles (id) on delete cascade,
  -- NULL = sem limite. Zero não existe (check): seria o limite mais apertado possível,
  -- não a ausência de limite — é a errata 20260909000009 do roletafly, aqui já no schema.
  max_stake_cents bigint check (max_stake_cents > 0),
  daily_loss_limit_cents bigint check (daily_loss_limit_cents > 0),
  daily_bet_limit_cents bigint check (daily_bet_limit_cents > 0),
  session_minutes_limit integer check (session_minutes_limit between 1 and 1440),
  self_excluded_until timestamptz,
  -- Sessão contínua (gap de 30 min), mantida por settle_bet a cada aposta aceita.
  session_started_at timestamptz,
  session_last_seen_at timestamptz,
  -- Relógio da carência: instante do último AFROUXAMENTO. `updated_at` não serve porque
  -- não distingue apertar de afrouxar.
  limits_loosened_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table dicebet.player_limits is
  'Limites de jogo responsável (Portaria SPA/MF 1.231/2024). NULL = sem limite; zero é '
  'recusado. Apertar vale na hora; afrouxar espera a carência global de 24h. '
  'Autoexclusão não encurta enquanto vigora. Escrita só pelas RPCs (20260925000002).';

-- Toda aposta já tem linha aqui depois do primeiro settle_bet; o backfill cobre quem já
-- existia, para o GET de limites devolver a forma completa desde já.
insert into dicebet.player_limits (user_id)
select id from dicebet.profiles
on conflict do nothing;

-- Trilha interna e imutável de decisões de jogo responsável (não sai pela rede — o que
-- sai é `round.settled`, rgs ADR-0005). Mesmo papel de `roleta.audit_events`.
create table dicebet.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_user_idx on dicebet.audit_events (user_id, created_at desc);

-- Atestação 18+ do lado do servidor (o gate da casca do web grava aqui ao confirmar).
alter table dicebet.profiles add column age_attested_at timestamptz;

-- ---------------------------------------------------------------------------
-- Carência ao afrouxar
-- ---------------------------------------------------------------------------

-- "Novo afrouxa o atual?" — `null` = sem limite, portanto:
--   * atual null -> já era irrestrito, nada afrouxa mais;
--   * novo  null -> virou "sem limite": o afrouxamento MÁXIMO;
--   * ambos      -> maior é mais frouxo.
create or replace function dicebet.afrouxa_limite(atual bigint, novo bigint)
returns boolean
language sql
immutable
as $$
  select case
    when atual is null then false
    when novo is null then true
    else novo > atual
  end;
$$;

-- Coluna calculada: o prazo da carência mora num lugar só. A RPC abaixo consulta esta
-- mesma função e a API a devolve pronta ao web. Null (nunca afrouxou) = pode agora.
-- O "24 horas" escrito por extenso em `apps/web/composables/useI18n.ts` precisa mudar
-- junto se o intervalo mudar.
create or replace function dicebet.limits_loosenable_at(l dicebet.player_limits)
returns timestamptz
language sql
stable
as $$
  select l.limits_loosened_at + interval '24 hours';
$$;

create or replace function dicebet.set_player_limits(
  p_user_id uuid,
  p_max_stake bigint,
  p_daily_loss bigint,
  p_daily_bet bigint,
  p_session_minutes integer
)
returns void
language plpgsql
security definer set search_path = dicebet, pg_temp
as $$
declare
  v_atual dicebet.player_limits;
  v_afrouxa boolean;
begin
  -- Mesma regra do check da tabela, com um código que a API mapeia (em vez de um 23514).
  if p_max_stake <= 0 or p_daily_loss <= 0 or p_daily_bet <= 0
     or p_session_minutes < 1 or p_session_minutes > 1440 then
    raise exception 'INVALID_LIMIT';
  end if;

  insert into dicebet.player_limits (user_id) values (p_user_id) on conflict do nothing;
  select * into v_atual from dicebet.player_limits where user_id = p_user_id for update;

  -- Carência GLOBAL: afrouxar qualquer um dos quatro tranca os quatro (por limite, daria
  -- para afrouxar tudo em quatro pedidos escalonados). Recusa, não agenda.
  v_afrouxa :=
       dicebet.afrouxa_limite(v_atual.max_stake_cents, p_max_stake)
    or dicebet.afrouxa_limite(v_atual.daily_loss_limit_cents, p_daily_loss)
    or dicebet.afrouxa_limite(v_atual.daily_bet_limit_cents, p_daily_bet)
    or dicebet.afrouxa_limite(v_atual.session_minutes_limit, p_session_minutes);

  if v_afrouxa and now() < dicebet.limits_loosenable_at(v_atual) then
    raise exception 'LOOSENING_TOO_SOON';
  end if;

  update dicebet.player_limits
  set max_stake_cents = p_max_stake,
      daily_loss_limit_cents = p_daily_loss,
      daily_bet_limit_cents = p_daily_bet,
      session_minutes_limit = p_session_minutes,
      -- Só o afrouxamento reinicia o relógio: apertar não pode prender quem depois quiser
      -- afrouxar de boa-fé.
      limits_loosened_at = case when v_afrouxa then now() else v_atual.limits_loosened_at end,
      updated_at = now()
  where user_id = p_user_id;

  insert into dicebet.audit_events (user_id, event, detail)
  values (p_user_id, 'limits_changed', jsonb_build_object(
    'max_stake', p_max_stake, 'daily_loss', p_daily_loss,
    'daily_bet', p_daily_bet, 'session_minutes', p_session_minutes,
    'loosened', v_afrouxa));
end;
$$;

-- ---------------------------------------------------------------------------
-- Autoexclusão: estender pode sempre, encurtar nunca (enquanto vigora)
-- ---------------------------------------------------------------------------
create or replace function dicebet.self_exclude(p_user_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer set search_path = dicebet, pg_temp
as $$
begin
  if p_until is null or p_until <= now() then
    raise exception 'INVALID_PERIOD';
  end if;

  insert into dicebet.player_limits (user_id) values (p_user_id) on conflict do nothing;

  -- Só compara contra exclusão EM VIGOR: uma vencida é história, e exigir que a nova a
  -- supere trancaria o jogador para sempre depois da primeira vez.
  if exists (
    select 1 from dicebet.player_limits
    where user_id = p_user_id
      and self_excluded_until is not null
      and self_excluded_until > now()
      and self_excluded_until > p_until
  ) then
    raise exception 'SHORTENING_SELF_EXCLUSION';
  end if;

  update dicebet.player_limits
  set self_excluded_until = p_until, updated_at = now()
  where user_id = p_user_id;

  insert into dicebet.audit_events (user_id, event, detail)
  values (p_user_id, 'self_excluded', jsonb_build_object('until', p_until));
end;
$$;

-- ---------------------------------------------------------------------------
-- Atestação de maioridade: guarda a PRIMEIRA declaração (idempotente)
-- ---------------------------------------------------------------------------
create or replace function dicebet.attest_age(p_user_id uuid)
returns timestamptz
language plpgsql
security definer set search_path = dicebet, pg_temp
as $$
declare
  v_em timestamptz;
begin
  update dicebet.profiles
  set age_attested_at = coalesce(age_attested_at, now())
  where id = p_user_id
  returning age_attested_at into v_em;

  if v_em is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  insert into dicebet.audit_events (user_id, event, detail)
  values (p_user_id, 'age_attested', jsonb_build_object('at', v_em));
  return v_em;
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_bet aplica os limites (mesma assinatura de 11 argumentos da 0005: `create or
-- replace` basta, sem drop, e o grant de db/migrate.mjs continua batendo)
-- ---------------------------------------------------------------------------
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
  session_gap constant interval := interval '30 minutes';
  v_limits dicebet.player_limits;
  v_session_start timestamptz;
  v_daily_bets bigint;
  v_daily_net bigint;
  v_bet_id uuid;
begin
  perform dicebet.validate_bet(p_stake);
  if p_payout < 0 then
    raise exception 'INVALID_STAKE';
  end if;
  if p_fund_type not in ('real', 'bonus', 'free_round') then
    raise exception 'INVALID_FUND_TYPE';
  end if;

  -- Limites de jogo responsável. A linha é criada se faltar e travada: duas apostas
  -- simultâneas do mesmo jogador somariam os diários sem ver uma à outra. O débito já
  -- aconteceu (saga); um `raise` aqui faz a saga estornar.
  insert into dicebet.player_limits (user_id) values (p_user_id) on conflict do nothing;
  select * into v_limits from dicebet.player_limits where user_id = p_user_id for update;

  if v_limits.self_excluded_until is not null and v_limits.self_excluded_until > now() then
    raise exception 'SELF_EXCLUDED';
  end if;

  v_session_start := case
    when v_limits.session_started_at is null
      or v_limits.session_last_seen_at is null
      or now() - v_limits.session_last_seen_at > session_gap
    then now()
    else v_limits.session_started_at
  end;

  if v_limits.session_minutes_limit is not null
     and now() - v_session_start >= make_interval(mins => v_limits.session_minutes_limit) then
    raise exception 'SESSION_LIMIT';
  end if;

  if v_limits.max_stake_cents is not null and p_stake > v_limits.max_stake_cents then
    raise exception 'LIMIT_EXCEEDED';
  end if;

  -- Os diários somam `dicebet.bets` das últimas 24h (janela móvel, como o roletafly). A
  -- aposta corrente ainda não foi inserida, então a soma a exclui por construção.
  if v_limits.daily_bet_limit_cents is not null then
    select coalesce(sum(b.stake), 0) into v_daily_bets
    from dicebet.bets b
    where b.user_id = p_user_id and b.created_at >= now() - interval '24 hours';
    if v_daily_bets + p_stake > v_limits.daily_bet_limit_cents then
      raise exception 'LIMIT_EXCEEDED';
    end if;
  end if;
  if v_limits.daily_loss_limit_cents is not null then
    select coalesce(sum(b.payout - b.stake), 0) into v_daily_net
    from dicebet.bets b
    where b.user_id = p_user_id and b.created_at >= now() - interval '24 hours';
    -- Pior caso: a aposta corrente perdida por inteiro.
    if -(v_daily_net - p_stake) > v_limits.daily_loss_limit_cents then
      raise exception 'LIMIT_EXCEEDED';
    end if;
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

  -- Sessão só avança em aposta aceita.
  update dicebet.player_limits
  set session_started_at = v_session_start, session_last_seen_at = now()
  where user_id = p_user_id;

  if p_event_id is not null then
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

-- Grants: db/migrate.mjs (select em todas as tabelas, execute em todas as funções do
-- schema, `revoke ... from public` antes).
