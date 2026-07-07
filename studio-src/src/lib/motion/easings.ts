/* ═══════════════════════════════════════════════════════
   Motion Studio — easing functions
   All take t in [0,1] and return eased progress in [0,1].
   ═══════════════════════════════════════════════════════ */

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Expo-style ease-out — the "snappy" motion-graphics feel. */
export const easeOutExpo = (t: number) =>
  t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);

/** Quintic ease-out — smooth settle, close to cubic-bezier(0.22,1,0.36,1). */
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const easeInCubic = (t: number) => t * t * t;

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Slight overshoot, for scale-in pops. */
export const easeOutBack = (t: number) => {
  const c1 = 1.20158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Normalized progress of time t within [start, start+dur], eased. */
export function seg(
  t: number,
  start: number,
  dur: number,
  ease: (x: number) => number = easeOutQuint,
): number {
  if (dur <= 0) return t >= start ? 1 : 0;
  return ease(clamp01((t - start) / dur));
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export function hashRandom(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
