-- E11 (rgs) — `dicebet.replay_dados`: contrato comum `<jogo>.replay_dados(operator_id,
-- round_id)` que a spec `roletafly/docs/specs/e11-retaguarda-operador.md` define para o
-- `rgs-api` (US9/US10/US18). Segundo jogo a implementar (depois de roletafly,
-- roletafly/db/migrations/20260920000001_replay_dados.sql) — mesmo padrão: recalcula em
-- SQL (pgcrypto hmac), testado contra vetores de ouro gerados a partir de
-- `apps/api/src/fair.ts` (este repo não tinha golden vectors antes, achado ao escrever
-- este épico — critério de aceite da spec E11 não exigia consertar essa dívida, mas gerar
-- vetores era necessário de qualquer forma para validar a reimplementação em SQL).
--
-- Entrada: `round_id` no formato `seed_id:nonce` (o mesmo de `round.settled`, ver
-- `db/migrations/0005_evento_round_settled.sql`, linha 77).
--
-- DiceBet não tem `operator_id` por linha (fora de escopo do E7 aqui, ver comentário em
-- 0005_evento_round_settled.sql) — só existe o operador `demo` hoje. ATENÇÃO (achado do
-- code-review, Spec): a checagem `operador_atual() = p_operator_id` aqui NÃO é a mesma
-- proteção que no roletafly — lá a RLS de `roleta_giros`/`user_seeds` filtra linhas de
-- verdade por operador (US15); aqui, sem RLS (`dicebet.bets`/`user_seeds` não têm
-- `operator_id`, logo não têm policy), a checagem só confirma que quem chama está
-- autenticado como ALGUM operador válido — não impede ler round_id de outro operador se
-- um dia existir mais de um. Inofensivo hoje (só existe `demo`, e popular um segundo
-- operador é Out of Scope desta spec), mas é uma limitação real do jogo, não resolvida
-- por este épico — herdada de toda leitura já existente em `dicebet.bets`, não introduzida
-- por este replay.
create extension if not exists pgcrypto;

create or replace function dicebet.replay_dados(p_operator_id uuid, p_round_id text)
returns table (proof_material jsonb, params jsonb)
language plpgsql stable set search_path = dicebet, public, pg_temp as $$
declare
  v_seed_id uuid;
  v_nonce integer;
  v_bet dicebet.bets%rowtype;
  v_seed dicebet.user_seeds%rowtype;
  v_digest bytea;
  v_n bigint;
  v_roll_recalculado numeric(5, 2);
begin
  if rgs.operador_atual() is distinct from p_operator_id then
    raise exception 'operador não confere' using errcode = 'insufficient_privilege';
  end if;

  begin
    v_seed_id := split_part(p_round_id, ':', 1)::uuid;
    v_nonce := split_part(p_round_id, ':', 2)::integer;
  exception when others then
    raise exception 'INVALID_ROUND_ID';
  end;

  select * into v_bet from dicebet.bets where seed_id = v_seed_id and nonce = v_nonce;
  if not found then raise exception 'UNKNOWN_ROUND'; end if;

  select * into v_seed from dicebet.user_seeds where id = v_seed_id;
  if not found then raise exception 'UNKNOWN_SEED'; end if;

  -- HMAC-SHA256(chave=server_seed, mensagem="clientSeed:nonce") — mesma ordem de
  -- `createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}`)` em fair.ts.
  v_digest := hmac((v_seed.client_seed || ':' || v_nonce::text)::bytea, v_seed.server_seed::bytea, 'sha256');

  -- Primeiros 4 bytes como uint32 big-endian (`digest.readUInt32BE(0)`), depois o mesmo
  -- mapeamento para [0,100) com 2 casas: floor(n/2^32 * 10000) / 100.
  v_n := (get_byte(v_digest, 0)::bigint << 24) | (get_byte(v_digest, 1)::bigint << 16)
       | (get_byte(v_digest, 2)::bigint << 8) | get_byte(v_digest, 3)::bigint;
  v_roll_recalculado := floor(v_n::numeric / 4294967296::numeric * 10000) / 100;

  proof_material := jsonb_build_object(
    'serverSeed', v_seed.server_seed,
    'serverSeedHash', v_seed.server_seed_hash,
    'clientSeed', v_seed.client_seed
  );
  params := jsonb_build_object(
    'nonce', v_nonce,
    'rollPago', v_bet.roll,
    'rollRecalculado', v_roll_recalculado,
    'bate', v_roll_recalculado = v_bet.roll
  );
  return next;
end $$;
comment on function dicebet.replay_dados(uuid, text) is
  'Contrato <jogo>.replay_dados do E11 (rgs): recalcula o roll a partir do par seed/nonce do round_id e devolve o veredito em params.bate. Chamado pelo rgs-api com o role rgs_api.';

-- `public` (onde pgcrypto mora) não concede USAGE a PUBLIC por padrão neste banco (mesmo
-- achado do roletafly: "permission denied for schema public") — sem isto, `replay_dados`
-- falha para QUALQUER chamador que não seja dono/superusuário, mesmo com `public` no
-- `search_path` da função (invoker rights: quem executa precisa do próprio grant).
-- `dicebet_api` é quem os testes de integração usam.
grant usage on schema public to dicebet_api;
grant execute on function public.hmac(bytea, bytea, text) to dicebet_api;

-- Grants cruzados novos (rgs_api lendo o schema do jogo — sentido oposto do usual, mesmo
-- achado do roletafly): usage em public (pgcrypto mora lá) + execute em hmac() + acesso
-- mínimo às duas tabelas que o replay usa + execute na própria função.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rgs_api') then
    grant usage on schema public to rgs_api;
    grant execute on function public.hmac(bytea, bytea, text) to rgs_api;
    grant usage on schema dicebet to rgs_api;
    grant select on dicebet.bets, dicebet.user_seeds to rgs_api;
    grant execute on function dicebet.replay_dados(uuid, text) to rgs_api;
  end if;
end $$;
