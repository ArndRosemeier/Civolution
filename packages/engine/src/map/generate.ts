/**
 * Random map generator driven by Civ3's map parameters: world size, land form, water
 * coverage, climate, temperature and age (docs/rules/map.md). The numbers that shape
 * the result (percentages, thresholds) are ours, tuned so maps look and play like
 * Civ3's; the rule set supplies sizes, terrains and resources.
 *
 * Deterministic: integer maths and a generator seeded from the game seed.
 */
import {
  EDGE_NE,
  EDGE_NW,
  EDGE_SE,
  EDGE_SW,
  OPPOSITE_EDGE,
  distance,
  neighbours,
  neighbour,
  tileCount,
  tileX,
  tileY,
  tilesInRadius,
  wrapTile,
  type Grid,
} from '../grid.ts';
import { hash3, makeRng } from '../rng.ts';
import type { Rules } from '../rules.ts';
import { FLAG_BONUS_GRASSLAND, FLAG_HUT, FLAG_LAKE, type MapSettings, type MapState } from '../state.ts';
import { fractalNoise } from './noise.ts';

const MOUNTAIN_PERCENT = { 3: 9, 4: 6, 5: 4 } as const;
const HILL_PERCENT = { 3: 16, 4: 12, 5: 8 } as const;
const TEMPERATURE_SHIFT = { cool: -110, temperate: 0, warm: 110 } as const;
const CLIMATE_SHIFT = { arid: -110, normal: 0, wet: 110 } as const;
const LAND_TILES_PER_RIVER = { arid: 70, normal: 45, wet: 30 } as const;
const LAKE_MAX_TILES = 15;
const LAND_TILES_PER_HUT = 45;

export function generateMap(rules: Rules, settings: MapSettings, players: number, seed: number): MapState {
  const size = rules.set.worldSizes.find((w) => w.id === settings.worldSize);
  if (!size) throw new Error(`unknown world size "${settings.worldSize}"`);
  const g: Grid = { width: size.width, height: size.height, wrapX: true };
  const n = tileCount(g);
  const W = g.width;
  const H = g.height;
  const rng = makeRng(seed ^ 0x6d617073);
  const T = rules.t as Record<string, number>;
  const ter = (id: string) => {
    const v = T[id];
    if (v === undefined) throw new Error(`rule set lacks terrain "${id}"`);
    return v;
  };
  const DESERT = ter('desert');
  const PLAINS = ter('plains');
  const GRASS = ter('grassland');
  const TUNDRA = ter('tundra');
  const FLOOD = ter('floodPlain');
  const HILLS = ter('hills');
  const MOUNTAINS = ter('mountains');
  const FOREST = ter('forest');
  const JUNGLE = ter('jungle');
  const MARSH = ter('marsh');
  const VOLCANO = ter('volcano');
  const COAST = ter('coast');
  const SEA = ter('sea');
  const OCEAN = ter('ocean');

  const xs = Array.from({ length: n }, (_, i) => tileX(g, i));
  const ys = Array.from({ length: n }, (_, i) => tileY(g, i));
  const s = seed >>> 0;

  // --- Land and water -------------------------------------------------------------
  const landCount = Math.floor((n * (100 - settings.waterPercent)) / 100);
  const seeds = settings.landForm === 'pangaea' ? 1 : settings.landForm === 'continents' ? 2 + rng.int(2) : 9 + rng.int(8);
  const centres: { x: number; y: number; rsq: number }[] = [];
  for (let k = 0; k < seeds; k++) {
    const x = Math.floor((k * W) / seeds + rng.int(Math.max(1, Math.floor(W / seeds / 2))));
    const y = Math.floor(H / 5 + rng.int(Math.max(1, Math.floor((H * 3) / 5))));
    const share = settings.landForm === 'archipelago' ? 55 + rng.int(60) : 80 + rng.int(40);
    centres.push({ x, y, rsq: Math.max(4, Math.floor((landCount * share) / (100 * seeds))) });
  }
  const noiseCells = Math.max(3, Math.floor(W / (settings.landForm === 'archipelago' ? 8 : 12)));
  const [noiseWeight, biasWeight] = settings.landForm === 'archipelago' ? [14, 6] : [14, 9];
  const elevation = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const base = fractalNoise(s, xs[i]!, ys[i]!, W, noiseCells, 5);
    let bias = 0;
    for (const c of centres) {
      let dx = Math.abs(xs[i]! - c.x);
      if (dx > W / 2) dx = W - dx;
      const dy = Math.abs(ys[i]! - c.y);
      // Rotated-grid coordinates: one tile step is one unit in u and v.
      const du = (dx + dy) / 2;
      const dv = (dx - dy) / 2;
      const dsq = Math.floor(du * du + dv * dv);
      if (dsq < c.rsq) bias = Math.max(bias, Math.floor(((c.rsq - dsq) * 1024) / c.rsq));
    }
    let e = base * noiseWeight + bias * biasWeight;
    const edge = Math.min(ys[i]!, H - 1 - ys[i]!);
    if (edge < 4) e -= (4 - edge) * 3000;
    elevation[i] = e;
  }
  const byElevation = Array.from({ length: n }, (_, i) => i).sort((a, b) => elevation[b]! - elevation[a]! || a - b);
  const land = new Array<boolean>(n).fill(false);
  for (let k = 0; k < landCount; k++) land[byElevation[k]!] = true;

  const terrain = new Array<number>(n).fill(OCEAN);
  const underlying = new Array<number>(n).fill(-1);
  const flags = new Array<number>(n).fill(0);

  // Water depth by distance from land.
  const depth = new Array<number>(n).fill(-1);
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) if (land[i]) { depth[i] = 0; frontier.push(i); }
  for (let d = 1; frontier.length > 0 && d <= 4; d++) {
    const next: number[] = [];
    for (const i of frontier) for (const j of neighbours(g, i)) if (depth[j] === -1) { depth[j] = d; next.push(j); }
    frontier = next;
  }
  for (let i = 0; i < n; i++) {
    if (land[i]) continue;
    const d = depth[i]!;
    terrain[i] = d === 1 ? COAST : d >= 2 && d <= 3 ? SEA : OCEAN;
  }
  // Small enclosed water bodies are fresh-water lakes.
  const seen = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (land[i] || seen[i]) continue;
    const comp: number[] = [i];
    seen[i] = true;
    for (let k = 0; k < comp.length; k++) {
      for (const j of neighbours(g, comp[k]!)) if (!land[j] && !seen[j]) { seen[j] = true; comp.push(j); }
    }
    if (comp.length <= LAKE_MAX_TILES) for (const j of comp) { terrain[j] = COAST; flags[j] = flags[j]! | FLAG_LAKE; }
  }

  // --- Relief ---------------------------------------------------------------------
  const landTiles = byElevation.slice(0, landCount);
  const ridge = (i: number) => fractalNoise(s + 101, xs[i]!, ys[i]!, W, noiseCells * 2, 4);
  const byRelief = [...landTiles].sort((a, b) => ridge(b) * 3 + (elevation[b]! >> 6) - (ridge(a) * 3 + (elevation[a]! >> 6)) || a - b);
  const mountains = Math.floor((landCount * MOUNTAIN_PERCENT[settings.age]) / 100);
  const hills = Math.floor((landCount * HILL_PERCENT[settings.age]) / 100);
  const relief = new Array<number>(n).fill(0);
  byRelief.forEach((i, k) => {
    if (k < mountains) relief[i] = 2;
    else if (k < mountains + hills) relief[i] = 1;
  });
  // Coastal mountains read badly and block every landing; soften most of them to hills.
  for (const i of landTiles) if (relief[i] === 2 && depth[i] === 0 && neighbours(g, i).some((j) => !land[j]) && hash3(s, i, 7) % 3 !== 0) relief[i] = 1;

  // --- Climate --------------------------------------------------------------------
  const temperature = (i: number) => {
    const lat = Math.floor((Math.abs(2 * ys[i]! - H) * 1300) / H);
    return 1024 - lat + TEMPERATURE_SHIFT[settings.temperature] + ((fractalNoise(s + 202, xs[i]!, ys[i]!, W, noiseCells, 3) - 512) >> 2) - relief[i]! * 60;
  };
  const moisture = (i: number) =>
    fractalNoise(s + 303, xs[i]!, ys[i]!, W, noiseCells, 4) + CLIMATE_SHIFT[settings.climate] + (neighbours(g, i).some((j) => !land[j]) ? 50 : 0);

  for (const i of landTiles) {
    const t = temperature(i);
    const m = moisture(i);
    if (relief[i] === 2) { terrain[i] = MOUNTAINS; continue; }
    if (relief[i] === 1) { terrain[i] = HILLS; continue; }
    let base: number;
    if (t < 190) base = TUNDRA;
    else if (t < 320) base = m < 470 ? TUNDRA : PLAINS;
    else if (m < 340) base = t > 430 ? DESERT : PLAINS;
    else if (m < 470) base = PLAINS;
    else if (m < 600) base = hash3(s, i, 11) % 3 === 0 ? PLAINS : GRASS;
    else base = GRASS;
    terrain[i] = base;
    const forestNoise = fractalNoise(s + 404, xs[i]!, ys[i]!, W, noiseCells * 2, 3);
    if (t > 640 && m > 650 && base === GRASS) {
      terrain[i] = JUNGLE;
      underlying[i] = GRASS;
    } else if (t >= 320 && m > 690 && forestNoise < 330 && elevation[i]! < elevation[byElevation[landCount - 1]!]! + 2500) {
      terrain[i] = MARSH;
      underlying[i] = GRASS;
    } else if (forestNoise > 590 && m > 430 && base !== DESERT) {
      terrain[i] = FOREST;
      underlying[i] = base;
    }
  }
  // A few volcanoes among the mountains, never next to each other.
  const mountainTiles = landTiles.filter((i) => terrain[i] === MOUNTAINS);
  rng.shuffle(mountainTiles);
  const volcanoes = Math.max(1, Math.floor(mountainTiles.length / 30));
  let placedVolcanoes = 0;
  for (const i of mountainTiles) {
    if (placedVolcanoes >= volcanoes) break;
    if (neighbours(g, i).some((j) => terrain[j] === VOLCANO)) continue;
    terrain[i] = VOLCANO;
    placedVolcanoes++;
  }

  // --- Rivers along tile edges ----------------------------------------------------
  const rivers = new Array<number>(n).fill(0);
  // Corners are lattice points with x + y odd. The four tiles touching corner (cx, cy):
  const cornerTiles = (cx: number, cy: number) =>
    [wrapTile(g, cx - 1, cy), wrapTile(g, cx + 1, cy), wrapTile(g, cx, cy - 1), wrapTile(g, cx, cy + 1)];
  const isWater = (i: number) => i >= 0 && rules.terrains[terrain[i]!]!.water;
  const cornerHeight = (cx: number, cy: number) => {
    let h = 0;
    for (const t of cornerTiles(cx, cy)) {
      if (t < 0 || isWater(t)) h -= 100000;
      else h += (elevation[t]! >> 4) + relief[t]! * 4000;
    }
    return h;
  };
  const cornerKey = (cx: number, cy: number) => `${((cx % W) + W) % W},${cy}`;
  const riverCorners = new Set<string>();
  const setEdge = (cx: number, cy: number, dx: number, dy: number) => {
    const p = wrapTile(g, cx + dx, cy);
    const q = wrapTile(g, cx, cy + dy);
    const pEdge = dx > 0 ? (dy < 0 ? EDGE_NW : EDGE_SW) : dy < 0 ? EDGE_NE : EDGE_SE;
    if (p >= 0) rivers[p] = rivers[p]! | pEdge;
    if (q >= 0) rivers[q] = rivers[q]! | OPPOSITE_EDGE[pEdge]!;
  };
  const wantedRivers = Math.floor(landCount / LAND_TILES_PER_RIVER[settings.climate]);
  const sources = landTiles.filter((i) => relief[i]! >= 1 && terrain[i] !== VOLCANO);
  rng.shuffle(sources);
  let riversMade = 0;
  for (const src of sources) {
    if (riversMade >= wantedRivers) break;
    // Start at the tile's south corner.
    let cx = xs[src]!;
    let cy = ys[src]! + 1;
    if (cy >= H - 1) continue;
    if ([...riverCorners].some((k) => {
      const [kx, ky] = k.split(',').map(Number) as [number, number];
      return Math.abs(kx - cx) + Math.abs(ky - cy) < 8;
    })) continue;
    const path: [number, number, number, number][] = [];
    const visited = new Set<string>([cornerKey(cx, cy)]);
    let ok = false;
    for (let step = 0; step < 60; step++) {
      if (cornerTiles(cx, cy).some((t) => isWater(t))) { ok = path.length >= 3; break; }
      let best: [number, number] | null = null;
      let bestH = Infinity;
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (ny <= 0 || ny >= H - 1) continue;
        const key = cornerKey(nx, ny);
        if (visited.has(key)) continue;
        const h = cornerHeight(nx, ny) + (hash3(s, nx, ny) % 600);
        if (h < bestH) { bestH = h; best = [dx, dy]; }
      }
      if (!best) break;
      path.push([cx, cy, best[0], best[1]]);
      cx += best[0];
      cy += best[1];
      if (riverCorners.has(cornerKey(cx, cy))) { ok = path.length >= 2; break; }
      visited.add(cornerKey(cx, cy));
    }
    if (!ok) continue;
    for (const [px, py, dx, dy] of path) {
      setEdge(px, py, dx, dy);
      riverCorners.add(cornerKey(px, py));
    }
    riverCorners.add(cornerKey(cx, cy));
    riversMade++;
  }
  for (const i of landTiles) if (terrain[i] === DESERT && rivers[i] !== 0) terrain[i] = FLOOD;

  // --- Bonus grassland, resources, huts --------------------------------------------
  for (let i = 0; i < n; i++) if (terrain[i] === GRASS && hash3(s, i, 13) % 4 === 0) flags[i] = flags[i]! | FLAG_BONUS_GRASSLAND;

  const resource = new Array<number>(n).fill(-1);
  const resourceIdx = new Map(rules.resources.map((r, i) => [r.id, i]));
  const allowed = (t: number) => rules.terrains[t]!.possibleResources.map((id) => resourceIdx.get(id)!);
  const weight = (r: number) => {
    const res = rules.resources[r]!;
    return res.kind === 'strategic' ? res.appearanceRatio : 100;
  };
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  for (const i of order) {
    const options = allowed(terrain[i]!);
    if (options.length === 0 || resource[i] !== -1) continue;
    if (flags[i]! & FLAG_LAKE) continue;
    if (!rng.chance(isWater(i) ? 9 : 8)) continue;
    if (neighbours(g, i).some((j) => resource[j] !== -1)) continue;
    const total = options.reduce((a, r) => a + weight(r), 0);
    let roll = rng.int(total);
    let pick = options[0]!;
    for (const r of options) {
      roll -= weight(r);
      if (roll < 0) { pick = r; break; }
    }
    resource[i] = pick;
    if (rules.resources[pick]!.kind === 'luxury') {
      // Luxuries come in small clusters.
      for (const j of rng.shuffle(neighbours(g, i)).slice(0, 2)) {
        if (resource[j] === -1 && allowed(terrain[j]!).includes(pick) && rng.chance(60)) resource[j] = pick;
      }
    }
  }

  // --- Start positions ------------------------------------------------------------
  const cityRadius = (i: number) =>
    tilesInRadius(g, i, 2).filter((j) => {
      const dx = Math.abs(xs[j]! - xs[i]!);
      const dxw = Math.min(dx, W - dx);
      const dy = Math.abs(ys[j]! - ys[i]!);
      // The fat cross: the 5×5 rotated square without its four corners.
      return !(dxw === 0 && dy === 4) && !(dxw === 4 && dy === 0);
    });
  const siteScore = (i: number) => {
    const t = rules.terrains[terrain[i]!]!;
    if (t.water || !t.canFoundCity || terrain[i] === TUNDRA || terrain[i] === DESERT) return -1;
    let score = 0;
    let landNear = 0;
    for (const j of cityRadius(i)) {
      const tj = rules.terrains[terrain[j]!]!;
      if (!tj.water) landNear++;
      score += tj.food * 3 + tj.shields * 2 + tj.commerce;
      if (resource[j]! >= 0) score += 4;
      if (rivers[j] !== 0) score += 1;
    }
    if (landNear < 9) return -1;
    if (rivers[i] !== 0) score += 6;
    if (neighbours(g, i).some((j) => isWater(j))) score += 3;
    return score;
  };
  const scored = landTiles.map((i) => [i, siteScore(i)] as const).filter(([, sc]) => sc > 0);
  scored.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  let starts: number[] = [];
  for (let minDist = size.distanceBetweenCivs; minDist >= 2; minDist--) {
    starts = [];
    for (const [i] of scored) {
      if (starts.length >= players) break;
      if (starts.every((st) => distance(g, st, i) >= minDist)) starts.push(i);
    }
    if (starts.length >= players) break;
  }
  if (starts.length < players) throw new Error(`map has room for only ${starts.length} of ${players} players`);
  for (const st of starts) resource[st] = resource[st]! >= 0 && rules.resources[resource[st]!]!.kind === 'strategic' ? -1 : resource[st]!;

  const huts: number[] = [];
  const hutCount = Math.floor(landCount / LAND_TILES_PER_HUT);
  for (const i of rng.shuffle([...landTiles])) {
    if (huts.length >= hutCount) break;
    if (terrain[i] === MOUNTAINS || terrain[i] === VOLCANO) continue;
    if (starts.some((st) => distance(g, st, i) < 3)) continue;
    if (huts.some((h) => distance(g, h, i) < 4)) continue;
    huts.push(i);
    flags[i] = flags[i]! | FLAG_HUT;
  }

  // Check: every edge bit has its partner on the neighbouring tile.
  for (let i = 0; i < n; i++) {
    for (const [dir, bit] of [[1, EDGE_NE], [3, EDGE_SE], [5, EDGE_SW], [7, EDGE_NW]] as const) {
      if (!(rivers[i]! & bit)) continue;
      const j = neighbour(g, i, dir);
      if (j >= 0) rivers[j] = rivers[j]! | OPPOSITE_EDGE[bit]!;
    }
  }

  return {
    width: W,
    height: H,
    wrapX: true,
    terrain,
    underlying,
    rivers,
    resource,
    improvements: new Array<number>(n).fill(0),
    flags,
    territory: new Array<number>(n).fill(-1),
    starts,
    revision: 0,
  };
}
