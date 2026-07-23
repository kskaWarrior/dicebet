<script setup lang="ts">
const supabase = useSupabase();
const balance = useBalance();
const loggedIn = ref(false);

onMounted(async () => {
  const { data } = await supabase.auth.getSession();
  loggedIn.value = !!data.session;
  supabase.auth.onAuthStateChange((_event, session) => {
    loggedIn.value = !!session;
    if (!session) balance.value = null;
  });
});

async function signOut() {
  await supabase.auth.signOut();
  navigateTo("/login");
}
</script>

<template>
  <div class="shell">
    <p class="banner">Demo project — virtual coins & Stripe test mode only. No real money.</p>
    <header>
      <NuxtLink to="/" class="logo">🎲 DiceBet</NuxtLink>
      <nav v-if="loggedIn">
        <NuxtLink to="/">Play</NuxtLink>
        <NuxtLink to="/history">History</NuxtLink>
        <NuxtLink to="/fairness">Fairness</NuxtLink>
        <span class="balance">{{ formatCents(balance) }}</span>
        <button @click="signOut">Sign out</button>
      </nav>
    </header>
    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0f1220;
  color: #e8eaf6;
}
a { color: #8ab4ff; text-decoration: none; }
button {
  cursor: pointer;
  border: 0;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  font-size: 1rem;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
input {
  background: #1a1f35;
  border: 1px solid #2c3352;
  border-radius: 8px;
  color: inherit;
  padding: 0.5rem;
  font-size: 1rem;
}
.shell { max-width: 720px; margin: 0 auto; padding: 0 1rem 3rem; }
.banner {
  background: #7c2d12;
  color: #fed7aa;
  text-align: center;
  padding: 0.4rem;
  border-radius: 0 0 8px 8px;
  font-size: 0.85rem;
  margin: 0 0 0.5rem;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  gap: 1rem;
  flex-wrap: wrap;
}
header nav { display: flex; align-items: center; gap: 1rem; }
.logo { font-size: 1.3rem; font-weight: 700; color: inherit; }
.balance {
  background: #14532d;
  color: #86efac;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
</style>
