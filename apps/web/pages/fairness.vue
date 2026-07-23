<script setup lang="ts">
interface CurrentSeed { serverSeedHash: string; clientSeed: string; nonce: number }
interface RevealedSeed { server_seed: string; server_seed_hash: string; client_seed: string; nonce: number; revealed_at: string }

const api = useApi();
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
    <h1>Provably fair</h1>
    <p class="hint">
      Every roll is HMAC-SHA256(serverSeed, clientSeed:nonce). The server commits to
      sha256(serverSeed) <em>before</em> you bet; rotating reveals the seed so you can
      re-verify every past roll below — no trust required.
    </p>

    <section v-if="current">
      <h2>Current seed pair</h2>
      <dl>
        <dt>Server seed hash (commitment)</dt><dd class="mono">{{ current.serverSeedHash }}</dd>
        <dt>Client seed</dt><dd class="mono">{{ current.clientSeed }}</dd>
        <dt>Next nonce</dt><dd class="mono">{{ current.nonce }}</dd>
      </dl>
      <form class="rotate" @submit.prevent="rotate">
        <input v-model="newClientSeed" placeholder="new client seed (optional)" maxlength="64" />
        <button :disabled="busy" type="submit">Rotate & reveal</button>
      </form>
    </section>

    <section>
      <h2>Verify a roll</h2>
      <div class="verify">
        <input v-model="vServerSeed" placeholder="revealed server seed" class="mono" />
        <input v-model="vClientSeed" placeholder="client seed" class="mono" />
        <input v-model.number="vNonce" type="number" min="0" placeholder="nonce" />
        <button @click="verify">Compute</button>
      </div>
      <div v-if="vResult">
        <p>Roll: <strong class="mono">{{ vResult.roll.toFixed(2) }}</strong></p>
        <p class="hint">sha256 of that seed: <span class="mono">{{ vResult.hash }}</span><br />
          — must match the commitment shown before your bets.</p>
      </div>
    </section>

    <section>
      <h2>Revealed seeds</h2>
      <p v-if="!revealed.length" class="hint">Nothing revealed yet — rotate the seed above after playing.</p>
      <div v-for="seed in revealed" :key="seed.server_seed_hash" class="revealed">
        <dl>
          <dt>Server seed</dt><dd class="mono">{{ seed.server_seed }}</dd>
          <dt>Hash</dt><dd class="mono">{{ seed.server_seed_hash }}</dd>
          <dt>Client seed / bets played</dt><dd class="mono">{{ seed.client_seed }} / {{ seed.nonce }}</dd>
        </dl>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fair { display: flex; flex-direction: column; gap: 1.5rem; }
.hint { color: #9aa3c7; font-size: 0.9rem; }
.mono { font-family: ui-monospace, monospace; font-size: 0.85rem; word-break: break-all; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; }
dt { color: #9aa3c7; }
dd { margin: 0; }
.rotate, .verify { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
.verify input { flex: 1 1 200px; }
.revealed { border: 1px solid #2c3352; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.75rem; }
</style>
