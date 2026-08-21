<script setup lang="ts">
interface Props {
  target: number;
  value: number | null;
  state: "idle" | "rolling" | "won" | "lost";
}

const props = defineProps<Props>();

const CX = 100;
const CY = 100;
const R = 82;

/** Map a roll value in [0, 100] to an angle in degrees, -180 (left) to 0 (right). */
function angleFor(v: number): number {
  return -180 + (Math.min(100, Math.max(0, v)) / 100) * 180;
}

function pointOnArc(v: number, radius: number): { x: number; y: number } {
  const rad = (angleFor(v) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function arcPath(from: number, to: number): string {
  const start = pointOnArc(from, R);
  const end = pointOnArc(to, R);
  const largeArc = to - from > 100 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

const winPath = computed(() => arcPath(0, props.target));
const losePath = computed(() => arcPath(props.target, 100));

const markerLine = computed(() => {
  const inner = pointOnArc(props.target, R - 10);
  const outer = pointOnArc(props.target, R + 10);
  return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
});

const needleAngle = computed(() => angleFor(props.value ?? props.target));
const needleVisible = computed(() => props.value !== null);
</script>

<template>
  <svg class="gauge" viewBox="0 0 200 115" aria-hidden="true">
    <path :d="winPath" class="zone win" />
    <path :d="losePath" class="zone lose" />
    <line :x1="markerLine.x1" :y1="markerLine.y1" :x2="markerLine.x2" :y2="markerLine.y2" class="marker" />
    <g class="needle" :class="[state]" :style="{ opacity: needleVisible ? 1 : 0, transform: `rotate(${needleAngle}deg)` }">
      <line x1="100" y1="100" x2="100" y2="26" />
      <circle cx="100" cy="100" r="5" />
    </g>
  </svg>
</template>

<style scoped>
.gauge {
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
  display: block;
}
.zone {
  fill: none;
  stroke-width: 14;
  stroke-linecap: butt;
}
.zone.win {
  stroke: var(--muted);
  opacity: 0.35;
}
.zone.lose {
  stroke: var(--border);
}
.marker {
  stroke: var(--text);
  stroke-width: 2;
}
.needle {
  transform-origin: 100px 100px;
  transition: transform 0.2s ease-out, opacity 0.15s ease-out;
}
.needle line {
  stroke: var(--muted);
  stroke-width: 3;
  stroke-linecap: round;
}
.needle circle {
  fill: var(--muted);
}
.needle.won line,
.needle.won circle {
  stroke: #86efac;
  fill: #86efac;
}
.needle.lost line,
.needle.lost circle {
  stroke: #fca5a5;
  fill: #fca5a5;
}
@media (prefers-reduced-motion: reduce) {
  .needle {
    transition: none;
  }
}
</style>
