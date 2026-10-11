/**
 * City work areas and cultural borders (docs/rules/culture.md, docs/rules/cities.md).
 *
 * Shapes are discs on the rotated square grid (u, v): a tile is within ring r of a city
 * when du² + dv² ≤ r(r + 1). Ring 1 is the 3×3 block around the city, ring 2 the 21-tile
 * "fat cross" that is also the city's work area.
 */
import { registerCache } from './caches.ts';
import { tileX, tileY, wrapTile, type Grid } from './grid.ts';
import type { Rules } from './rules.ts';
import type { City, GameState } from './state.ts';

/** The work area radius of every city. */
export const CITY_RADIUS = 2;

/** Tiles within ring `r` of `center`, the centre first, then by distance. */
export function ringTiles(g: Grid, center: number, r: number): number[] {
  const x0 = tileX(g, center);
  const y0 = tileY(g, center);
  const limit = r * (r + 1);
  const out: { t: number; d: number }[] = [];
  for (let du = -r; du <= r; du++) {
    for (let dv = -r; dv <= r; dv++) {
      const d = du * du + dv * dv;
      if (d > limit) continue;
      const t = wrapTile(g, x0 + du - dv, y0 + du + dv);
      if (t >= 0) out.push({ t, d });
    }
  }
  out.sort((a, b) => a.d - b.d || a.t - b.t);
  return out.map((o) => o.t);
}

/** The 21-tile work area of a city at `center` (centre first). */
export function cityRadiusTiles(g: Grid, center: number): number[] {
  return ringTiles(g, center, CITY_RADIUS);
}

/** Border ring of a city: 1 when founded, one more for every culture threshold reached. */
export function borderRadius(rules: Rules, culture: number): number {
  let r = 1;
  for (const t of rules.set.general.borderThresholds) if (culture >= t) r++;
  return r;
}

const cityAtCache = new WeakMap<GameState['cities'], Map<number, City>>();
registerCache((s) => cityAtCache.delete(s.cities));

/** The city standing on `tile`, if any. */
export function cityAt(state: GameState, tile: number): City | undefined {
  let m = cityAtCache.get(state.cities);
  if (!m) {
    m = new Map();
    for (const c of Object.values(state.cities)) m.set(c.tile, c);
    cityAtCache.set(state.cities, m);
  }
  return m.get(tile);
}

export function playerCities(state: GameState, player: number): City[] {
  return Object.values(state.cities)
    .filter((c) => c.owner === player)
    .sort((a, b) => a.id - b.id);
}

/**
 * Recomputes who owns every tile. Each tile within a city's border ring goes to the
 * closest such city; ties go to the city with more culture, then the older city. A
 * city's own tile always belongs to it.
 */
export function computeTerritory(rules: Rules, state: GameState): number[] {
  const n = state.map.territory.length;
  const owner = new Array<number>(n).fill(-1);
  const best = new Array<number>(n).fill(Infinity);
  const bestCulture = new Array<number>(n).fill(-1);
  const bestId = new Array<number>(n).fill(Infinity);
  const cities = Object.values(state.cities).sort((a, b) => a.id - b.id);
  const g = state.map;
  for (const c of cities) {
    const r = borderRadius(rules, c.culture);
    const x0 = tileX(g, c.tile);
    const y0 = tileY(g, c.tile);
    const limit = r * (r + 1);
    for (let du = -r; du <= r; du++) {
      for (let dv = -r; dv <= r; dv++) {
        const d = du * du + dv * dv;
        if (d > limit) continue;
        const t = wrapTile(g, x0 + du - dv, y0 + du + dv);
        if (t < 0) continue;
        const better =
          d < best[t]! || (d === best[t]! && (c.culture > bestCulture[t]! || (c.culture === bestCulture[t]! && c.id < bestId[t]!)));
        if (!better) continue;
        best[t] = d;
        bestCulture[t] = c.culture;
        bestId[t] = c.id;
        owner[t] = c.owner;
      }
    }
  }
  for (const c of cities) owner[c.tile] = c.owner;
  return owner;
}
