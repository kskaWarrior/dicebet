<script setup lang="ts">
const supabase = useSupabase();
const email = ref("");
const password = ref("");
const mode = ref<"signin" | "signup">("signin");
const error = ref("");
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = "";
  const creds = { email: email.value, password: password.value };
  const { error: err } =
    mode.value === "signin"
      ? await supabase.auth.signInWithPassword(creds)
      : await supabase.auth.signUp(creds);
  busy.value = false;
  if (err) {
    error.value = err.message;
    return;
  }
  navigateTo("/");
}
</script>

<template>
  <div class="card">
    <h1>{{ mode === "signin" ? "Sign in" : "Create account" }}</h1>
    <form @submit.prevent="submit">
      <input v-model="email" type="email" placeholder="email" required autocomplete="email" />
      <input
        v-model="password"
        type="password"
        placeholder="password (min 6 chars)"
        required
        minlength="6"
        autocomplete="current-password"
      />
      <button :disabled="busy" type="submit">
        {{ mode === "signin" ? "Sign in" : "Sign up — get $10 free demo coins" }}
      </button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
    <p>
      <a href="#" @click.prevent="mode = mode === 'signin' ? 'signup' : 'signin'">
        {{ mode === "signin" ? "No account? Sign up" : "Have an account? Sign in" }}
      </a>
    </p>
  </div>
</template>

<style scoped>
.card { max-width: 360px; margin: 3rem auto; display: flex; flex-direction: column; gap: 0.75rem; }
form { display: flex; flex-direction: column; gap: 0.75rem; }
.error { color: #fca5a5; }
</style>
