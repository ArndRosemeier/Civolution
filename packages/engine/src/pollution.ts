/**
 * Pollution, nuclear meltdowns and global warming (docs/rules/pollution.md).
 */
import { tileCount } from './grid.ts';
import type { Rules } from './rules.ts';
import { IMP_CRATER, IMP_IRRIGATION, IMP_POLLUTION, type City, type GameState } from './state.ts';
import { cityRadiusTiles } from './territory.ts';
import type { Tx } from './tx.ts';
import type { Explained, Part } from './yields.ts';

/** Shields per point of building pollution (a Factory city making 40 shields: 4 points). */
export const SHIELDS_PER_POINT = 20;
/** Citizens above this size pollute once the owner knows Industrialization… */
export const POPULATION_FREE_SIZE = 12;
/** …one point per this many citizens beyond it. */
export const CITIZENS_PER_POINT = 2;
/** Chance in percent per pollution point that a tile is polluted this turn. */
export const PERCENT_PER_POINT = 4;
/** Chance in percent that a Nuclear Plant melts down in a turn of disorder. */
export const MELTDOWN_PERCENT = 10;
/** Warming strikes when pollution points pass the map's tiles divided by this, times (strikes + 1). */
export const TILES_PER_WARMING = 50;
/** Tiles warming changes per strike: the map's land tiles divided by this. */
export const TILES_PER_CHANGE = 200;

/** What each terrain becomes when the climate warms. */
const WARMED: Record<string, string> = {
  grassland: 'plains',
  plains: 'desert',
  tundra: 'plains',
  forest: 'plains',
  jungle: 'marsh',
  floodPlain: 'desert',
  snow: 'tundra',
};

/** Pollution points of a city: its industry by its buildings, and big cities after Industrialization. */
export function pollutionPoints(rules: Rules, state: GameState, city: City, have: Set<string>, shields: number): Explained {
  const parts: Part[] = [];
  let buildings = 0;
  for (const b of Object.keys(city.buildings)) buildings += rules.building(b).pollution;
  let industry = buildings > 0 ? Math.floor((buildings * shields) / (SHIELDS_PER_POINT * 2)) : 0;
  if (industry > 0) {
    parts.push({ label: `Industry (${shields} shields, buildings ${buildings})`, amount: industry });
    if ([...have].some((b) => rules.building(b).effects.includes('reducesBuildingPollution'))) {
      const cut = industry - Math.floor(industry / 3);
      parts.push({ label: 'Recycling Center', amount: -cut });
      industry -= cut;
    }
  }
  const p = state.players[city.owner]!;
  if (p.techs.includes('industrialization') && city.size > POPULATION_FREE_SIZE) {
    const people = Math.ceil((city.size - POPULATION_FREE_SIZE) / CITIZENS_PER_POINT);
    parts.push({ label: `${city.size} citizens`, amount: people });
    if ([...have].some((b) => rules.building(b).effects.includes('removesPopulationPollution'))) parts.push({ label: 'Mass Transit System', amount: -people });
  }
  const value = Math.max(0, parts.reduce((a, x) => a + x.amount, 0));
  return { value, parts };
}

/** Pollution may land on a tile of the city's area (end of turn). */
export function rollPollution(rules: Rules, tx: Tx, city: City, points: number): void {
  if (points <= 0) return;
  if (tx.random(100) >= Math.min(90, points * PERCENT_PER_POINT)) return;
  const imp = tx.state.map.improvements;
  const spots = cityRadiusTiles(tx.state.map, city.tile).filter((t) => !rules.terrains[tx.state.map.terrain[t]!]!.water && !(imp[t]! & (IMP_POLLUTION | IMP_CRATER)));
  if (spots.length === 0) return;
  const tile = spots[tx.random(spots.length)]!;
  const arr = tx.mapArray('improvements');
  arr[tile] = arr[tile]! | IMP_POLLUTION;
  tx.state.map.revision++;
  tx.emit({ type: 'pollutionAppeared', tile, player: city.owner, city: city.id });
}

/** A Nuclear Plant in a city in disorder may melt down: half the people die, the area is polluted. */
export function maybeMeltdown(rules: Rules, tx: Tx, cityId: number, have: Set<string>): void {
  const c = tx.state.cities[cityId]!;
  if (![...have].some((b) => rules.building(b).effects.includes('canMeltDown') && b in c.buildings)) return;
  if (tx.random(100) >= MELTDOWN_PERCENT) return;
  const w = tx.city(cityId);
  w.size = Math.max(1, Math.ceil(c.size / 2));
  for (const b of Object.keys(w.buildings)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by building id
    if (rules.building(b).effects.includes('canMeltDown')) delete w.buildings[b];
  }
  const arr = tx.mapArray('improvements');
  for (const t of cityRadiusTiles(tx.state.map, c.tile)) {
    if (!rules.terrains[tx.state.map.terrain[t]!]!.water && tx.random(2) === 0) arr[t] = arr[t]! | IMP_POLLUTION;
  }
  tx.state.map.revision++;
  tx.emit({ type: 'meltdown', city: cityId, player: c.owner, tile: c.tile });
}

/** The warming threshold for the next strike. */
export function warmingThreshold(state: GameState): number {
  return Math.max(10, Math.floor(tileCount(state.map) / TILES_PER_WARMING)) * (state.climate.strikes + 1);
}

/**
 * Polluted tiles and craters warm the climate a little every turn; past the threshold the
 * climate strikes: land tiles across the world turn drier or wetter (docs/rules/pollution.md).
 */
export function runGlobalWarming(rules: Rules, tx: Tx): void {
  const imp = tx.state.map.improvements;
  let dirty = 0;
  for (let t = 0; t < imp.length; t++) if (imp[t]! & (IMP_POLLUTION | IMP_CRATER)) dirty++;
  if (dirty === 0) return;
  const warming = tx.state.climate.warming + dirty;
  const threshold = warmingThreshold(tx.state);
  if (warming < threshold) {
    tx.state.climate = { ...tx.state.climate, warming };
    return;
  }
  tx.state.climate = { warming: warming - threshold, strikes: tx.state.climate.strikes + 1 };
  const terrain = tx.state.map.terrain;
  const candidates: number[] = [];
  for (let t = 0; t < terrain.length; t++) {
    const id = rules.terrains[terrain[t]!]!.id;
    if (WARMED[id] && rules.t[WARMED[id]] !== undefined) candidates.push(t);
  }
  const want = Math.max(1, Math.floor(candidates.length / TILES_PER_CHANGE));
  const changed: number[] = [];
  const ter = tx.mapArray('terrain');
  const under = tx.mapArray('underlying');
  const imps = tx.mapArray('improvements');
  for (let i = 0; i < want && candidates.length > 0; i++) {
    const k = tx.random(candidates.length);
    const t = candidates[k]!;
    candidates.splice(k, 1);
    const to = WARMED[rules.terrains[ter[t]!]!.id]!;
    ter[t] = rules.t[to]!;
    under[t] = -1;
    // Irrigation dries up with the land.
    imps[t] = imps[t]! & ~IMP_IRRIGATION;
    changed.push(t);
  }
  tx.state.map.revision++;
  tx.emit({ type: 'globalWarming', tiles: changed });
}
