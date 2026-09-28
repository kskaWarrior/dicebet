// Bots de demo: N jogadores fake apostando de verdade pela API pública, para gerar volume
// real de RTP (E14/US16). Mesmo caminho do luckytiger (ver luckytiger/scripts/bots.mjs):
// `shared/auth.ts` só confere a assinatura HS256 do Bearer token (`sub`/`email`) e chama
// `ensure_player` sozinho a cada requisição — sem fluxo de login GoTrue separado aqui,
// então cada bot assina o próprio JWT local com o mesmo AUTH_JWT_SECRET da API.
//
//   BOTS=8 DICEBET_API=http://localhost:8080 AUTH_JWT_SECRET=... node scripts/bots.mjs
import { createHmac, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

for (const rel of ["../apps/api/.env", "../.env"]) {
  try {
    process.loadEnvFile(fileURLToPath(new URL(rel, import.meta.url)));
  } catch {
    // arquivo opcional
  }
}

const N = Number(process.env.BOTS ?? 8);
const API = process.env.DICEBET_API ?? "http://localhost:8080";
const SECRET = process.env.AUTH_JWT_SECRET;
if (!SECRET) throw new Error("AUTH_JWT_SECRET ausente (mesmo segredo do GoTrue do rgs)");

const base64url = (buf) => Buffer.from(buf).toString("base64url");

/** JWT HS256 mínimo — só o que `shared/auth.ts` exige: `sub` e, opcional, `email`. */
function signToken(sub, email) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({ sub, email, aud: "authenticated", iat: now, exp: now + 3600 }),
  );
  const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const randn = () => {
  const u = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

/** Stake log-normal em centavos, dentro dos limites da API (50..100000). */
const sampleStake = (mu, sigma) => clamp(Math.round(Math.exp(mu + sigma * randn()) / 50) * 50, 50, 100_000);

// Target em "rolar abaixo de": distribuição realista entre apostas conservadoras
// (target alto, ganha quase sempre, paga pouco) e arriscadas (target baixo, paga muito).
const TARGETS = [95, 80, 66, 50, 33, 20, 10, 2];
const sampleTarget = () => TARGETS[Math.floor(Math.random() * TARGETS.length)];

const counters = { bets: 0, wins: 0, losses: 0, refills: 0, errors: 0 };

function createBot(i) {
  const email = `bot-${String(i + 1).padStart(2, "0")}@dicebet.dev`;
  const sub = randomUUID();
  const token = signToken(sub, email);
  const stakeMu = Math.log(150 + Math.random() * 350);
  const stakeSigma = 0.6;
  const pauseMs = () => 6000 + Math.random() * 14000;

  const log = (...args) => console.log(`[${email.slice(0, 6)}]`, ...args);

  const rest = async (path, init = {}) => {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    });
    const body = await res.text().then((t) => (t ? JSON.parse(t) : {}));
    return { ok: res.ok, status: res.status, body };
  };

  let stopped = false;
  let disabled = false;

  const betOnce = async () => {
    const stake = sampleStake(stakeMu, stakeSigma);
    const target = sampleTarget();
    let res = await rest("/bets", { method: "POST", body: JSON.stringify({ stake, target }) });
    // Refill só é permitido com saldo < 1000 (rgs.demo_refill) — tenta uma vez e refaz a
    // aposta em vez de checar o saldo antes (o valor sorteado varia bet a bet).
    if (!res.ok && res.body.error === "INSUFFICIENT_FUNDS") {
      const r = await rest("/wallet/refill", { method: "POST" });
      if (r.ok) counters.refills++;
      res = await rest("/bets", { method: "POST", body: JSON.stringify({ stake, target }) });
    }
    if (!res.ok) {
      const code = res.body.error ?? "UNKNOWN";
      if (code === "LIMIT_EXCEEDED" || code === "SELF_EXCLUDED") {
        disabled = true;
        log("disabled:", code);
        return;
      }
      counters.errors++;
      log("aposta recusada:", code);
      return;
    }
    counters.bets++;
    if (res.body.win) counters.wins++;
    else counters.losses++;
  };

  const loop = async () => {
    while (!stopped && !disabled) {
      try {
        await betOnce();
      } catch (e) {
        counters.errors++;
        log("erro:", e.message);
      }
      await sleep(pauseMs());
    }
  };

  return {
    start: () => void loop(),
    stop: () => {
      stopped = true;
    },
  };
}

const bots = Array.from({ length: N }, (_, i) => createBot(i));
for (const [i, bot] of bots.entries()) setTimeout(() => bot.start(), i * 300);

const summary = setInterval(() => {
  console.log(
    `bots=${N} bets=${counters.bets} wins=${counters.wins} losses=${counters.losses}` +
      ` refills=${counters.refills} errors=${counters.errors}`,
  );
}, 60_000);

process.on("unhandledRejection", (e) => {
  counters.errors++;
  console.error("unhandledRejection:", e?.message ?? e);
});

const shutdown = () => {
  console.log("encerrando...");
  clearInterval(summary);
  for (const bot of bots) bot.stop();
  setTimeout(() => process.exit(0), 500);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Starting ${N} bots against ${API}`);
