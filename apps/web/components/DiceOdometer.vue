<script setup lang="ts">
interface Props {
  target: number;
  value: number | null;
  state: "idle" | "rolling" | "won" | "lost";
}

const props = defineProps<Props>();

/** Four digits [tens, ones, tenths, hundredths] of a 0-99.99 value. */
const digits = computed(() => {
  const shown = props.value ?? props.target;
  const clamped = Math.min(99.99, Math.max(0, shown));
  const [whole, frac = "00"] = clamped.toFixed(2).split(".");
  return `${whole.padStart(2, "0")}${frac}`.split("").map(Number);
});
</script>

<template>
  <div class="odometer" :class="[state]" role="img" :aria-label="String((value ?? target).toFixed(2))">
    <div v-for="(digit, i) in digits.slice(0, 2)" :key="i" class="reel" :style="{ transitionDelay: `${i * 70}ms` }">
      <div class="strip" :style="{ transform: `translateY(-${digit * 10}%)` }">
        <span v-for="n in 10" :key="n - 1">{{ n - 1 }}</span>
      </div>
    </div>
    <span class="sep">.</span>
    <div v-for="(digit, i) in digits.slice(2)" :key="`f${i}`" class="reel" :style="{ transitionDelay: `${(i + 2) * 70}ms` }">
      <div class="strip" :style="{ transform: `translateY(-${digit * 10}%)` }">
        <span v-for="n in 10" :key="n - 1">{{ n - 1 }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.odometer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0.6rem 0.8rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--muted);
  transition: color 0.2s ease-out, border-color 0.2s ease-out;
}
.odometer.rolling {
  color: var(--text);
}
.odometer.won {
  color: #86efac;
  border-color: #86efac;
}
.odometer.lost {
  color: #fca5a5;
  border-color: #fca5a5;
}
.reel {
  height: 1.9rem;
  width: 1.15rem;
  overflow: hidden;
}
.strip {
  display: flex;
  flex-direction: column;
  transition: transform 0.45s cubic-bezier(0.15, 0.85, 0.25, 1);
}
.strip span {
  height: 1.9rem;
  line-height: 1.9rem;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.sep {
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0 0.1rem;
}
@media (prefers-reduced-motion: reduce) {
  .strip {
    transition: none;
  }
}
</style>
