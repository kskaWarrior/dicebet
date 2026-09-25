-- Só documentação, sem mudança de comportamento. A 20260925000002 já foi aplicada e não
-- se edita; o esclarecimento pedido na revisão entra como COMMENT no catálogo.
--
-- O `if` de INVALID_LIMIT em `set_player_limits` depende da semântica de NULL do SQL:
-- `null <= 0` é NULL (não true), e `if NULL` não entra no ramo. Um argumento NULL
-- ("sem limite") passa, portanto, sem precisar de `is not null and ...` explícito; só um
-- valor presente e fora da faixa (<= 0, ou sessão fora de 1..1440) é recusado.
comment on function dicebet.set_player_limits(uuid, bigint, bigint, bigint, integer) is
  'Define os limites do apostador (carência global de 24h para afrouxar). INVALID_LIMIT '
  'usa a semântica de NULL: argumento NULL = sem limite e passa, porque null <= 0 não é '
  'true; só valor presente fora da faixa é recusado. Ver ADR-0003.';
