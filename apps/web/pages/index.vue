<script setup lang="ts">
interface BetResponse {
  bet: { roll: number; payout: number; stake: number; target: number };
  win: boolean;
  multiplier: number;
  balance: number;
}

const api = useApi();
const balance = useBalance();
const { t } = useI18n();
const { playShake, playWin, playLose, muted } = useDiceAudio();
const { burst: burstConfetti, clear: clearConfetti } = useConfetti();

const target = ref(50);
const stakeDollars = ref(1);
const rolling = ref(false);
const displayRoll = ref("");
const last = ref<BetResponse | null>(null);
const error = ref("");
const depositBusy = ref(false);
const gaugeValue = ref<number | null>(null);
const resultWrap = ref<HTMLElement | null>(null);
const gaugeWrap = ref<HTMLElement | null>(null);
const confettiCanvas = ref<HTMLCanvasElement | null>(null);
const gaugeConfettiCanvas = ref<HTMLCanvasElement | null>(null);
const flashTier = ref<"win" | "big" | null>(null);

// Checked once: consistent with the reduced-motion check already made per-roll below.
const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const multiplier = computed(() => 99 / target.value);
const potentialWin = computed(() => Math.floor(stakeDollars.value * 100 * multiplier.value));
const gaugeState = computed(() => {
  if (rolling.value) return "rolling";
  if (last.value) return last.value.win ? "won" : "lost";
  return "idle";
});

onMounted(refreshWallet);

async function refreshWallet() {
  try {
    const res = await api<{ balance: number }>("/wallet");
    balance.value = res.balance;
  } catch {
    /* redirected to login */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Size a confetti canvas from its own (padded) box and fire a burst into it. */
function fireConfetti(canvas: HTMLCanvasElement | null, tier: "win" | "big") {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  burstConfetti(canvas, tier);
}

async function roll() {
  rolling.value = true;
  error.value = "";
  last.value = null;
  gaugeValue.value = null;
  flashTier.value = null;
  if (confettiCanvas.value) clearConfetti(confettiCanvas.value);
  if (gaugeConfettiCanvas.value) clearConfetti(gaugeConfettiCanvas.value);

  // Skip the suspense for users who prefer reduced motion
  const spinMs = reducedMotion ? 0 : 1400;

  playShake(spinMs);
  const ticker = reducedMotion
    ? 0
    : window.setInterval(() => {
        const n = Math.random() * 100;
        displayRoll.value = n.toFixed(2);
        gaugeValue.value = n;
      }, 70);
  const started = performance.now();

  try {
    const res = await api<BetResponse>("/bets", {
      method: "POST",
      body: { stake: Math.round(stakeDollars.value * 100), target: target.value },
    });
    // Let the shake play out before revealing the result
    await sleep(Math.max(0, spinMs - (performance.now() - started)));
    last.value = res;
    balance.value = res.balance;
    gaugeValue.value = res.bet.roll;
    if (res.win) {
      const tier: "win" | "big" = res.multiplier >= 2 ? "big" : "win";
      playWin(tier);
      if (!reducedMotion) {
        flashTier.value = tier;
        await nextTick();
        fireConfetti(confettiCanvas.value, tier);
        fireConfetti(gaugeConfettiCanvas.value, tier);
      }
    } else {
      playLose();
    }
  } catch (e: any) {
    error.value =
      e?.data?.error === "INSUFFICIENT_FUNDS" ? t("game.errInsufficient") : t("game.errFailed");
  } finally {
    if (ticker) clearInterval(ticker);
    rolling.value = false;
  }
}

async function deposit(amountCents: number) {
  depositBusy.value = true;
  try {
    const res = await api<{ url: string }>("/deposits", {
      method: "POST",
      body: { amount: amountCents },
    });
    window.location.href = res.url;
  } catch {
    error.value = t("game.errCheckout");
    depositBusy.value = false;
  }
}
</script>

<template>
  <div class="game">
    <div class="title-row">
      <h1>{{ t("game.title") }}</h1>
      <button class="mute" :aria-label="muted ? 'Unmute' : 'Mute'" @click="muted = !muted">
        {{ muted ? "🔇" : "🔊" }}
      </button>
    </div>
    <p class="hint">{{ t("game.rollUnder", { target, mult: multiplier.toFixed(4) }) }}</p>

    <div ref="gaugeWrap" class="gauge-wrap">
      <DiceOdometer :target="target" :value="gaugeValue" :state="gaugeState" />
      <div v-if="flashTier" :key="flashTier" class="win-flash" :class="flashTier" aria-hidden="true" />
      <canvas ref="gaugeConfettiCanvas" class="confetti-canvas" aria-hidden="true" />
    </div>

    <label>
      {{ t("game.winChance", { pct: target }) }}
      <input v-model.number="target" type="range" min="1" max="98" step="1" :disabled="rolling" />
    </label>

    <label>
      {{ t("game.stake") }}
      <input v-model.number="stakeDollars" type="number" min="0.01" max="1000" step="0.01" :disabled="rolling" />
    </label>

    <p class="hint">{{ t("game.winPays", { amount: formatCents(potentialWin) }) }}</p>

    <button :disabled="rolling" @click="roll">{{ rolling ? t("game.rolling") : t("game.roll") }}</button>

    <div ref="resultWrap" class="result-wrap">
      <div v-if="rolling" class="result spinning">
        <span class="die" aria-hidden="true">🎲</span>
        <span class="roll">{{ displayRoll || "…" }}</span>
      </div>
      <div v-else-if="last" class="result reveal" :class="last.win ? 'won' : 'lost'">
        <span class="roll">{{ last.bet.roll.toFixed(2) }}</span>
        <span>{{ last.win ? t("game.won", { amount: formatCents(last.bet.payout) }) : t("game.lost") }}</span>
      </div>
      <div v-if="flashTier" :key="flashTier" class="win-flash" :class="flashTier" aria-hidden="true" />
      <canvas ref="confettiCanvas" class="confetti-canvas" aria-hidden="true" />
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <hr />
    <h2>{{ t("game.depositTitle") }}</h2>
    <p class="hint">{{ t("game.depositHint") }}</p>
    <div class="deposits">
      <button :disabled="depositBusy" @click="deposit(5_00)">+$5</button>
      <button :disabled="depositBusy" @click="deposit(20_00)">+$20</button>
      <button :disabled="depositBusy" @click="deposit(100_00)">+$100</button>
    </div>
  </div>
</template>

<style scoped>
.game { display: flex; flex-direction: column; gap: 1rem; max-width: 420px; margin: 0 auto; }
.title-row { display: flex; justify-content: space-between; align-items: center; }
.title-row h1 { margin: 0; }
.mute { background: transparent; font-size: 1.3rem; padding: 0.2rem; }
label { display: flex; flex-direction: column; gap: 0.4rem; }
.hint { color: var(--muted); margin: 0; font-size: 0.9rem; }
.result {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: 12px;
  font-size: 1.2rem;
}
.result .roll { font-size: 2rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.spinning { background: var(--surface); color: var(--muted); }
.spinning .die { font-size: 2rem; animation: tumble 0.5s linear infinite; }
.reveal { animation: pop 0.25s ease-out; }
.won { background: #14532d; color: #86efac; }
.lost { background: #450a0a; color: #fca5a5; }
.result-wrap, .gauge-wrap { position: relative; }
.confetti-canvas {
  position: absolute;
  inset: -56px -24px;
  pointer-events: none;
}
.win-flash {
  position: absolute;
  inset: -56px -24px;
  border-radius: 16px;
  pointer-events: none;
  background: radial-gradient(circle, #86efac 0%, transparent 70%);
  animation: flash-win 0.6s ease-out forwards;
}
.win-flash.big {
  background: radial-gradient(circle, #fde68a 0%, #86efac 35%, transparent 75%);
  animation: flash-big 1s ease-out forwards;
}
@keyframes flash-win {
  0% { opacity: 0.55; }
  100% { opacity: 0; }
}
@keyframes flash-big {
  0% { opacity: 0.75; transform: scale(1.15); }
  100% { opacity: 0; transform: scale(1.4); }
}
@keyframes tumble {
  0% { transform: rotate(0deg) translateY(0); }
  25% { transform: rotate(90deg) translateY(-4px); }
  50% { transform: rotate(180deg) translateY(0); }
  75% { transform: rotate(270deg) translateY(-4px); }
  100% { transform: rotate(360deg) translateY(0); }
}
@keyframes pop {
  0% { transform: scale(0.85); opacity: 0.4; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .spinning .die { animation: none; }
  .reveal { animation: none; }
  .win-flash { animation: none; opacity: 0; }
}
.error { color: #fca5a5; }
.deposits { display: flex; gap: 0.75rem; }
hr { border-color: var(--border); width: 100%; }
</style>
