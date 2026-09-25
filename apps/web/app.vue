<script setup lang="ts">
import { calcularSessao } from "./shared/jogo-responsavel.js";
import { exigeGateMaioridade } from "./shared/rotas-sem-gate-maioridade.js";

const auth = useAuth();
const balance = useBalance();
const loggedIn = ref(false);
const { t, locale, initLocale } = useI18n();
const { initTheme } = useTheme();
const route = useRoute();

// Gate 18+ na casca, e não numa página: é o único ponto por onde toda rota passa (mesmo
// desenho do roletafly). A lista de isenções e o teste que prende a cobertura moram em
// `shared/rotas-sem-gate-maioridade.ts` / `tests/gate-maioridade-cobre-tudo.test.ts`.
const { attested, init: initAgeGate, confirm: confirmarIdade } = useAgeGate();
const exigeIdade = computed(() => exigeGateMaioridade(attested.value, route.path));

// Relógio de sessão sempre visível quando logado (mesma regra de gap de 30 min que
// `settle_bet` aplica). Recarrega o estado a cada minuto e a cada navegação — uma aposta
// aceita move `session_last_seen_at`.
const { estado: estadoRg, carregar: carregarRg } = useJogoResponsavel();
const agora = ref(Date.now());
const sessao = computed(() => calcularSessao(estadoRg.value, agora.value));
let relogio: ReturnType<typeof setInterval> | undefined;
watch(
  () => route.path,
  () => {
    if (loggedIn.value) carregarRg().catch(() => {});
  },
);
onBeforeUnmount(() => relogio && clearInterval(relogio));

useHead({ htmlAttrs: { lang: computed(() => (locale.value === "pt" ? "pt-BR" : locale.value)) } });

onMounted(async () => {
  initLocale();
  initTheme();
  initCrashReporting();
  const { data } = await auth.getSession();
  loggedIn.value = !!data.session;
  await initAgeGate();
  auth.onAuthStateChange((_event, session) => {
    const entrou = !!session && !loggedIn.value;
    loggedIn.value = !!session;
    if (!session) {
      balance.value = null;
      estadoRg.value = null;
    }
    // Entrou agora: a conta pode já estar atestada (outro dispositivo), ou o dispositivo
    // já atestado sobe a declaração para a conta.
    if (entrou) initAgeGate();
  });
  relogio = setInterval(() => {
    agora.value = Date.now();
    if (loggedIn.value) carregarRg().catch(() => {});
  }, 60_000);
});

async function signOut() {
  await auth.signOut();
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
        <NuxtLink to="/limits">{{ t("nav.limits") }}</NuxtLink>
        <NuxtLink to="/responsible-gaming">{{ t("nav.responsible") }}</NuxtLink>
        <span
          v-if="estadoRg"
          class="session-clock"
          :class="{ warn: sessao.perto, over: sessao.atingido }"
        >
          {{
            sessao.limiteMinutos !== null
              ? t("session.clockLimit", { min: sessao.minutos, limit: sessao.limiteMinutos })
              : t("session.clock", { min: sessao.minutos })
          }}
        </span>
        <span class="balance">{{ formatCents(balance) }}</span>
        <button class="signout" @click="signOut">{{ t("nav.signout") }}</button>
      </nav>
    </header>
    <main>
      <div v-if="exigeIdade" class="age-gate">
        <h1>{{ t("agegate.title") }}</h1>
        <p>{{ t("agegate.text") }}</p>
        <label>
          <input
            type="checkbox"
            :checked="false"
            @change="(e) => (e.target as HTMLInputElement).checked && confirmarIdade()"
          />
          {{ t("agegate.checkbox") }}
        </label>
        <p><NuxtLink to="/responsible-gaming">{{ t("nav.responsible") }}</NuxtLink></p>
      </div>
      <NuxtPage v-else />
    </main>
    <footer>
      <p>{{ t("footer.responsible") }}</p>
    </footer>
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
.session-clock {
  color: var(--muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.session-clock.warn { color: #fcd34d; }
.session-clock.over { color: #fca5a5; font-weight: 600; }
.age-gate {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  margin-top: 1.5rem;
}
.age-gate label { display: flex; gap: 0.5rem; align-items: center; }
footer {
  margin-top: 2rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.8rem;
  text-align: center;
}
.logo { font-size: 1.3rem; font-weight: 700; color: inherit; }
.balance {
  background: #14532d;
  color: #86efac;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
</style>
