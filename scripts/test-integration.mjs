// Roda a suíte de integração num banco PRÓPRIO (`dicebet_teste`) no Postgres do rgs.
// Os dois migrates rodam com `--reset`, e o do rgs-core dropa o schema `rgs` inteiro — no
// banco `rgs` compartilhado isso apagaria carteiras e eventos de todos os jogos. Aqui o
// reset só atinge o banco de teste, criado na primeira execução.
import { spawn, spawnSync } from "node:child_process";
import pg from "pg";

const servidor = process.env.PG_HOST ?? "127.0.0.1:57332";
const base = `postgres://postgres:postgres@${servidor}`;
const banco = process.env.TEST_DB ?? "dicebet_teste";
const admin = new pg.Client({ connectionString: `${base}/rgs` });
await admin.connect();
const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [banco]);
if (!rowCount) await admin.query(`create database "${banco}"`);
await admin.end();

const env = {
  ...process.env,
  DATABASE_URL: `${base}/${banco}`,
  API_DATABASE_URL: `postgres://dicebet_api:dicebet_api@${servidor}/${banco}`,
};
const opcoes = { env, shell: process.platform === "win32" };
const migrar = () => {
  for (const args of [["node_modules/@kskawarrior/rgs-core/db/migrate.mjs", "--reset"], ["db/migrate.mjs", "--reset"]]) {
    const r = spawnSync("node", args, { ...opcoes, stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
};

/** Roda o vitest repassando a saída e devolve o código e o texto (para reconhecer a queda). */
const vitest = () =>
  new Promise((ok) => {
    let saida = "";
    const filho = spawn("npx", ["vitest", "run", "--config", "vitest.integration.config.ts", "--root", "apps/api"], { ...opcoes, stdio: ["inherit", "pipe", "pipe"] });
    for (const [de, para] of [[filho.stdout, process.stdout], [filho.stderr, process.stderr]]) {
      de.on("data", (d) => {
        saida += d;
        para.write(d);
      });
    }
    filho.on("close", (code) => ok({ code, saida }));
  });

// No Windows o worker do vitest às vezes morre sem stack ("Worker exited unexpectedly"; ver
// o handoff do trucofly 2026-10-02-e9-torneios-mesclado.md). Só essa queda, sem nenhum teste
// reprovado, repete a rodada UMA vez, do zero; falha de teste nunca é repetida.
const soQuedaDoWorker = (s) => s.includes("Worker exited unexpectedly") && !/\bFAIL\b/.test(s);
migrar();
let r = await vitest();
if (r.code !== 0 && soQuedaDoWorker(r.saida)) {
  console.warn("\n*** worker do vitest caiu sem teste reprovado: repetindo a rodada uma vez ***\n");
  migrar();
  r = await vitest();
}
process.exit(r.code ?? 1);
