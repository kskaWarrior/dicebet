<script setup lang="ts">
import {
  bloqueadoPelaCarencia,
  campoParaCents,
  centsParaCampo,
  type Limites,
} from "../shared/jogo-responsavel.js";

// Limites do apostador (ADR-0003). A regra é do banco (`set_player_limits`): apertar vale
// na hora, afrouxar só 24h depois do último afrouxamento. A tela avisa ANTES de enviar,
// com o mesmo espelho que os testes de `tests/jogo-responsavel.test.ts` prendem.
const { t, locale } = useI18n();
const { estado, carregar, salvarLimites } = useJogoResponsavel();

const maxStake = ref("");
const dailyBet = ref("");
const dailyLoss = ref("");
const sessao = ref("");
const busy = ref(false);
const erro = ref("");
const ok = ref("");

function preencher() {
  const e = estado.value;
  maxStake.value = centsParaCampo(e?.maxStakeCents ?? null);
  dailyBet.value = centsParaCampo(e?.dailyBetLimitCents ?? null);
  dailyLoss.value = centsParaCampo(e?.dailyLossLimitCents ?? null);
  sessao.value = e?.sessionMinutesLimit != null ? String(e.sessionMinutesLimit) : "";
}

onMounted(async () => {
  try {
    await carregar();
    preencher();
  } catch {
    /* useApi já redireciona ao login */
  }
});

const novo = computed<Limites>(() => ({
  maxStakeCents: campoParaCents(maxStake.value),
  dailyBetLimitCents: campoParaCents(dailyBet.value),
  dailyLossLimitCents: campoParaCents(dailyLoss.value),
  sessionMinutesLimit: sessao.value.trim() === "" ? null : Number(sessao.value),
}));

const invalido = computed(() => {
  const n = novo.value;
  const minutos = n.sessionMinutesLimit;
  return (
    [n.maxStakeCents, n.dailyBetLimitCents, n.dailyLossLimitCents].some((v) => Number.isNaN(v)) ||
    (minutos !== null && (!Number.isInteger(minutos) || minutos < 1 || minutos > 1440))
  );
});

const bloqueado = computed(() => bloqueadoPelaCarencia(estado.value, novo.value, Date.now()));

const quando = (iso: string) =>
  new Date(iso).toLocaleString(locale.value === "pt" ? "pt-BR" : locale.value, {
    dateStyle: "short",
    timeStyle: "short",
  });

async function salvar() {
  erro.value = "";
  ok.value = "";
  if (invalido.value) {
    erro.value = t("limits.errInvalid");
    return;
  }
  busy.value = true;
  try {
    await salvarLimites(novo.value);
    preencher();
    ok.value = t("limits.saved");
  } catch (e: any) {
    const code = e?.data?.error;
    erro.value =
      code === "LOOSENING_TOO_SOON"
        ? t("limits.errTooSoon")
        : code === "INVALID_LIMIT" || code === "INVALID_BODY"
          ? t("limits.errInvalid")
          : t("limits.errFailed");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="limits">
    <h1>{{ t("limits.title") }}</h1>
    <p class="hint">{{ t("limits.intro") }}</p>

    <form @submit.prevent="salvar">
      <label>
        {{ t("limits.maxStake") }}
        <input v-model="maxStake" type="number" min="0.5" step="0.01" inputmode="decimal" />
      </label>
      <label>
        {{ t("limits.dailyBet") }}
        <input v-model="dailyBet" type="number" min="0.01" step="0.01" inputmode="decimal" />
      </label>
      <label>
        {{ t("limits.dailyLoss") }}
        <input v-model="dailyLoss" type="number" min="0.01" step="0.01" inputmode="decimal" />
      </label>
      <label>
        {{ t("limits.session") }}
        <input v-model="sessao" type="number" min="1" max="1440" step="1" inputmode="numeric" />
      </label>
      <p class="hint">{{ t("limits.emptyHint") }}</p>

      <p v-if="bloqueado && estado?.limitsLoosenableAt" class="warn">
        {{ t("limits.loosenBlocked", { when: quando(estado.limitsLoosenableAt) }) }}
      </p>

      <button type="submit" :disabled="busy || bloqueado">{{ t("limits.save") }}</button>
      <p v-if="erro" class="error">{{ erro }}</p>
      <p v-if="ok" class="ok">{{ ok }}</p>
    </form>
  </div>
</template>

<style scoped>
form { display: flex; flex-direction: column; gap: 0.8rem; max-width: 420px; }
label { display: flex; flex-direction: column; gap: 0.3rem; }
.hint { color: var(--muted); font-size: 0.9rem; }
.warn { color: #fcd34d; }
.error { color: #fca5a5; }
.ok { color: #86efac; }
</style>
