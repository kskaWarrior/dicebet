/**
 * Dice sounds synthesized with the Web Audio API — no audio assets to load.
 * The AudioContext is created lazily on the first user tap, which also
 * satisfies browser autoplay policies.
 */

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function useMuted() {
  return useState("muted", () => false);
}

function blip(time: number, freq: number, duration: number, type: OscillatorType, gainValue: number) {
  const ac = audioCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(gainValue, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(time);
  osc.stop(time + duration);
}

export function useDiceAudio() {
  const muted = useMuted();

  /** Rattling dice: a burst of short clicks at random pitches over `ms`. */
  function playShake(ms: number) {
    if (muted.value) return;
    const ac = audioCtx();
    const start = ac.currentTime;
    for (let t = 0; t < ms / 1000; t += 0.07 + Math.random() * 0.05) {
      blip(start + t, 1800 + Math.random() * 1600, 0.03, "square", 0.04);
    }
  }

  /** Two ascending chime notes. */
  function playWin() {
    if (muted.value) return;
    const now = audioCtx().currentTime;
    blip(now, 523.25, 0.18, "sine", 0.12); // C5
    blip(now + 0.12, 783.99, 0.35, "sine", 0.12); // G5
  }

  /** A single low thud. */
  function playLose() {
    if (muted.value) return;
    const now = audioCtx().currentTime;
    blip(now, 130.81, 0.25, "triangle", 0.15); // C3
  }

  return { playShake, playWin, playLose, muted };
}
