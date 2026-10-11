/**
 * Derived-data caches (empire facts, which city works which tile, …) are keyed by state
 * objects. A transaction mutates its own copy in place, so every write through the
 * transaction drops the caches for that copy; the next query recomputes them.
 */
import type { GameState } from './state.ts';

const clearers: ((state: GameState) => void)[] = [];

export function registerCache(clear: (state: GameState) => void): void {
  clearers.push(clear);
}

export function invalidateCaches(state: GameState): void {
  for (const clear of clearers) clear(state);
}
