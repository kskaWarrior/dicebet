<script setup lang="ts">
interface CurrentSeed { serverSeedHash: string; clientSeed: string; nonce: number }
interface RevealedSeed { server_seed: string; server_seed_hash: string; client_seed: string; nonce: number; revealed_at: string }

const api = useApi();
const { t } = useI18n();
const current = ref<CurrentSeed | null>(null);
const revealed = ref<RevealedSeed[]>([]);
const newClientSeed = ref("");
const busy = ref(false);

// Verifier inputs
const vServerSeed = ref("");
const vClientSeed = ref("");
const vNonce = ref(0);
const vResult = ref<{ roll: number; hash: string } | null>(null);

onMounted(load);

async function load() {
  const [cur, rev] = await Promise.all([
    api<CurrentSeed>("/seeds/current"),
    api<{ seeds: RevealedSeed[] }>("/seeds/revealed"),
  ]);
  current.value = cur;
  revealed.value = rev.seeds;
}

async function rotate() {
  busy.value = true;
  try {
    await api("/seeds/rotate", {
      method: "POST",
      body: newClientSeed.value ? { clientSeed: newClientSeed.value } : {},
    });
    newClientSeed.value = "";
    await load();
  } finally {
    busy.value = false;
  }
}

/** Recompute a roll entirely client-side with Web Crypto — same math as the server. */
async function verify() {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(vServerSeed.value), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${vClientSeed.value}:${vNonce.value}`)),
  );
  const view = new DataView(mac.buffer);
  const roll = Math.floor((view.getUint32(0) / 2 ** 32) * 10000) / 100;

  const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(vServerSeed.value)));
  const hash = [...hashBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  vResult.value = { roll, hash };
}
</script>

<template>
  <div class="fair">
    <h1>{{ t("fair.title") }}</h1>
    <p class="hint">{{ t("fair.explain") }}</p>

    <section v-if="current">
      <h2>{{ t("fair.current") }}</h2>
      <dl>
        <dt>{{ t("fair.hashCommit") }}</dt><dd class="mono">{{ current.serverSeedHash }}</dd>
        <dt>{{ t("fair.clientSeed") }}</dt><dd class="mono">{{ current.clientSeed }}</dd>
        <dt>{{ t("fair.nextNonce") }}</dt><dd class="mono">{{ current.nonce }}</dd>
      </dl>
      <form class="rotate" @submit.prevent="rotate">
        <input v-model="newClientSeed" :placeholder="t('fair.newSeedPh')" maxlength="64" />
        <button :disabled="busy" type="submit">{{ t("fair.rotate") }}</button>
      </form>
    </section>

    <section>
      <h2>{{ t("fair.verify") }}</h2>
      <div class="verify">
        <input v-model="vServerSeed" :placeholder="t('fair.serverSeedPh')" class="mono" />
        <input v-model="vClientSeed" :placeholder="t('fair.clientSeedPh')" class="mono" />
        <input v-model.number="vNonce" type="number" min="0" :placeholder="t('fair.noncePh')" />
        <button @click="verify">{{ t("fair.compute") }}</button>
      </div>
      <div v-if="vResult">
        <p>{{ t("fair.rollLabel") }} <strong class="mono">{{ vResult.roll.toFixed(2) }}</strong></p>
        <p class="hint">{{ t("fair.hashNote1") }} <span class="mono">{{ vResult.hash }}</span><br />
          {{ t("fair.hashNote2") }}</p>
      </div>
    </section>

    <section>
      <h2>{{ t("fair.revealedTitle") }}</h2>
      <p v-if="!revealed.length" class="hint">{{ t("fair.noneRevealed") }}</p>
      <div v-for="seed in revealed" :key="seed.server_seed_hash" class="revealed">
        <dl>
          <dt>{{ t("fair.serverSeed") }}</dt><dd class="mono">{{ seed.server_seed }}</dd>
          <dt>{{ t("fair.hash") }}</dt><dd class="mono">{{ seed.server_seed_hash }}</dd>
          <dt>{{ t("fair.seedStats") }}</dt><dd class="mono">{{ seed.client_seed }} / {{ seed.nonce }}</dd>
        </dl>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fair { display: flex; flex-direction: column; gap: 1.5rem; }
.hint { color: var(--muted); font-size: 0.9rem; }
.mono { font-family: ui-monospace, monospace; font-size: 0.85rem; word-break: break-all; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; }
dt { color: var(--muted); }
dd { margin: 0; }
.rotate, .verify { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
.verify input { flex: 1 1 200px; }
.revealed { border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.75rem; }
</style>
