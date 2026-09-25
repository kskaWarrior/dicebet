import { afterAll, describe, expect, it } from "vitest";
import {
  createSeed,
  createTestUser,
  dbApi,
  deleteTestUser,
  getBalance,
  placeBet,
  rpc,
  sql,
} from "./helpers/db-teste.js";

// Jogo responsável no banco (migration 20260925000002, ADR-0003): limites do apostador,
// carência de 24h para afrouxar, autoexclusão que não encurta, limite de sessão e a
// atestação de maioridade. Mesmo desenho do roletafly (20260909000006/…0008): a guarda
// vive nas RPCs, onde não pode ser burlada — `settle_bet` recusa DENTRO da saga, e a saga
// estorna o débito.
//
// Toda aposta aqui perde (roll 99,99, prêmio 0) salvo quando dito: é o que faz a perda
// diária crescer de forma previsível. O jogador nasce com 1 000 centavos.
describe("jogo responsável", () => {
  const criados: string[] = [];

  async function jogador(prefixo: string) {
    const { userId } = await createTestUser(prefixo);
    criados.push(userId);
    const seedId = await createSeed(userId);
    let nonce = 0;
    const apostar = (stake: number, roll = 99.99, payout = 0) =>
      placeBet(userId, { id: seedId, server_seed_hash: "hash", client_seed: "cli" }, nonce++, stake, 50, roll, payout);
    return { userId, apostar };
  }

  const limites = (userId: string, maxStake: number | null, dailyLoss: number | null, dailyBet: number | null, sessao: number | null) =>
    rpc("set_player_limits", [userId, maxStake, dailyLoss, dailyBet, sessao]);

  async function linhaLimites(userId: string) {
    const { rows } = await sql.query("select * from dicebet.player_limits where user_id = $1", [userId]);
    return rows[0];
  }

  /** Empurra o relógio da carência para trás, como se o último afrouxamento fosse de 25h atrás. */
  const vencerCarencia = (userId: string) =>
    sql.query("update dicebet.player_limits set limits_loosened_at = now() - interval '25 hours' where user_id = $1", [userId]);

  afterAll(async () => {
    for (const id of criados) await deleteTestUser(id);
    await Promise.all([sql.end(), dbApi.end()]);
  });

  describe("limites do apostador dentro de settle_bet", () => {
    it("aposta acima da aposta máxima é recusada e o débito é estornado", async () => {
      const { userId, apostar } = await jogador("rg-max");
      expect((await limites(userId, 100, null, null, null)).error).toBeNull();
      const antes = await getBalance(userId);

      expect((await apostar(150)).error?.message).toContain("LIMIT_EXCEEDED");
      expect(await getBalance(userId)).toBe(antes);
      expect((await apostar(100)).error).toBeNull();
    });

    it("apostas diárias somam as apostas das últimas 24h mais a corrente", async () => {
      const { userId, apostar } = await jogador("rg-diario");
      await limites(userId, null, null, 300, null);

      expect((await apostar(200)).error).toBeNull();
      expect((await apostar(150)).error?.message).toContain("LIMIT_EXCEEDED");
      expect((await apostar(100)).error).toBeNull(); // 300 exato ainda cabe
    });

    it("perda diária conta a aposta corrente como perdida", async () => {
      const { userId, apostar } = await jogador("rg-perda");
      await limites(userId, null, 300, null, null);

      expect((await apostar(200)).error).toBeNull(); // perdeu 200
      expect((await apostar(150)).error?.message).toContain("LIMIT_EXCEEDED"); // 350 > 300
      expect((await apostar(100)).error).toBeNull(); // 300 exato
    });

    it("prêmios abatem a perda diária", async () => {
      const { userId, apostar } = await jogador("rg-perda-premio");
      await limites(userId, null, 300, null, null);

      expect((await apostar(200, 12.34, 396)).error).toBeNull(); // ganhou: líquido +196
      expect((await apostar(450)).error).toBeNull(); // pior caso: 196 - 450 = -254
    });

    it("sessão contínua acima do limite recusa com SESSION_LIMIT; gap de 30 min abre sessão nova", async () => {
      const { userId, apostar } = await jogador("rg-sessao");
      await limites(userId, null, null, null, 10);
      expect((await apostar(50)).error).toBeNull();

      // Sessão começou há 11 min e a última aposta foi há 1 min: ainda é a mesma sessão.
      await sql.query(
        `update dicebet.player_limits
            set session_started_at = now() - interval '11 minutes',
                session_last_seen_at = now() - interval '1 minute'
          where user_id = $1`,
        [userId],
      );
      expect((await apostar(50)).error?.message).toContain("SESSION_LIMIT");

      // Parado há mais de 30 min: a próxima aposta abre sessão nova.
      await sql.query(
        "update dicebet.player_limits set session_last_seen_at = now() - interval '31 minutes' where user_id = $1",
        [userId],
      );
      expect((await apostar(50)).error).toBeNull();
      const l = await linhaLimites(userId);
      expect(Date.now() - new Date(l.session_started_at).getTime()).toBeLessThan(60_000);
    });

    it("sem limites, a aposta segue como antes e a sessão é rastreada", async () => {
      const { userId, apostar } = await jogador("rg-livre");
      expect((await apostar(500)).error).toBeNull();
      const l = await linhaLimites(userId);
      expect(l.session_started_at).not.toBeNull();
      expect(l.session_last_seen_at).not.toBeNull();
    });
  });

  describe("carência de 24h ao afrouxar (global)", () => {
    it("apertar vale na hora, sempre", async () => {
      const { userId } = await jogador("rg-apertar");
      expect((await limites(userId, 500, null, null, null)).error).toBeNull();
      expect((await limites(userId, 300, null, null, null)).error).toBeNull();
      expect((await limites(userId, 300, 1000, null, 60)).error).toBeNull(); // null -> valor aperta
      expect((await linhaLimites(userId)).limits_loosened_at).toBeNull();
    });

    it("o primeiro afrouxamento passa; o segundo dentro de 24h é recusado, em qualquer limite", async () => {
      const { userId } = await jogador("rg-afrouxar");
      await limites(userId, 300, 1000, null, null);

      expect((await limites(userId, 500, 1000, null, null)).error).toBeNull();
      expect((await linhaLimites(userId)).limits_loosened_at).not.toBeNull();
      // Outro limite, mesma carência global.
      expect((await limites(userId, 500, 2000, null, null)).error?.message).toContain("LOOSENING_TOO_SOON");
      // Remover (null) é o afrouxamento máximo.
      expect((await limites(userId, null, 1000, null, null)).error?.message).toContain("LOOSENING_TOO_SOON");
      // Apertar continua livre durante a carência, e não reinicia o relógio.
      const relogio = (await linhaLimites(userId)).limits_loosened_at;
      expect((await limites(userId, 200, 1000, null, null)).error).toBeNull();
      expect((await linhaLimites(userId)).limits_loosened_at).toEqual(relogio);

      await vencerCarencia(userId);
      expect((await limites(userId, null, 1000, null, null)).error).toBeNull();
    });

    it("limits_loosenable_at entrega o prazo da carência", async () => {
      const { userId } = await jogador("rg-prazo");
      await limites(userId, 300, null, null, null);
      await limites(userId, 500, null, null, null);
      const { rows } = await sql.query(
        `select dicebet.limits_loosenable_at(l) - l.limits_loosened_at as carencia
           from dicebet.player_limits l where user_id = $1`,
        [userId],
      );
      expect(rows[0].carencia).toMatchObject({ hours: 24 });
    });

    it("zero e negativo são recusados (só null é 'sem limite')", async () => {
      const { userId } = await jogador("rg-zero");
      expect((await limites(userId, 0, null, null, null)).error?.message).toContain("INVALID_LIMIT");
      expect((await limites(userId, null, null, null, 1441)).error?.message).toContain("INVALID_LIMIT");
    });

    it("cada mudança fica na trilha de auditoria, dizendo se afrouxou", async () => {
      const { userId } = await jogador("rg-audit");
      await limites(userId, 300, null, null, null);
      await limites(userId, 500, null, null, null);
      const { rows } = await sql.query(
        "select detail from dicebet.audit_events where user_id = $1 and event = 'limits_changed' order by id",
        [userId],
      );
      expect(rows.map((r) => r.detail.loosened)).toEqual([false, true]);
    });
  });

  describe("autoexclusão", () => {
    const emDias = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

    it("bloqueia toda aposta com SELF_EXCLUDED, com saldo líquido inalterado (débito revertido pela saga)", async () => {
      const { userId, apostar } = await jogador("rg-autoexcl");
      expect((await rpc("self_exclude", [userId, emDias(30)])).error).toBeNull();
      const antes = await getBalance(userId);
      expect((await apostar(100)).error?.message).toContain("SELF_EXCLUDED");
      expect(await getBalance(userId)).toBe(antes);
    });

    it("não encurta enquanto vigora; estender é livre", async () => {
      const { userId } = await jogador("rg-encurtar");
      await rpc("self_exclude", [userId, emDias(90)]);
      expect((await rpc("self_exclude", [userId, emDias(30)])).error?.message).toContain("SHORTENING_SELF_EXCLUSION");
      expect((await rpc("self_exclude", [userId, emDias(180)])).error).toBeNull();
    });

    it("exclusão vencida é história: uma nova, mais curta, é aceita", async () => {
      const { userId, apostar } = await jogador("rg-vencida");
      await rpc("self_exclude", [userId, emDias(30)]);
      await sql.query(
        "update dicebet.player_limits set self_excluded_until = now() - interval '1 day' where user_id = $1",
        [userId],
      );
      expect((await apostar(100)).error).toBeNull();
      expect((await rpc("self_exclude", [userId, emDias(1)])).error).toBeNull();
    });

    it("data no passado é INVALID_PERIOD", async () => {
      const { userId } = await jogador("rg-passado");
      expect((await rpc("self_exclude", [userId, emDias(-1)])).error?.message).toContain("INVALID_PERIOD");
    });
  });

  describe("atestação de maioridade (servidor)", () => {
    it("grava o instante da primeira atestação e é idempotente", async () => {
      const { userId } = await jogador("rg-idade");
      const primeira = await rpc<Date>("attest_age", [userId]);
      expect(primeira.error).toBeNull();
      const segunda = await rpc<Date>("attest_age", [userId]);
      expect(new Date(segunda.data).getTime()).toBe(new Date(primeira.data).getTime());
      const { rows } = await sql.query("select age_attested_at from dicebet.profiles where id = $1", [userId]);
      expect(rows[0].age_attested_at).not.toBeNull();
    });
  });

  describe("grants", () => {
    it("o role da API lê player_limits mas não escreve por fora das RPCs", async () => {
      const { userId } = await jogador("rg-grant");
      await limites(userId, 300, null, null, null);
      const { rows } = await dbApi.query("select max_stake_cents from dicebet.player_limits where user_id = $1", [userId]);
      expect(Number(rows[0].max_stake_cents)).toBe(300);
      await expect(
        dbApi.query("update dicebet.player_limits set max_stake_cents = null where user_id = $1", [userId]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        dbApi.query("update dicebet.profiles set age_attested_at = now() where id = $1", [userId]),
      ).rejects.toThrow(/permission denied/);
      // E executa as RPCs.
      expect((await dbApi.query("select dicebet.attest_age($1)", [userId])).rows).toHaveLength(1);
    });
  });
});
