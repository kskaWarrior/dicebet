<script setup lang="ts">
interface Bet {
  id: string;
  stake: number;
  target: number;
  roll: number;
  payout: number;
  created_at: string;
}

const api = useApi();
const betsList = ref<Bet[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const res = await api<{ bets: Bet[] }>("/bets");
    betsList.value = res.bets;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h1>Bet history</h1>
    <p v-if="loading">Loading…</p>
    <p v-else-if="!betsList.length">No bets yet — go roll some dice.</p>
    <div v-else class="scroll">
      <table>
        <thead>
          <tr><th>When</th><th>Stake</th><th>Target</th><th>Roll</th><th>Payout</th></tr>
        </thead>
        <tbody>
          <tr v-for="bet in betsList" :key="bet.id" :class="bet.payout > 0 ? 'won' : 'lost'">
            <td>{{ new Date(bet.created_at).toLocaleString() }}</td>
            <td>{{ formatCents(bet.stake) }}</td>
            <td>&lt; {{ bet.target }}</td>
            <td>{{ bet.roll.toFixed(2) }}</td>
            <td>{{ bet.payout > 0 ? formatCents(bet.payout) : "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #2c3352; white-space: nowrap; }
.won td:last-child { color: #86efac; }
.lost td:nth-child(4) { color: #fca5a5; }
</style>
