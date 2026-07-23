<script setup lang="ts">
const supabase = useSupabase();
const balance = useBalance();
const loggedIn = ref(false);
const { t, locale, initLocale } = useI18n();
const { initTheme } = useTheme();

useHead({ htmlAttrs: { lang: computed(() => (locale.value === "pt" ? "pt-BR" : locale.value)) } });

onMounted(async () => {
  initLocale();
  initTheme();
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
    <p class="banner">{{ t("banner") }}</p>
    <header>
      <div class="top-row">
        <NuxtLink to="/" class="logo">🎲 DiceBet</NuxtLink>
        <div class="controls">
          <ThemePicker />
          <LanguagePicker />
        </div>
      </div>
      <nav v-if="loggedIn">
        <NuxtLink to="/">{{ t("nav.play") }}</NuxtLink>
        <NuxtLink to="/history">{{ t("nav.history") }}</NuxtLink>
        <NuxtLink to="/fairness">{{ t("nav.fairness") }}</NuxtLink>
        <span class="balance">{{ formatCents(balance) }}</span>
        <button class="signout" @click="signOut">{{ t("nav.signout") }}</button>
      </nav>
    </header>
    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<style>
:root,
:root[data-theme="blue"] {
  --bg: #0f1220;
  --surface: #1a1f35;
  --border: #2c3352;
  --text: #e8eaf6;
  --muted: #9aa3c7;
  --accent: #3b82f6;
  --link: #8ab4ff;
}
:root[data-theme="purple"] {
  --bg: #130f20;
  --surface: #1e1735;
  --border: #372b57;
  --text: #ece8f6;
  --muted: #a89ac7;
  --accent: #8b5cf6;
  --link: #c4b5fd;
}
:root[data-theme="orange"] {
  --bg: #17110b;
  --surface: #271c11;
  --border: #4a3626;
  --text: #f6efe8;
  --muted: #c7ab8f;
  --accent: #f97316;
  --link: #fdba74;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  transition: background 0.25s ease;
}
a { color: var(--link); text-decoration: none; }
button {
  cursor: pointer;
  border: 0;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  font-size: 1rem;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
input {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: inherit;
  padding: 0.5rem;
  font-size: 1rem;
}
input[type="range"] { accent-color: var(--accent); padding: 0; }
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
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem 0;
}
.top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
}
.controls { display: flex; align-items: center; gap: 0.6rem; }
header nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
}
.signout { margin-left: auto; padding: 0.35rem 0.8rem; font-size: 0.9rem; }
.logo { font-size: 1.3rem; font-weight: 700; color: inherit; }
.balance {
  background: #14532d;
  color: #86efac;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
</style>
