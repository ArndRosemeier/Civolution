/**
 * The 3D landscape's height field, derived from the engine's tile data. Rendering
 * only: the engine never sees heights. Tiles are diamonds centred on lattice points
 * with x + y even; in rotated coordinates u = (x + y) / 2, v = (y - x) / 2 they form
 * a square grid, so heights blend bilinearly between tile centres there.
 *
 * World space: X = map x, Z = map y, Y up. One tile spans two units along X and Z.
 */
import type { MapState, Rules } from '@civolution/engine';
import { EDGE_NE, EDGE_SE } from '@civolution/engine';

/** Value noise in 0..1, deterministic, cheap. */
function hash(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(x, y) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / norm;
}

const BASE: Record<string, number> = {
  coast: -0.12,
  sea: -0.45,
  ocean: -0.95,
  marsh: 0.035,
  floodPlain: 0.05,
  hills: 0.16,
  mountains: 0.3,
  volcano: 0.3,
};
const PEAK: Record<string, number> = { hills: 0.32, mountains: 1.05, volcano: 1.25 };
const LAKE_BASE = -0.12;
const LAND_BASE = 0.1;

/** Samples per lattice unit for the river carving grid. */
const RIVER_RES = 4;
const RIVER_RADIUS = 0.42;

export class HeightField {
  readonly width: number;
  readonly height: number;
  private readonly base: Float32Array;
  private readonly peak: Float32Array;
  private readonly land: Uint8Array;
  private readonly riverDist: Float32Array;
  private readonly rw: number;
  private readonly rh: number;
  /** River edges as segments between corner points, [x0, y0, x1, y1] in map coordinates. */
  readonly riverSegments: number[][] = [];
  /** Rivers chained into smoothed polylines (unwrapped x), for drawing. */
  readonly riverLines: [number, number][][] = [];

  constructor(map: MapState, rules: Rules) {
    this.width = map.width;
    this.height = map.height;
    const n = map.terrain.length;
    this.base = new Float32Array(n);
    this.peak = new Float32Array(n);
    this.land = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const t = rules.terrains[map.terrain[i]!]!;
      const lake = (map.flags[i]! & 2) !== 0;
      this.base[i] = lake ? LAKE_BASE : (BASE[t.id] ?? LAND_BASE);
      this.peak[i] = PEAK[t.id] ?? 0;
      this.land[i] = t.water ? 0 : 1;
    }
    this.rw = this.width * RIVER_RES + 1;
    this.rh = this.height * RIVER_RES + 1;
    this.riverDist = new Float32Array(this.rw * this.rh).fill(9);
    this.buildRivers(map);
  }

  /** Tile index at lattice point (x, y) with x + y even; -1 off the map vertically. */
  tileAt(x: number, y: number): number {
    if (y < 0 || y >= this.height) return -1;
    const w = this.width;
    const xx = ((x % w) + w) % w;
    return y * (w >> 1) + (xx >> 1);
  }

  private tileBase(u: number, v: number): number {
    const t = this.tileAt(u - v, u + v);
    return t < 0 ? BASE['ocean']! : this.base[t]!;
  }

  /** Terrain height at world (px, pz), without rivers. */
  private rawHeight(px: number, pz: number): number {
    const u = (px + pz) * 0.5;
    const v = (pz - px) * 0.5;
    const u0 = Math.floor(u);
    const v0 = Math.floor(v);
    let fu = u - u0;
    let fv = v - v0;
    fu = fu * fu * (3 - 2 * fu);
    fv = fv * fv * (3 - 2 * fv);
    const a = this.tileBase(u0, v0);
    const b = this.tileBase(u0 + 1, v0);
    const c = this.tileBase(u0, v0 + 1);
    const d = this.tileBase(u0 + 1, v0 + 1);
    let h = a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
    // Peaks for hills and mountains, from the nearest few tile centres.
    for (let du = 0; du <= 1; du++) {
      for (let dv = 0; dv <= 1; dv++) {
        const t = this.tileAt(u0 + du - (v0 + dv), u0 + du + v0 + dv);
        if (t < 0) continue;
        const p = this.peak[t]!;
        if (p === 0) continue;
        const dx = u - (u0 + du);
        const dy = v - (v0 + dv);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 0.95) continue;
        const ridge = 0.65 + 0.7 * fbm(px * 1.6 + 7, pz * 1.6 - 3, 3);
        const k = 1 - dist / 0.95;
        h += p * k * k * ridge;
      }
    }
    // Ragged coastlines: push the land/water boundary around with noise near sea level.
    const nearShore = 1 - Math.min(1, Math.abs(h) / 0.16);
    if (nearShore > 0) h += (fbm(px * 0.7 + 31, pz * 0.7 - 17, 3) - 0.5) * 0.3 * nearShore;
    // Gentle relief on land.
    if (h > 0) h += (fbm(px * 0.9, pz * 0.9, 3) - 0.5) * 0.07 * Math.min(1, h * 6);
    return h;
  }

  /** Terrain height at world (px, pz) with river beds carved in. */
  heightAt(px: number, pz: number): number {
    const h = this.rawHeight(px, pz);
    const d = this.riverDistance(px, pz);
    if (d >= RIVER_RADIUS) return h;
    const k = 1 - d / RIVER_RADIUS;
    return h - 0.09 * k * k * (3 - 2 * k);
  }

  /** Distance from (px, pz) to the nearest river edge, capped. */
  riverDistance(px: number, pz: number): number {
    const w = this.width;
    const x = ((px % w) + w) % w;
    const gx = x * RIVER_RES;
    const gz = pz * RIVER_RES;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    if (iz < 0 || iz >= this.rh - 1) return 9;
    const fx = gx - ix;
    const fz = gz - iz;
    const at = (i: number, j: number) => this.riverDist[j * this.rw + Math.min(this.rw - 1, i)]!;
    const a = at(ix, iz);
    const b = at(ix + 1, iz);
    const c = at(ix, iz + 1);
    const d = at(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  private chainRivers(): void {
    const W = this.width;
    const key = (x: number, y: number) => `${((x % W) + W) % W},${y}`;
    const adj = new Map<string, { x: number; y: number; to: string[] }>();
    const node = (x: number, y: number) => {
      const k = key(x, y);
      let n = adj.get(k);
      if (!n) {
        n = { x: ((x % W) + W) % W, y, to: [] };
        adj.set(k, n);
      }
      return k;
    };
    for (const [x0, y0, x1, y1] of this.riverSegments) {
      const a = node(x0!, y0!);
      const b = node(x1!, y1!);
      adj.get(a)!.to.push(b);
      adj.get(b)!.to.push(a);
    }
    const used = new Set<string>();
    const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const walk = (start: string, next: string) => {
      const line: [number, number][] = [];
      let prev = start;
      let cur = next;
      const s0 = adj.get(start)!;
      line.push([s0.x, s0.y]);
      used.add(edgeKey(start, next));
      for (;;) {
        const n = adj.get(cur)!;
        let x = n.x;
        const last = line[line.length - 1]![0];
        x += Math.round((last - x) / W) * W;
        line.push([x, n.y]);
        if (n.to.length !== 2) break;
        const nxt = n.to[0] === prev ? n.to[1]! : n.to[0]!;
        if (used.has(edgeKey(cur, nxt))) break;
        used.add(edgeKey(cur, nxt));
        prev = cur;
        cur = nxt;
      }
      this.riverLines.push(chaikin(chaikin(line)));
    };
    for (const [k, n] of adj) if (n.to.length !== 2) for (const t of n.to) if (!used.has(edgeKey(k, t))) walk(k, t);
    for (const [k, n] of adj) for (const t of n.to) if (!used.has(edgeKey(k, t))) walk(k, t);
  }

  isLand(tile: number): boolean {
    return this.land[tile] === 1;
  }

  private buildRivers(map: MapState): void {
    const half = this.width >> 1;
    for (let i = 0; i < map.rivers.length; i++) {
      const bits = map.rivers[i]!;
      if (!bits) continue;
      const y = Math.floor(i / half);
      const x = 2 * (i % half) + (y & 1);
      // Each edge is stored on both tiles; draw NE and SE from this side, and SW/NW only
      // where the neighbour is off the map.
      if (bits & EDGE_NE) this.riverSegments.push([x, y - 1, x + 1, y]);
      if (bits & EDGE_SE) this.riverSegments.push([x + 1, y, x, y + 1]);
    }
    this.chainRivers();
    const r = RIVER_RADIUS;
    const smoothSegments: number[][] = [];
    for (const line of this.riverLines) {
      for (let k = 0; k + 1 < line.length; k++) smoothSegments.push([line[k]![0], line[k]![1], line[k + 1]![0], line[k + 1]![1]]);
    }
    for (const [x0, y0, x1, y1] of smoothSegments) {
      for (const shift of [0, this.width, -this.width]) {
        const ax = x0! + shift;
        const bx = x1! + shift;
        const minX = Math.max(0, Math.floor((Math.min(ax, bx) - r) * RIVER_RES));
        const maxX = Math.min(this.rw - 1, Math.ceil((Math.max(ax, bx) + r) * RIVER_RES));
        if (minX > maxX) continue;
        const minZ = Math.max(0, Math.floor((Math.min(y0!, y1!) - r) * RIVER_RES));
        const maxZ = Math.min(this.rh - 1, Math.ceil((Math.max(y0!, y1!) + r) * RIVER_RES));
        for (let j = minZ; j <= maxZ; j++) {
          for (let ii = minX; ii <= maxX; ii++) {
            const px = ii / RIVER_RES;
            const pz = j / RIVER_RES;
            const d = segDist(px, pz, ax, y0!, bx, y1!);
            const k = j * this.rw + ii;
            if (d < this.riverDist[k]!) this.riverDist[k] = d;
          }
        }
      }
    }
  }
}

/**
 * Joins edge segments into polylines (breaking at forks and ends), unwraps x so each
 * line is continuous across the date line, and rounds the zigzag of tile edges with
 * two passes of Chaikin smoothing.
 */
function chaikin(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts;
  const out: [number, number][] = [pts[0]!];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  const qx = ax + t * dx - px;
  const qz = az + t * dz - pz;
  return Math.sqrt(qx * qx + qz * qz);
}
