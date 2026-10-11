/**
 * Seeded PRNG (sfc32). Its state is four uint32 words stored in game state, so a game
 * is reproducible from seed + commands. Integer-only, identical in every JS engine.
 */

export type RngState = [number, number, number, number];

/** Expands a 32-bit seed into a well-mixed generator state. */
export function seedRng(seed: number): RngState {
  const s: RngState = [0x9e3779b9, 0x243f6a88, 0xb7e15162, seed >>> 0];
  for (let i = 0; i < 15; i++) nextUint32(s);
  return s;
}

/** Advances `s` in place and returns the next uint32. */
export function nextUint32(s: RngState): number {
  let [a, b, c, d] = s;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return t >>> 0;
}

/** Uniform integer in [0, n). */
export function nextInt(s: RngState, n: number): number {
  if (n <= 1) return 0;
  return nextUint32(s) % n;
}

/** True with probability percent/100. */
export function chance(s: RngState, percent: number): boolean {
  return nextInt(s, 100) < percent;
}

/** A small stateful generator for code that owns its stream (the map generator). */
export interface Rng {
  int(n: number): number;
  chance(percent: number): boolean;
  pick<T>(xs: readonly T[]): T;
  shuffle<T>(xs: T[]): T[];
}

export function makeRng(seed: number): Rng {
  const s = seedRng(seed);
  return {
    int: (n) => nextInt(s, n),
    chance: (p) => chance(s, p),
    pick: (xs) => xs[nextInt(s, xs.length)]!,
    shuffle: (xs) => {
      for (let i = xs.length - 1; i > 0; i--) {
        const j = nextInt(s, i + 1);
        [xs[i], xs[j]] = [xs[j]!, xs[i]!];
      }
      return xs;
    },
  };
}

/** Integer hash of up to three ints; used for deterministic per-tile variation. */
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
