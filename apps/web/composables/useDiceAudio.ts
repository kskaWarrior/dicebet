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

let noiseBuffer: AudioBuffer | null = null;

/** Half a second of white noise, generated once and reused for every clack. */
function getNoiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/**
 * One ice hit: a dull broadband thock (low-Q bandpass, very fast decay).
 * Real ice cubes don't ring — a low Q keeps the hit "wet" and unmetallic.
 */
function iceHit(ac: AudioContext, time: number, loudness: number) {
  const src = ac.createBufferSource();
  src.buffer = getNoiseBuffer(ac);
  src.playbackRate.value = 0.7 + Math.random() * 0.5;

  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900 + Math.random() * 1100;
  filter.Q.value = 2.2;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(loudness, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(time, Math.random() * 0.4, 0.05);
}

/** The throw: the deep heavy knock with a long ring, plus a high tap. */
function tableKnock(ac: AudioContext, time: number) {
  const osc = ac.createOscillator();
  osc.type = "sine";
  const startFreq = 110 + Math.random() * 70;
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.12);

  const bodyGain = ac.createGain();
  bodyGain.gain.setValueAtTime(0.35, time);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);

  osc.connect(bodyGain).connect(ac.destination);
  osc.start(time);
  osc.stop(time + 0.3);

  const src = ac.createBufferSource();
  src.buffer = getNoiseBuffer(ac);
  src.playbackRate.value = 0.8 + Math.random() * 0.4;

  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 3000;

  const tapGain = ac.createGain();
  tapGain.gain.setValueAtTime(0.085, time);
  tapGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);

  src.connect(filter).connect(tapGain).connect(ac.destination);
  src.start(time, Math.random() * 0.4, 0.03);
}

export function useDiceAudio() {
  const muted = useMuted();

  /** Cup-shake: bursts of tumbling ice — one cluster of hits per swing of the
   *  cup, near-silence between swings — then the deep knock as the dice land. */
  function playShake(ms: number) {
    if (muted.value) return;
    const ac = audioCtx();
    const start = ac.currentTime;
    const total = ms / 1000;
    const throwAt = Math.max(0, total - 0.13); // the throw lands just before reveal

    // two long swings with a short 0.17s breath between them; the second
    // rattles right up to the throw so there's no dead air before the knock
    const firstStart = 0.03;
    const firstDur = 0.55;
    const secondStart = firstStart + firstDur + 0.17;
    const bursts: Array<[number, number]> = [
      [firstStart, firstDur],
      [secondStart, Math.max(0.3, throwAt - secondStart)],
    ];
    for (const [burstStart, burstDur] of bursts) {
      const hits = 9 + Math.floor(Math.random() * 4);
      for (let i = 0; i < hits; i++) {
        const t = burstStart + Math.random() * burstDur;
        if (t < throwAt) iceHit(ac, start + t, 0.1 + Math.random() * 0.12);
      }
    }
    tableKnock(ac, start + throwAt);
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
    blip(now, 130.81, 0.25, "triangle", 0.104); // C3
  }

  return { playShake, playWin, playLose, muted };
}
