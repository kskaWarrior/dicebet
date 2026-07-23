<script setup lang="ts">
interface BetResponse {
  bet: { roll: number; payout: number; stake: number; target: number };
  win: boolean;
  multiplier: number;
  balance: number;
}

const api = useApi();
const balance = useBalance();

const target = ref(50);
const stakeDollars = ref(1);
const rolling = ref(false);
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

async function roll() {
  rolling.value = true;
  error.value = "";
  try {
    const res = await api<BetResponse>("/bets", {
      method: "POST",
      body: { stake: Math.round(stakeDollars.value * 100), target: target.value },
    });
    last.value = res;
    balance.value = res.balance;
  } catch (e: any) {
    error.value =
      e?.data?.error === "INSUFFICIENT_FUNDS"
        ? "Not enough coins — make a (test) deposit below."
        : "Bet failed, try again.";
  } finally {
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
    <h1>Dice</h1>
    <p class="hint">Roll under <strong>{{ target }}</strong> to win. Payout: {{ multiplier.toFixed(4) }}× (1% house edge).</p>

    <label>
      Win chance: {{ winChance }}%
      <input v-model.number="target" type="range" min="1" max="98" step="1" />
    </label>

    <label>
      Stake ($)
      <input v-model.number="stakeDollars" type="number" min="0.01" max="1000" step="0.01" />
    </label>

    <p class="hint">Win pays {{ formatCents(potentialWin) }}</p>

    <button :disabled="rolling" @click="roll">{{ rolling ? "Rolling…" : "Roll" }}</button>

    <div v-if="last" class="result" :class="last.win ? 'won' : 'lost'">
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
.won { background: #14532d; color: #86efac; }
.lost { background: #450a0a; color: #fca5a5; }
.error { color: #fca5a5; }
.deposits { display: flex; gap: 0.75rem; }
hr { border-color: #2c3352; width: 100%; }
</style>
