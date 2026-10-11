/**
 * Fog of war (docs/rules/vision.md). Each player has an explored bitset in state;
 * what is currently seen is derived from unit positions on demand.
 */
import { tileCount, tilesInRadius } from './grid.ts';
import type { Rules } from './rules.ts';
import type { GameState, Unit } from './state.ts';
import { CITY_RADIUS } from './territory.ts';
import type { Tx } from './tx.ts';

/** Sight radius in tiles: 1, or 2 from mountains or with radar. */
export function sightRadius(rules: Rules, state: GameState, u: Unit): number {
  const rule = rules.unit(u.type);
  let r = 1;
  if (rule.domain === 'land' && rules.terrains[state.map.terrain[u.tile]!]!.id === 'mountains') r = 2;
  if (rule.abilities.includes('radar')) r = Math.max(r, 2);
  return r;
}

export function unitSight(rules: Rules, state: GameState, u: Unit): number[] {
  return tilesInRadius(state.map, u.tile, sightRadius(rules, state, u));
}

/** 1 where the player currently sees the tile, else 0: around units and cities, and all own territory. */
export function visibleTiles(rules: Rules, state: GameState, player: number): Uint8Array {
  const out = new Uint8Array(tileCount(state.map));
  for (const u of Object.values(state.units)) {
    if (u.owner !== player) continue;
    for (const t of unitSight(rules, state, u)) out[t] = 1;
  }
  for (const c of Object.values(state.cities)) {
    if (c.owner !== player) continue;
    for (const t of tilesInRadius(state.map, c.tile, CITY_RADIUS)) out[t] = 1;
  }
  const terr = state.map.territory;
  for (let t = 0; t < terr.length; t++) if (terr[t] === player) out[t] = 1;
  return out;
}

/** Marks tiles explored for a player and reports the newly explored ones. */
export function reveal(tx: Tx, player: number, tiles: readonly number[], reason?: string): number[] {
  const current = tx.state.players[player]!;
  const fresh = tiles.filter((t) => ((current.explored[t >> 5]! >>> (t & 31)) & 1) === 0);
  if (fresh.length === 0) return fresh;
  const p = tx.player(player);
  for (const t of fresh) p.explored[t >> 5] = (p.explored[t >> 5]! | (1 << (t & 31))) >>> 0;
  const unique = [...new Set(fresh)].sort((a, b) => a - b);
  tx.emit({ type: 'tilesRevealed', player, tiles: unique, ...(reason === undefined ? {} : { reason }) });
  return unique;
}
