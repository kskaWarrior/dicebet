/**
 * Hand-rolled canvas confetti burst — no dependency, just gravity + fade.
 * Call `burst` on a win; a previous burst still animating is cancelled first.
 */

type Tier = "win" | "big";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  life: number; // 0..1, counts down
}

const COLORS = ["#86efac", "#fde68a", "#93c5fd", "#f9a8d4", "#ffffff"];

const COUNT: Record<Tier, number> = { win: 30, big: 70 };
const SPEED: Record<Tier, number> = { win: 5, big: 8 };

let frame = 0;

export function useConfetti() {
  function burst(canvas: HTMLCanvasElement, tier: Tier) {
    cancelAnimationFrame(frame);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const count = COUNT[tier];
    const speed = SPEED[tier];

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: width / 2,
      y: height / 2,
      vx: (Math.random() - 0.5) * speed * 2,
      vy: -Math.random() * speed - 2,
      size: 4 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 1,
    }));

    const gravity = 0.35;
    const started = performance.now();
    const maxLifeMs = 1400;

    function tick(now: number) {
      ctx!.clearRect(0, 0, width, height);
      const elapsed = now - started;
      let alive = false;

      for (const p of particles) {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        p.life = Math.max(0, 1 - elapsed / maxLifeMs);
        if (p.life <= 0 || p.y > height + 20) continue;
        alive = true;

        ctx!.save();
        ctx!.globalAlpha = p.life;
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx!.restore();
      }

      if (alive && elapsed < maxLifeMs) {
        frame = requestAnimationFrame(tick);
      } else {
        ctx!.clearRect(0, 0, width, height);
      }
    }

    frame = requestAnimationFrame(tick);
  }

  function clear(canvas: HTMLCanvasElement) {
    cancelAnimationFrame(frame);
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { burst, clear };
}
