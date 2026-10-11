/**
 * City work areas and cultural borders (docs/rules/culture.md, docs/rules/cities.md).
 *
 * Shapes are discs on the rotated square grid (u, v): a tile is within ring r of a city
 * when du² + dv² ≤ r(r + 1). Ring 1 is the 3×3 block around the city, ring 2 the 21-tile
 * "fat cross" that is also the city's work area.
 */
import { registerCache } from './caches.ts';
import { neighbour, tileX, tileY, wrapTile, type Grid } from './grid.ts';
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
 * Recomputes who owns every tile (docs/rules/culture.md). Each tile within a city's border
 * ring goes to the city with the most influence on it: city culture ÷ distance in tiles
 * (at least 1). Ties go to the older city. A city's own tile always belongs to it. A lone
 * unclaimed tile squeezed between one player's land on opposite sides becomes theirs too.
 */
export function computeTerritory(rules: Rules, state: GameState): number[] {
  const n = state.map.territory.length;
  const owner = new Array<number>(n).fill(-1);
  const best = new Array<City | null>(n).fill(null);
  const bestDist = new Array<number>(n).fill(1);
  const cities = Object.values(state.cities).sort((a, b) => a.founded - b.founded || a.id - b.id);
  const g = state.map;
  for (const c of cities) {
    const r = borderRadius(rules, c.culture);
    const x0 = tileX(g, c.tile);
    const y0 = tileY(g, c.tile);
    const limit = r * (r + 1);
    for (let du = -r; du <= r; du++) {
      for (let dv = -r; dv <= r; dv++) {
        if (du * du + dv * dv > limit) continue;
        const t = wrapTile(g, x0 + du - dv, y0 + du + dv);
        if (t < 0) continue;
        const dist = Math.max(1, Math.abs(du), Math.abs(dv));
        const rival = best[t];
        // culture ÷ dist > rival culture ÷ rival dist, cross-multiplied; cities come oldest
        // first, so a tie keeps the older city.
        if (rival && c.culture * bestDist[t]! <= rival.culture * dist) continue;
        best[t] = c;
        bestDist[t] = dist;
        owner[t] = c.owner;
      }
    }
  }
  for (const c of cities) owner[c.tile] = c.owner;
  return fillGaps(g, owner);
}

/**
 * A one-tile gap between a player's borders is theirs (owner's ruling 2026-10-11): an
 * unclaimed tile whose neighbours on two opposite sides belong to the same player joins that
 * player. Gaps are judged on the borders before filling, so they never spread, and a gap
 * between two different players' land stays unclaimed.
 */
function fillGaps(g: Grid, owner: number[]): number[] {
  const out = owner.slice();
  for (let t = 0; t < owner.length; t++) {
    if (owner[t] !== -1) continue;
    let claim = -1;
    for (let d = 0; d < 4; d++) {
      const a = neighbour(g, t, d);
      const b = neighbour(g, t, d + 4);
      if (a < 0 || b < 0) continue;
      const p = owner[a]!;
      if (p < 0 || owner[b] !== p) continue;
      if (claim >= 0 && claim !== p) {
        claim = -2;
        break;
      }
      claim = p;
    }
    if (claim >= 0) out[t] = claim;
  }
  return out;
}
