/**
 * Integer value noise for the map generator. Periodic in x so wrapping maps have no
 * seam. Output range 0..1023. No floating-point transcendentals, so every JS engine
 * produces the same map from the same seed.
 */
import { hash3 } from '../rng.ts';

const ONE = 1024;

function fade(t: number): number {
  // smoothstep in 0..1024 fixed point: t² (3 - 2t)
  return (t * t * (3 * ONE - 2 * t)) / (ONE * ONE) | 0;
}

/**
 * One octave: `cellsX` lattice cells across the full width (periodic), cells of the
 * same size vertically.
 */
export function valueNoise(seed: number, x: number, y: number, width: number, cellsX: number): number {
  // Position in lattice units, fixed point 1024.
  const fx = Math.floor((x * cellsX * ONE) / width);
  const fy = Math.floor((y * cellsX * ONE) / width);
  const cx = Math.floor(fx / ONE);
  const cy = Math.floor(fy / ONE);
  const tx = fade(fx - cx * ONE);
  const ty = fade(fy - cy * ONE);
  const wrap = (c: number) => ((c % cellsX) + cellsX) % cellsX;
  const v = (i: number, j: number) => hash3(seed, wrap(i), j) & 1023;
  const a = v(cx, cy);
  const b = v(cx + 1, cy);
  const c = v(cx, cy + 1);
  const d = v(cx + 1, cy + 1);
  const top = a + (((b - a) * tx) >> 10);
  const bottom = c + (((d - c) * tx) >> 10);
  return top + (((bottom - top) * ty) >> 10);
}

/** Fractal sum of octaves, each with twice the cells and half the weight. Range 0..1023. */
export function fractalNoise(seed: number, x: number, y: number, width: number, baseCells: number, octaves: number): number {
  let total = 0;
  let weight = 512;
  let weights = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    total += valueNoise(seed + o * 7919, x, y, width, cells) * weight;
    weights += weight;
    weight >>= 1;
    cells *= 2;
  }
  return Math.floor(total / weights);
}
