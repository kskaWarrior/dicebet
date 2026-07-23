<script setup lang="ts">
interface BetResponse {
  bet: { roll: number; payout: number; stake: number; target: number };
  win: boolean;
  multiplier: number;
  balance: number;
}

const api = useApi();
const balance = useBalance();
const { playShake, playWin, playLose, muted } = useDiceAudio();

const target = ref(50);
const stakeDollars = ref(1);
const rolling = ref(false);
const displayRoll = ref("");
const last = ref<BetResponse | null>(null);
const error = ref("");
const depositBusy = ref(false);

const multiplier = computed(() => 99 / target.value);
const winChance = computed(() => target.value);
const potentialWin = computed(() => Math.floor(stakeDollars.value * 100 * multiplier.value));

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

async function roll() {
  rolling.value = true;
  error.value = "";
  last.value = null;

  // Skip the suspense for users who prefer reduced motion
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const spinMs = reducedMotion ? 0 : 1400;

  playShake(spinMs);
  const ticker = reducedMotion
    ? 0
    : window.setInterval(() => {
        displayRoll.value = (Math.random() * 100).toFixed(2);
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
    if (res.win) playWin();
    else playLose();
  } catch (e: any) {
    error.value =
      e?.data?.error === "INSUFFICIENT_FUNDS"
        ? "Not enough coins — make a (test) deposit below."
        : "Bet failed, try again.";
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
    error.value = "Could not start checkout.";
    depositBusy.value = false;
  }
}
</script>

<template>
  <div class="game">
    <div class="title-row">
      <h1>Dice</h1>
      <button class="mute" :aria-label="muted ? 'Unmute' : 'Mute'" @click="muted = !muted">
        {{ muted ? "🔇" : "🔊" }}
      </button>
    </div>
    <p class="hint">Roll under <strong>{{ target }}</strong> to win. Payout: {{ multiplier.toFixed(4) }}× (1% house edge).</p>

    <label>
      Win chance: {{ winChance }}%
      <input v-model.number="target" type="range" min="1" max="98" step="1" :disabled="rolling" />
    </label>

    <label>
      Stake ($)
      <input v-model.number="stakeDollars" type="number" min="0.01" max="1000" step="0.01" :disabled="rolling" />
    </label>

    <p class="hint">Win pays {{ formatCents(potentialWin) }}</p>

    <button :disabled="rolling" @click="roll">{{ rolling ? "Rolling…" : "Roll" }}</button>

    <div v-if="rolling" class="result spinning">
      <span class="die" aria-hidden="true">🎲</span>
      <span class="roll">{{ displayRoll || "…" }}</span>
    </div>
    <div v-else-if="last" class="result reveal" :class="last.win ? 'won' : 'lost'">
      <span class="roll">{{ last.bet.roll.toFixed(2) }}</span>
      <span>{{ last.win ? `Won ${formatCents(last.bet.payout)}!` : "Lost" }}</span>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <hr />
    <h2>Deposit (Stripe test mode)</h2>
    <p class="hint">Use card 4242 4242 4242 4242, any future expiry, any CVC.</p>
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
.hint { color: #9aa3c7; margin: 0; font-size: 0.9rem; }
.result {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: 12px;
  font-size: 1.2rem;
}
.result .roll { font-size: 2rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.spinning { background: #1a1f35; color: #9aa3c7; }
.spinning .die { font-size: 2rem; animation: tumble 0.5s linear infinite; }
.reveal { animation: pop 0.25s ease-out; }
.won { background: #14532d; color: #86efac; }
.lost { background: #450a0a; color: #fca5a5; }
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
}
.error { color: #fca5a5; }
.deposits { display: flex; gap: 0.75rem; }
hr { border-color: #2c3352; width: 100%; }
</style>
