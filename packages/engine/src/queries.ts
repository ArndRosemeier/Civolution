/**
 * Small read-only helpers over state shared by the mechanics and the UI.
 */
import type { UnitRule } from '@civolution/data-schema';
import { DIR_EDGE, neighbour, tileCount, type Grid } from './grid.ts';
import type { Rules } from './rules.ts';
import { FLAG_LAKE, type GameState, type Player, type Unit } from './state.ts';

export function grid(state: GameState): Grid {
  return state.map;
}

export function unitsAt(state: GameState, tile: number): Unit[] {
  const out: Unit[] = [];
  for (const u of Object.values(state.units)) if (u.tile === tile) out.push(u);
  return out.sort((a, b) => a.id - b.id);
}

/** All units indexed by tile; cheaper than unitsAt in loops. */
export function unitsByTile(state: GameState): Map<number, Unit[]> {
  const m = new Map<number, Unit[]>();
  for (const u of Object.values(state.units)) {
    const list = m.get(u.tile);
    if (list) list.push(u);
    else m.set(u.tile, [u]);
  }
  return m;
}

export function playerUnits(state: GameState, player: number): Unit[] {
  return Object.values(state.units)
    .filter((u) => u.owner === player)
    .sort((a, b) => a.id - b.id);
}

export function unitRule(rules: Rules, u: Unit): UnitRule {
  return rules.unit(u.type);
}

export function maxMoves(rules: Rules, u: Unit): number {
  return rules.unit(u.type).movement * rules.moveScale;
}

export function knowsTech(p: Player, tech: string): boolean {
  return p.techs.includes(tech);
}

/** True if the player knows a tech carrying `flag` (for example "enablesBridges"). */
export function hasTechFlag(rules: Rules, p: Player, flag: string): boolean {
  return p.techs.some((t) => rules.tech(t).flags.includes(flag));
}

/** Whether a and b are at war; everyone is always at war with the barbarians. */
export function atWar(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  const pa = state.players[a];
  const pb = state.players[b];
  if (!pa || !pb) return false;
  if (pa.barbarian || pb.barbarian) return true;
  return pa.atWarWith.includes(b);
}

export function isWaterTile(rules: Rules, state: GameState, tile: number): boolean {
  return rules.terrains[state.map.terrain[tile]!]!.water;
}

export function isExplored(p: Player, tile: number): boolean {
  return ((p.explored[tile >> 5]! >>> (tile & 31)) & 1) === 1;
}

export function exploredCount(p: Player): number {
  let c = 0;
  for (const w of p.explored) {
    let v = w >>> 0;
    while (v) {
      v &= v - 1;
      c++;
    }
  }
  return c;
}

export function emptyBitset(g: Grid): number[] {
  return new Array<number>(Math.ceil(tileCount(g) / 32)).fill(0);
}

/** Whether moving from `from` in direction `dir` crosses a river (docs/rules/movement.md). */
export function crossesRiver(state: GameState, from: number, dir: number): boolean {
  const m = state.map;
  const edge = DIR_EDGE[dir]!;
  if (edge !== 0) return (m.rivers[from]! & edge) !== 0;
  // Corner move: blocked if both ways around the shared corner cross a river edge.
  const left = (dir + 7) % 8;
  const right = (dir + 1) % 8;
  const l = neighbour(m, from, left);
  const r = neighbour(m, from, right);
  const to = neighbour(m, from, dir);
  const edgeBetween = (a: number, b: number, dirAB: number) => a >= 0 && b >= 0 && (m.rivers[a]! & DIR_EDGE[dirAB]!) !== 0;
  // from -> left neighbour is direction `left`; left -> to is direction `right` (the edge on the far side).
  const viaLeft = edgeBetween(from, l, left) || edgeBetween(l, to, right);
  const viaRight = edgeBetween(from, r, right) || edgeBetween(r, to, left);
  return viaLeft && viaRight;
}

/** Fresh water next to a tile: a river on its edges, or a lake or irrigated tile sharing an edge. */
export function hasFreshWaterAccess(state: GameState, tile: number, irrigatedBit: number): boolean {
  const m = state.map;
  if (m.rivers[tile] !== 0) return true;
  for (const dir of [1, 3, 5, 7]) {
    const j = neighbour(m, tile, dir);
    if (j < 0) continue;
    if (m.flags[j]! & FLAG_LAKE) return true;
    if (m.improvements[j]! & irrigatedBit) return true;
  }
  return false;
}

const ownersCache = new WeakMap<GameState['units'], Map<number, number[]>>();

/** Owners present on each occupied tile; cached per units object (which changes on every write). */
export function tileOwners(state: GameState): Map<number, number[]> {
  let m = ownersCache.get(state.units);
  if (!m) {
    m = new Map();
    for (const u of Object.values(state.units)) {
      const list = m.get(u.tile);
      if (!list) m.set(u.tile, [u.owner]);
      else if (!list.includes(u.owner)) list.push(u.owner);
    }
    ownersCache.set(state.units, m);
  }
  return m;
}

/** Call after changing a unit's tile or owner inside a transaction. */
export function invalidateTileOwners(state: GameState): void {
  ownersCache.delete(state.units);
}
