/**
 * Derived-data caches (empire facts, which city works which tile, …) are keyed by state
 * objects. A transaction mutates its own copy in place, so every write through the
 * transaction drops the caches for that copy; the next query recomputes them.
 *
 * Some caches outlive a state because they are keyed by map arrays, which a
 * transaction copies before changing (trade networks, land masses). Code that edits a
 * state in place outside a transaction (tests, scenario set-up) calls the exported
 * `invalidateCaches`, which forgets those too.
 */
import type { GameState } from './state.ts';

const clearers: ((state: GameState) => void)[] = [];
const arrayClearers: ((state: GameState) => void)[] = [];

export function registerCache(clear: (state: GameState) => void): void {
  clearers.push(clear);
}

/** For caches keyed by map arrays: cleared only by `invalidateEverything`. */
export function registerArrayCache(clear: (state: GameState) => void): void {
  arrayClearers.push(clear);
}

export function invalidateCaches(state: GameState): void {
  for (const clear of clearers) clear(state);
}

/** After editing a state in place: forgets everything derived from it, map-array caches included. */
export function invalidateEverything(state: GameState): void {
  invalidateCaches(state);
  for (const clear of arrayClearers) clear(state);
}
