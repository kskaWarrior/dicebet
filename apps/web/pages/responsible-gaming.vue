<script setup lang="ts">
import {
  FRASE_CONFIRMACAO,
  PERIODOS_AUTOEXCLUSAO_DIAS,
  confirmacaoAutoexclusaoValida,
} from "../shared/jogo-responsavel.js";

// Ajuda + autoexclusão (ADR-0003). Isenta do gate 18+ (shared/rotas-sem-gate-maioridade.ts):
// quem procura ajuda não precisa declarar idade. A autoexclusão exige login e a palavra
// digitada; a regra "não encurta enquanto vigora" é da RPC `self_exclude`.
const { t, locale } = useI18n();
const { estado, carregar, autoexcluir, logado } = useJogoResponsavel();

const temSessao = ref(false);
const dias = ref<number>(PERIODOS_AUTOEXCLUSAO_DIAS[0]);
const digitado = ref("");
const busy = ref(false);
const erro = ref("");
const feito = ref("");

onMounted(async () => {
  temSessao.value = await logado();
  if (!temSessao.value) return;
  try {
    await carregar();
  } catch {
    /* segue mostrando a ajuda */
  }
});

const ativaAte = computed(() => {
  const ate = estado.value?.selfExcludedUntil;
  return ate && Date.parse(ate) > Date.now() ? ate : null;
});

const podeConfirmar = computed(() => confirmacaoAutoexclusaoValida(digitado.value) && !busy.value);

const quando = (iso: string) =>
  new Date(iso).toLocaleString(locale.value === "pt" ? "pt-BR" : locale.value, { dateStyle: "long" });

async function confirmar() {
  if (!podeConfirmar.value) return;
  erro.value = "";
  busy.value = true;
  try {
    const ate = await autoexcluir(dias.value);
    feito.value = t("rg.selfDone", { when: quando(ate) });
    digitado.value = "";
  } catch (e: any) {
    erro.value = e?.data?.error === "SHORTENING_SELF_EXCLUSION" ? t("rg.errShorten") : t("rg.errFailed");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="rg">
    <h1>{{ t("rg.title") }}</h1>
    <p>{{ t("rg.intro") }}</p>
    <p class="help">{{ t("rg.help") }}</p>
    <p v-if="temSessao"><NuxtLink to="/limits">{{ t("rg.limitsLink") }}</NuxtLink></p>

    <section>
      <h2>{{ t("rg.selfTitle") }}</h2>
      <p class="hint">{{ t("rg.selfText") }}</p>

      <p v-if="!temSessao">
        <NuxtLink to="/login">{{ t("rg.loginToExclude") }}</NuxtLink>
      </p>
      <template v-else>
        <p v-if="ativaAte" class="warn">{{ t("rg.selfActive", { when: quando(ativaAte) }) }}</p>
        <div class="periodos" role="radiogroup">
          <label v-for="n in PERIODOS_AUTOEXCLUSAO_DIAS" :key="n">
            <input v-model="dias" type="radio" name="periodo" :value="n" />
            {{ t("rg.days", { n }) }}
          </label>
        </div>
        <label class="confirm">
          {{ t("rg.confirmLabel", { word: FRASE_CONFIRMACAO }) }}
          <input v-model="digitado" type="text" autocomplete="off" :placeholder="FRASE_CONFIRMACAO" />
        </label>
        <button class="danger" :disabled="!podeConfirmar" @click="confirmar">{{ t("rg.selfButton") }}</button>
        <p v-if="erro" class="error">{{ erro }}</p>
        <p v-if="feito" class="ok">{{ feito }}</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
section { margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.8rem; max-width: 460px; }
.periodos { display: flex; gap: 1rem; flex-wrap: wrap; }
.confirm { display: flex; flex-direction: column; gap: 0.3rem; }
.help { font-weight: 600; }
.hint { color: var(--muted); font-size: 0.9rem; }
.warn { color: #fcd34d; }
.error { color: #fca5a5; }
.ok { color: #86efac; }
.danger { background: #b91c1c; }
</style>
