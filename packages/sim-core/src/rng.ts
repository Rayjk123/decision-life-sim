// Deterministic randomness. Every draw is keyed by (seed, purpose, month, sim...) so a world replays
// exactly and the order in which sims are processed never changes results.

function hashString(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next(): number;                          // [0, 1)
  range(lo: number, hi: number): number;   // [lo, hi)
  int(lo: number, hiInclusive: number): number;
  chance(p: number): boolean;
  normal(mean?: number, sd?: number): number;
  pick<T>(xs: readonly T[]): T;
}

export function rngFor(seed: number, ...keys: Array<string | number>): Rng {
  const next = mulberry32(hashString(`${seed}|${keys.join('|')}`));
  const r: Rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (xs) => xs[Math.floor(next() * xs.length)],
  };
  return r;
}

/** One uniform draw keyed by purpose: used for the "dice roll" that picks a move. */
export function drawFor(seed: number, ...keys: Array<string | number>): number {
  return mulberry32(hashString(`${seed}|draw|${keys.join('|')}`))();
}

export function stableHash(s: string): number {
  return hashString(s);
}
