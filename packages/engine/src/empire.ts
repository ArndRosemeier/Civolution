/**
 * Empire-wide facts every city calculation needs: the capital and other seats of
 * government, corruption ranks, the trade network and the resources it connects, and
 * which buildings each city effectively has (its own plus wonder effects).
 *
 * Computed once per state and player and cached, so the many per-city queries a turn
 * makes stay cheap.
 */
import { registerCache } from './caches.ts';
import { neighbour, neighbours, distance } from './grid.ts';
import { hasTechFlag, knowsTech } from './queries.ts';
import type { Rules } from './rules.ts';
import { IMP_RAIL, IMP_ROAD, type City, type GameState } from './state.ts';
import { cityRadiusTiles, playerCities } from './territory.ts';

export interface EmpireInfo {
  player: number;
  cities: City[];
  capital: City | null;
  /** Cities with a Forbidden Palace (or Secret Police HQ under its government): secondary centres. */
  seats: City[];
  /** Optimal city number (docs/rules/corruption.md). */
  ocn: number;
  /** Corruption rank: 0 for the capital, then by distance to the nearest seat. */
  rank: Map<number, number>;
  /** Distance to the nearest seat of government, in tiles. */
  seatDistance: Map<number, number>;
  /** Trade-network component of each city. */
  component: Map<number, number>;
  /** Resources available in each component. */
  resources: Map<number, Set<string>>;
  /** Great and small wonders of this player whose effects are active. */
  activeWonders: Set<string>;
  /** Buildings of each kind across the empire. */
  buildingCount: Map<string, number>;
  /** Buildings each city effectively has (own ones plus wonder effects). */
  effective: Map<number, Set<string>>;
  /** Land mass id of each city's tile. */
  continent: Map<number, number>;
}

const cache = new WeakMap<GameState, Map<number, EmpireInfo>>();
registerCache((s) => cache.delete(s));

export function empireInfo(rules: Rules, state: GameState, player: number): EmpireInfo {
  let perState = cache.get(state);
  if (!perState) {
    perState = new Map();
    cache.set(state, perState);
  }
  let info = perState.get(player);
  if (!info) {
    info = computeEmpire(rules, state, player);
    perState.set(player, info);
  }
  return info;
}

const landCache = new WeakMap<number[], Int32Array>();
registerCache((s) => landCache.delete(s.map.terrain));

/** Connected land masses (ids from 0); water tiles get -1. */
export function landMasses(rules: Rules, state: GameState): Int32Array {
  const terrain = state.map.terrain;
  let ids = landCache.get(terrain);
  if (ids) return ids;
  ids = new Int32Array(terrain.length).fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let i = 0; i < terrain.length; i++) {
    if (ids[i] !== -1 || rules.terrains[terrain[i]!]!.water) continue;
    ids[i] = next;
    stack.push(i);
    while (stack.length > 0) {
      const t = stack.pop()!;
      for (const j of neighbours(state.map, t)) {
        if (ids[j] !== -1 || rules.terrains[terrain[j]!]!.water) continue;
        ids[j] = next;
        stack.push(j);
      }
    }
    next++;
  }
  landCache.set(terrain, ids);
  return ids;
}

/** A wonder stops working once its owner learns the tech that makes it obsolete. */
function wonderActive(rules: Rules, state: GameState, player: number, id: string): boolean {
  const b = rules.building(id);
  return !b.obsoletedBy || !knowsTech(state.players[player]!, b.obsoletedBy);
}

function computeEmpire(rules: Rules, state: GameState, player: number): EmpireInfo {
  const p = state.players[player]!;
  const cities = playerCities(state, player);
  const gov = rules.government(p.government);
  const capital = cities.find((c) => 'palace' in c.buildings) ?? null;
  const seats = cities.filter(
    (c) => c !== capital && ('forbiddenPalace' in c.buildings || ('secretPoliceHq' in c.buildings && gov.id === 'communism')),
  );
  const centres = capital ? [capital, ...seats] : seats;

  const ws = rules.set.worldSizes.find((w) => w.id === state.settings.worldSize);
  const diff = rules.difficulty(state.difficulty);
  const ocn = Math.max(1, Math.floor(((ws?.optimalCities ?? 16) * diff.optimalCitiesPercent) / 100));

  const seatDistance = new Map<number, number>();
  for (const c of cities) {
    let d = Infinity;
    for (const s of centres) d = Math.min(d, distance(state.map, s.tile, c.tile));
    seatDistance.set(c.id, d);
  }
  const ordered = [...cities].sort((a, b) => seatDistance.get(a.id)! - seatDistance.get(b.id)! || a.id - b.id);
  const rank = new Map<number, number>();
  ordered.forEach((c, i) => rank.set(c.id, i));

  const masses = landMasses(rules, state);
  const continent = new Map<number, number>();
  for (const c of cities) continent.set(c.id, masses[c.tile]!);

  const buildingCount = new Map<string, number>();
  const activeWonders = new Set<string>();
  for (const c of cities) {
    for (const b of Object.keys(c.buildings)) {
      buildingCount.set(b, (buildingCount.get(b) ?? 0) + 1);
      const kind = rules.building(b).kind;
      if ((kind === 'wonder' || kind === 'smallWonder') && wonderActive(rules, state, player, b)) activeWonders.add(b);
    }
  }

  const effective = new Map<number, Set<string>>();
  for (const c of cities) effective.set(c.id, new Set(Object.keys(c.buildings)));
  for (const w of activeWonders) {
    const rule = rules.building(w);
    const holder = cities.find((c) => w in c.buildings)!;
    for (const c of cities) {
      if (rule.actsAsEverywhere) effective.get(c.id)!.add(rule.actsAsEverywhere);
      if (rule.actsAsOnContinent && continent.get(c.id) === continent.get(holder.id)) effective.get(c.id)!.add(rule.actsAsOnContinent);
    }
  }

  const { component, resources } = tradeNetwork(rules, state, player, cities, effective);
  return { player, cities, capital, seats, ocn, rank, seatDistance, component, resources, activeWonders, buildingCount, effective, continent };
}

/**
 * The trade network (docs/rules/trade.md): cities are connected by roads, railroads and
 * rivers through tiles that are not foreign territory, and harbour cities by water they
 * can sail (coast always, sea with a sea-trade tech, ocean with an ocean-trade tech).
 * A strategic or luxury resource in the player's territory joins the network of the road
 * or city work area it lies in.
 */
function tradeNetwork(
  rules: Rules,
  state: GameState,
  player: number,
  cities: City[],
  effective: Map<number, Set<string>>,
): { component: Map<number, number>; resources: Map<number, Set<string>> } {
  const m = state.map;
  const n = m.terrain.length;
  const p = state.players[player]!;
  const comp = new Int32Array(n).fill(-1);
  const cityTile = new Map<number, City>();
  for (const c of cities) cityTile.set(c.tile, c);
  const isNode = (t: number) =>
    cityTile.has(t) ||
    ((m.territory[t] === player || m.territory[t] === -1) && ((m.improvements[t]! & (IMP_ROAD | IMP_RAIL)) !== 0 || m.rivers[t] !== 0));
  const seaOk = hasTechFlag(rules, p, 'enablesSeaTrade');
  const oceanOk = hasTechFlag(rules, p, 'enablesOceanTrade');
  const sailable = (t: number) => {
    const id = rules.terrains[m.terrain[t]!]!.id;
    return id === 'coast' || (id === 'sea' && (seaOk || oceanOk)) || (id === 'ocean' && oceanOk);
  };
  const harbour = (c: City) => effective.get(c.id)!.has('harbor');

  let next = 0;
  const component = new Map<number, number>();
  const stack: number[] = [];
  const waterSeen = new Uint8Array(n);
  for (const start of cities) {
    if (comp[start.tile] !== -1) continue;
    const id = next++;
    comp[start.tile] = id;
    stack.push(start.tile);
    while (stack.length > 0) {
      const t = stack.pop()!;
      const here = cityTile.get(t);
      // Harbour: flood the water it can sail and pick up the other harbour cities on it.
      if (here && harbour(here)) {
        const water: number[] = [];
        for (const w of neighbours(m, t)) if (rules.terrains[m.terrain[w]!]!.water && sailable(w) && !waterSeen[w]) {
          waterSeen[w] = 1;
          water.push(w);
        }
        while (water.length > 0) {
          const w = water.pop()!;
          for (const j of neighbours(m, w)) {
            const other = cityTile.get(j);
            if (other && harbour(other) && comp[j] === -1) {
              comp[j] = id;
              stack.push(j);
            }
            if (!waterSeen[j] && rules.terrains[m.terrain[j]!]!.water && sailable(j)) {
              waterSeen[j] = 1;
              water.push(j);
            }
          }
        }
      }
      for (let dir = 0; dir < 8; dir++) {
        const j = neighbour(m, t, dir);
        if (j < 0 || comp[j] !== -1 || !isNode(j)) continue;
        const roadLink = (m.improvements[t]! | (cityTile.has(t) ? IMP_ROAD : 0)) & (m.improvements[j]! | (cityTile.has(j) ? IMP_ROAD : 0)) & (IMP_ROAD | IMP_RAIL);
        const riverLink = m.rivers[t] !== 0 && m.rivers[j] !== 0;
        if (!roadLink && !riverLink) continue;
        comp[j] = id;
        stack.push(j);
      }
    }
  }
  for (const c of cities) component.set(c.id, comp[c.tile]!);

  // Resources: on a network tile, or in a city's work area, inside the player's borders.
  const resources = new Map<number, Set<string>>();
  for (const c of cities) if (!resources.has(component.get(c.id)!)) resources.set(component.get(c.id)!, new Set(p.resources));
  const areaOf = new Map<number, number>();
  for (const c of cities) for (const t of cityRadiusTiles(m, c.tile)) if (!areaOf.has(t)) areaOf.set(t, component.get(c.id)!);
  for (let t = 0; t < n; t++) {
    const res = m.resource[t]!;
    if (res < 0 || m.territory[t] !== player) continue;
    const rule = rules.resources[res]!;
    if (rule.kind === 'bonus') continue;
    if (rule.revealedBy && !knowsTech(p, rule.revealedBy)) continue;
    const c = comp[t]! >= 0 ? comp[t]! : areaOf.get(t);
    if (c === undefined) continue;
    resources.get(c)?.add(rule.id);
  }
  return { component, resources };
}

/** Resources a city can use. */
export function cityResources(info: EmpireInfo, city: City): Set<string> {
  return info.resources.get(info.component.get(city.id) ?? -1) ?? new Set();
}

/** Resources the player can use anywhere (the capital's network, plus scenario grants). */
export function availableResources(rules: Rules, state: GameState, player: number): Set<string> {
  const info = empireInfo(rules, state, player);
  const out = new Set(state.players[player]!.resources);
  const home = info.capital ?? info.cities[0];
  if (home) for (const r of cityResources(info, home)) out.add(r);
  return out;
}

/** Whether a city is connected to the capital by the trade network. */
export function connectedToCapital(info: EmpireInfo, city: City): boolean {
  return info.capital !== null && info.component.get(city.id) === info.component.get(info.capital.id);
}
