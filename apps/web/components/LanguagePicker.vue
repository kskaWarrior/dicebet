<script setup lang="ts">
import type { Locale } from "~/composables/useI18n";

const { t, locale, setLocale } = useI18n();
const open = ref(false);

const options: Array<{ code: Locale; name: string }> = [
  { code: "en", name: "English" },
  { code: "pt", name: "Português (Brasil)" },
  { code: "es", name: "Español" },
];

function pick(code: Locale) {
  setLocale(code);
  open.value = false;
}
</script>

<template>
  <div class="picker">
    <button class="trigger" :title="t('lang.title')" @click="open = !open">
      <FlagIcon :code="locale" />
      <span class="caret">▾</span>
    </button>
    <ul v-if="open" class="menu">
      <li v-for="o in options" :key="o.code">
        <button class="option" :class="{ active: o.code === locale }" @click="pick(o.code)">
          <FlagIcon :code="o.code" />
          <span>{{ o.name }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker { position: relative; }
.trigger {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 0.35rem 0.5rem;
}
.caret { font-size: 0.7rem; color: var(--muted); }
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  z-index: 20;
  min-width: 190px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
.option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  background: transparent;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  text-align: left;
  color: var(--text);
  font-size: 0.92rem;
  white-space: nowrap;
}
.option:hover { background: var(--border); }
.option.active { color: var(--link); }
</style>
