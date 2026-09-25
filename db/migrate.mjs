// Aplica db/migrations/*.sql em ordem, uma vez cada, no schema `dicebet` do banco único
// da plataforma (rollout RGS, docs/adr/0002-carteira-de-rgs.md daqui). O schema `rgs`
// precisa existir antes: `node node_modules/@kskawarrior/rgs-core/db/migrate.mjs` (o
// `npm run db:migrate` faz os dois). Cada arquivo roda numa transação e é registrado em
// `dicebet.schema_migrations`, junto com o sha256 do conteúdo aplicado. Migration já
// registrada com hash DIFERENTE do arquivo atual faz o migrate falhar alto — este banco é
// compartilhado por vários jogos/repos, e editar uma migration velha nunca a reaplica
// sozinho (drift silencioso: foi assim que `plinko.user_seeds` ficou com RLS forçada e
// zero policies, plinkofly@a717cd6).
//
// Ao final, cria (se preciso) e (re)concede ao role `dicebet_api` — o único que a API
// usa — o que ela precisa e nada mais: EXECUTE nas RPCs, SELECT nas tabelas e
// INSERT/UPDATE só em `user_seeds`, tudo no schema `dicebet`; e, no schema `rgs`, SÓ o
// que a saga da demo usa — grants explícitos, não filiação a `rgs_api` (que abriria
// `set role` e todo o schema da plataforma).
//
// ALARGAMENTO ACEITO, e vale saber: `rgs.demo_mover`/`demo_rollback` no grant significam
// que o role da API move saldo do operador demo por chamada direta, não só de dentro de
// uma RPC do jogo como antes. É inevitável — quem chama é o adaptador demo do pacote, do
// lado do Node, e é ele quem a saga usa. O que trava um movimento forjado não é mais o
// grant: é a idempotência por `txId` e o par único em `rgs.wallet_ops`.
//
//   node db/migrate.mjs               # DATABASE_URL opcional (default: compose do rgs)
//   node db/migrate.mjs --reset       # dropa e recria o schema dicebet antes (testes)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

// O checksum ignora o fim de linha de propósito. O mesmo arquivo tem CRLF na cópia de
// trabalho do Windows (o git converte no checkout) e LF dentro do container e no CI —
// bytes diferentes, conteúdo idêntico. Sem normalizar, aplicar a migration do host e
// conferir do container acusa "aplicada com outro conteúdo" numa migration que ninguém
// tocou, e o único jeito de sair disso é mexer no banco à mão. Também tira o BOM, que
// `readFileSync(..., "utf8")` entrega como primeiro caractere, e o CR solto que um editor
// de fim de linha misto deixa para trás.
//
// Mesma normalização do `db/migrate.mjs` do repo `rgs` (que travou o stack do E12a em
// 2026-09-18); o BOM é testado por código de caractere em vez do escape `\u`, que não
// sobrevive a toda ferramenta que edita este arquivo.
const semBom = (sql) => (sql.charCodeAt(0) === 0xfeff ? sql.slice(1) : sql);
const checksum = (sql) => createHash("sha256").update(semBom(sql).replace(/\r\n?/g, "\n")).digest("hex");

/** Checksum no formato ANTIGO (bytes crus), só para reconhecer registros legados. */
const legacyChecksum = (sql) => createHash("sha256").update(sql).digest("hex");

// Default = o `postgres` do docker-compose do repo `rgs`, como superusuário (cria o role
// da API).
const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:57332/rgs";
const reset = process.argv.includes("--reset");
const dir = fileURLToPath(new URL("./migrations/", import.meta.url));

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (reset) await client.query("drop schema if exists dicebet cascade");
  await client.query("create schema if not exists dicebet");
  await client.query(
    "create table if not exists dicebet.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  // Migração antiga do banco: nem toda `schema_migrations` já tem a coluna.
  await client.query("alter table dicebet.schema_migrations add column if not exists checksum text");
  const aplicadas = new Map(
    (await client.query("select name, checksum from dicebet.schema_migrations")).rows.map((r) => [
      r.name,
      r.checksum,
    ]),
  );
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(dir + name, "utf8");
    const hash = checksum(sql);
    if (aplicadas.has(name)) {
      const registrado = aplicadas.get(name);
      if (registrado === null) {
        // Aplicada antes de existir checksum: não dá pra saber se o conteúdo que rodou é
        // este. Backfilla em silêncio — a partir de agora ela é rastreada.
        await client.query("update dicebet.schema_migrations set checksum = $1 where name = $2", [hash, name]);
      } else if (registrado === legacyChecksum(sql) && registrado !== hash) {
        // Registro gravado antes da normalizacao: o conteudo confere, so o fim de linha
        // era outro. Migra o registro para o formato novo em vez de fazer o operador
        // escolher entre editar o banco a mao e reinstalar tudo.
        await client.query("update dicebet.schema_migrations set checksum = $1 where name = $2", [hash, name]);
      } else if (registrado !== hash) {
        // O BANCO reflete o que rodou quando foi aplicada, não o arquivo de hoje — e este
        // migrate só roda migrations NOVAS, nunca reaplica uma já marcada. Falha alto e
        // cedo em vez de seguir como se nada tivesse mudado: quem editou decide se é uma
        // migration NOVA (nome novo) ou uma correção manual do banco já aplicada.
        throw new Error(
          `migration ${name} já foi aplicada com outro conteúdo (checksum ${registrado} != ${hash}). ` +
            "Não reaplica migration editada: crie uma migration nova para o ajuste, ou corrija o banco manualmente.",
        );
      }
      continue;
    }
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into dicebet.schema_migrations (name, checksum) values ($1, $2)", [name, hash]);
      await client.query("commit");
      console.log(`aplicada ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`migration ${name} falhou: ${error.message}`, { cause: error });
    }
  }

  const senha = process.env.API_DB_PASSWORD ?? "dicebet_api";
  await client.query(
    `do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'dicebet_api') then
        execute format('create role dicebet_api login password %L', $1);
      end if;
    end $$;`.replace("$1", () => "'" + senha.replaceAll("'", "''") + "'"),
  );
  // O `revoke ... from public` é o que impede o `supabase_auth_admin` do GoTrue (e
  // qualquer outro role) de executar as RPCs `security definer`.
  await client.query(`
    revoke execute on all functions in schema dicebet from public;
    grant usage on schema dicebet to dicebet_api;
    grant select on all tables in schema dicebet to dicebet_api;
    grant insert, update on dicebet.user_seeds to dicebet_api;
    grant execute on all functions in schema dicebet to dicebet_api;
    grant usage on schema rgs to dicebet_api;
    grant select on rgs.demo_wallets, rgs.ledger, rgs.wallet_ops, rgs.bonus_wallets, rgs.free_rounds
      to dicebet_api;
    -- A saga resolve a carteira do operador lendo esta tabela. operator_keys NÃO entra:
    -- é a chave do operador http, que a etapa 1 não tem — quem conceder, conceda quando
    -- houver consumidor.
    grant select on rgs.operators to dicebet_api;
    grant execute on function
      rgs.demo_mover(uuid, text, char, bigint, text, text),
      rgs.demo_rollback(uuid, uuid),
      rgs.demo_ensure_wallet(text, char, bigint),
      rgs.demo_refill(text, char),
      rgs.demo_saldo(text),
      rgs.wallet_op_registrar(uuid, uuid, text, text, text, text, text, bigint, char, uuid, text),
      rgs.wallet_op_atualizar(uuid, text, jsonb),
      -- E9: ordem de consumo bônus/real e o consumo de rodada grátis (mesmos grants do
      -- roletafly, o piloto).
      rgs.fundo_para_debito(uuid, text, char, bigint),
      rgs.free_round_consumir(uuid, uuid, text, text, text, uuid)
      to dicebet_api;
  `);
  console.log("grants de dicebet_api ok");

  // Declaração deste jogo no schema da plataforma, reafirmada a cada execução como os
  // grants acima: o schema `rgs` pertence ao outro repo e um `--reset` de lá a apagaria.
  // RTP 99 % (payout = stake · 99/target, docs/certificacao/02-memorial-rtp.md). Sem esta
  // linha `rgs.operator_configs` não aceita config para `dicebet` (FK composta para
  // `game_rtp_profiles`, decisão A.9) — mesma receita de roletafly/crashfly/plinkofly.
  await client.query(`
    insert into rgs.game_rtp_profiles (game, rtp_profile)
    values ('dicebet', 'padrao-99') on conflict do nothing;
    insert into rgs.operator_configs (operator_id, game, currency, locales, rtp_profile)
    values ('00000000-0000-0000-0000-000000000001', 'dicebet', 'BRL', '{pt-BR,en-US}', 'padrao-99')
    on conflict do nothing;
  `);
  console.log("perfil de RTP e config do operador demo ok");
} finally {
  await client.end();
}
