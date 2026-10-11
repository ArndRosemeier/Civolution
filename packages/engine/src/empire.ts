/**
 * Empire-wide facts every city calculation needs: the capital and other seats of
 * government, corruption ranks, the trade network and the resources it connects, and
 * which buildings each city effectively has (its own plus wonder effects).
 *
 * Computed once per state and player and cached, so the many per-city queries a turn
 * makes stay cheap.
 */
import { registerArrayCache, registerCache } from './caches.ts';
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

// Keyed by the terrain array, which a transaction copies before changing it (tx.mapArray
// drops the entry for the copy), so land masses survive every write that leaves terrain be.
const landCache = new WeakMap<number[], Int32Array>();

/** Forgets the land masses computed for a terrain array about to change. */
export function invalidateLandMasses(terrain: number[]): void {
  landCache.delete(terrain);
}

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
  // Commercial civilizations run more cities before corruption bites (docs/rules/civilizations.md).
  const commercial = p.civ && rules.civ(p.civ).traits.includes('commercial') ? 125 : 100;
  const ocn = Math.max(1, Math.floor(((ws?.optimalCities ?? 16) * diff.optimalCitiesPercent * commercial) / 10000));

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

  const { component, resources } = cachedNetwork(rules, state, player, cities, effective);
  return { player, cities, capital, seats, ocn, rank, seatDistance, component, resources, activeWonders, buildingCount, effective, continent };
}

interface Network {
  comp: Int32Array;
  resources: Map<number, Set<string>>;
}

/**
 * Trade networks survive commands that leave roads, borders, terrain, resources, cities
 * and harbours alone (most unit moves): they are kept per improvements array (copied by
 * a transaction before any change) and a key of everything else they read.
 */
const networkCache = new WeakMap<number[], { territory: number[]; terrain: number[]; resource: number[]; rivers: number[]; byKey: Map<string, Network> }>();
registerArrayCache((s) => networkCache.delete(s.map.improvements));

function cachedNetwork(
  rules: Rules,
  state: GameState,
  player: number,
  cities: City[],
  effective: Map<number, Set<string>>,
): { component: Map<number, number>; resources: Map<number, Set<string>> } {
  const m = state.map;
  const p = state.players[player]!;
  let entry = networkCache.get(m.improvements);
  if (!entry || entry.territory !== m.territory || entry.terrain !== m.terrain || entry.resource !== m.resource || entry.rivers !== m.rivers) {
    entry = { territory: m.territory, terrain: m.terrain, resource: m.resource, rivers: m.rivers, byKey: new Map() };
    networkCache.set(m.improvements, entry);
  }
  const granted = grantedResources(rules, state, player);
  const key = [
    player,
    hasTechFlag(rules, p, 'enablesSeaTrade') ? 1 : 0,
    hasTechFlag(rules, p, 'enablesOceanTrade') ? 1 : 0,
    p.techs.length,
    granted.join(','),
    cities.map((c) => `${c.tile}${effective.get(c.id)!.has('harbor') ? 'h' : ''}`).join(','),
  ].join('|');
  let net = entry.byKey.get(key);
  if (!net) {
    // Bounded: a long game creates many keys per array, most never seen again.
    if (entry.byKey.size > 64) entry.byKey.clear();
    net = tradeNetwork(rules, state, player, cities, effective, granted);
    entry.byKey.set(key, net);
  }
  const component = new Map<number, number>();
  for (const c of cities) component.set(c.id, net.comp[c.tile]!);
  return { component, resources: net.resources };
}

/**
 * Resources granted on top of the player's own network: scenario grants, and resources
 * delivered by deals while a trade route joins the two capitals (docs/rules/trade.md).
 */
function grantedResources(rules: Rules, state: GameState, player: number): string[] {
  const granted = [...state.players[player]!.resources];
  for (const o of state.diplomacy.ongoing)
    if (o.to === player && o.item.kind === 'resource' && tradeRoute(rules, state, o.from, player)) granted.push(o.item.resource);
  return granted.sort();
}

const routeCache = new WeakMap<GameState, Map<string, boolean>>();
registerCache((s) => routeCache.delete(s));

/**
 * Whether a trade route joins the capitals of `a` and `b` (docs/rules/trade.md): roads,
 * railroads and rivers through either civilization's territory or unclaimed land, and
 * the sea between harbour cities of either side. Resources only change hands along one.
 */
export function tradeRoute(rules: Rules, state: GameState, a: number, b: number): boolean {
  let perState = routeCache.get(state);
  if (!perState) {
    perState = new Map();
    routeCache.set(state, perState);
  }
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  let ok = perState.get(key);
  if (ok === undefined) {
    ok = computeRoute(rules, state, a, b);
    perState.set(key, ok);
  }
  return ok;
}

function computeRoute(rules: Rules, state: GameState, a: number, b: number): boolean {
  const m = state.map;
  const capitalOf = (p: number) => playerCities(state, p).find((c) => 'palace' in c.buildings) ?? null;
  const from = capitalOf(a);
  const to = capitalOf(b);
  if (!from || !to) return false;
  const cityTile = new Map<number, City>();
  for (const c of [...playerCities(state, a), ...playerCities(state, b)]) cityTile.set(c.tile, c);
  const pa = state.players[a]!;
  const pb = state.players[b]!;
  const seaOk = hasTechFlag(rules, pa, 'enablesSeaTrade') || hasTechFlag(rules, pb, 'enablesSeaTrade');
  const oceanOk = hasTechFlag(rules, pa, 'enablesOceanTrade') || hasTechFlag(rules, pb, 'enablesOceanTrade');
  const sailable = (t: number) => {
    const id = rules.terrains[m.terrain[t]!]!.id;
    return id === 'coast' || (id === 'sea' && (seaOk || oceanOk)) || (id === 'ocean' && oceanOk);
  };
  // Harbours by their own buildings (wonders acting as harbours are left out here: the
  // empire facts would need this route for their own resources).
  const harbour = (c: City) => 'harbor' in c.buildings;
  const land = (t: number) => {
    const o = m.territory[t]!;
    return cityTile.has(t) || ((o === a || o === b || o === -1) && ((m.improvements[t]! & (IMP_ROAD | IMP_RAIL)) !== 0 || m.rivers[t] !== 0));
  };
  const seen = new Uint8Array(m.terrain.length);
  const waterSeen = new Uint8Array(m.terrain.length);
  const stack = [from.tile];
  seen[from.tile] = 1;
  while (stack.length > 0) {
    const t = stack.pop()!;
    if (t === to.tile) return true;
    const here = cityTile.get(t);
    if (here && harbour(here)) {
      const water: number[] = [];
      for (const w of neighbours(m, t))
        if (!waterSeen[w] && rules.terrains[m.terrain[w]!]!.water && sailable(w)) {
          waterSeen[w] = 1;
          water.push(w);
        }
      while (water.length > 0) {
        const w = water.pop()!;
        for (const j of neighbours(m, w)) {
          const other = cityTile.get(j);
          if (other && !seen[j] && harbour(other)) {
            seen[j] = 1;
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
      if (j < 0 || seen[j] || !land(j)) continue;
      const roadLink = (m.improvements[t]! | (cityTile.has(t) ? IMP_ROAD : 0)) & (m.improvements[j]! | (cityTile.has(j) ? IMP_ROAD : 0)) & (IMP_ROAD | IMP_RAIL);
      const riverLink = m.rivers[t] !== 0 && m.rivers[j] !== 0;
      if (!roadLink && !riverLink) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return false;
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
  granted: string[],
): Network {
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
  // Resources: on a network tile, or in a city's work area, inside the player's borders.
  const resources = new Map<number, Set<string>>();
  // Scenario grants and resources delivered by deals reach every city.
  for (const c of cities) if (!resources.has(comp[c.tile]!)) resources.set(comp[c.tile]!, new Set(granted));
  const areaOf = new Map<number, number>();
  for (const c of cities) for (const t of cityRadiusTiles(m, c.tile)) if (!areaOf.has(t)) areaOf.set(t, comp[c.tile]!);
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
  return { comp, resources };
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
