-- Aposta mínima de R$ 0,50 (50 centavos) — paridade com o piso dos jogos irmãos e,
-- sobretudo, conserto do achado do dossiê E14 (docs/certificacao/02-memorial-rtp.md):
-- com o mínimo antigo de 1 centavo, o `floor(stake · 99/alvo)` perdia até 1 centavo por
-- vitória e deixava o RTP do pior alvo abaixo do piso de 85 % da Portaria SPA/MF
-- 1.207/2024, Art. 28, para stakes de 1 a 6 centavos. Com 50 centavos o pior caso é
-- 97,06 % (alvo 97,06: paga 50 e devolve só a stake).
--
-- `validate_bet` é a autoridade: a API chama antes do débito (um stake inválido não
-- custa débito + estorno) e `settle_bet` chama de novo dentro da liquidação. O zod da
-- rota usa `MIN_STAKE_CENTS`/`MAX_STAKE_CENTS` de `calcular-resultado.usecase.ts`, e um
-- teste unitário (`stake.usecase.test.ts`) prende este arquivo aos mesmos números.
--
-- O teto de 100 000 centavos entra aqui também: antes só a rota o aplicava, e quem
-- chamasse a RPC direto passava por cima.
--
-- Mesma assinatura (bigint), então `create or replace` basta — nada a dropar, e o grant
-- de `db/migrate.mjs` continua batendo.
--
-- Rodadas grátis passam pelo mesmo `validate_bet`: uma campanha com stake travada abaixo
-- de 50 centavos passa a ser recusada com INVALID_STAKE (não há hoje campanha assim no
-- operador demo).
create or replace function dicebet.validate_bet(p_stake bigint)
returns void
language plpgsql immutable
set search_path = pg_temp
as $$
begin
  if p_stake is null or p_stake < 50 or p_stake > 100000 then
    raise exception 'INVALID_STAKE';
  end if;
end;
$$;
