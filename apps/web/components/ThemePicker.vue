<script setup lang="ts">
const { t } = useI18n();
const { theme, setTheme } = useTheme();
</script>

<template>
  <div class="swatches" :title="t('theme.title')">
    <button
      v-for="option in THEMES"
      :key="option"
      class="swatch"
      :class="{ active: theme === option }"
      :style="{ background: THEME_ACCENTS[option] }"
      :aria-label="t(`theme.${option}`)"
      :title="t(`theme.${option}`)"
      @click="setTheme(option)"
    />
  </div>
</template>

<style scoped>
.swatches {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
}
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  padding: 0;
  border: 2px solid transparent;
}
.swatch.active {
  border-color: var(--text);
}
</style>
