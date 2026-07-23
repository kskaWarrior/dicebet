<script setup lang="ts">
// Inline SVG flags — emoji flags don't render on Windows browsers.
defineProps<{ code: "en" | "pt" | "es" }>();
</script>

<template>
  <!-- US flag -->
  <svg v-if="code === 'en'" class="flag" viewBox="0 0 20 14" aria-hidden="true">
    <rect width="20" height="14" fill="#b22234" />
    <rect y="2" width="20" height="2" fill="#fff" />
    <rect y="6" width="20" height="2" fill="#fff" />
    <rect y="10" width="20" height="2" fill="#fff" />
    <rect width="9" height="7" fill="#3c3b6e" />
  </svg>
  <!-- Brazil flag -->
  <svg v-else-if="code === 'pt'" class="flag" viewBox="0 0 20 14" aria-hidden="true">
    <rect width="20" height="14" fill="#009c3b" />
    <polygon points="10,1.5 18.5,7 10,12.5 1.5,7" fill="#ffdf00" />
    <circle cx="10" cy="7" r="2.7" fill="#002776" />
  </svg>
  <!-- Spain flag -->
  <svg v-else class="flag" viewBox="0 0 20 14" aria-hidden="true">
    <rect width="20" height="14" fill="#aa151b" />
    <rect y="3.5" width="20" height="7" fill="#f1bf00" />
  </svg>
</template>

<style scoped>
.flag {
  width: 20px;
  height: 14px;
  border-radius: 2px;
  flex-shrink: 0;
  display: block;
}
</style>
