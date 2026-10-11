/**
 * Map geometry. We keep Civ3's diamond grid exactly: a map is `width` × `height` in
 * rule-file units and tiles sit at (x, y) with x + y even, so a map holds
 * width × height / 2 tiles. The map wraps east–west.
 *
 * Directions are compass directions on that grid: N is (0, -2), NE is (1, -1), E is
 * (2, 0) and so on. A tile is a diamond whose corners point N, E, S, W; it shares an
 * edge with its NE, SE, SW and NW neighbours and only a corner with N, E, S and W.
 * Rivers run along those shared edges (docs/rules/map.md).
 *
 * In rotated coordinates u = (x + y) / 2, v = (y - x) / 2 the grid is an ordinary square
 * grid with king moves, so the distance between tiles is max(|du|, |dv|).
 */

export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly wrapX: boolean;
}

export const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Dir = (typeof DIRS)[number];
export const DIR_DX = [0, 1, 2, 1, 0, -1, -2, -1] as const;
export const DIR_DY = [-2, -1, 0, 1, 2, 1, 0, -1] as const;

/** Edge bits, one per edge-sharing direction. */
export const EDGE_NE = 1;
export const EDGE_SE = 2;
export const EDGE_SW = 4;
export const EDGE_NW = 8;
/** Edge bit for each direction index (0 for corner directions). */
export const DIR_EDGE = [0, EDGE_NE, 0, EDGE_SE, 0, EDGE_SW, 0, EDGE_NW] as const;
/** The same edge seen from the neighbour. */
export const OPPOSITE_EDGE: Record<number, number> = {
  [EDGE_NE]: EDGE_SW,
  [EDGE_SW]: EDGE_NE,
  [EDGE_SE]: EDGE_NW,
  [EDGE_NW]: EDGE_SE,
};

export function tileCount(g: Grid): number {
  return (g.width >> 1) * g.height;
}

export function tileIndex(g: Grid, x: number, y: number): number {
  return y * (g.width >> 1) + (x >> 1);
}

export function tileX(g: Grid, i: number): number {
  const half = g.width >> 1;
  const y = Math.floor(i / half);
  return 2 * (i % half) + (y & 1);
}

export function tileY(g: Grid, i: number): number {
  return Math.floor(i / (g.width >> 1));
}

/** Normalises x for wrapping maps; returns -1 when (x, y) is off the map. */
export function wrapTile(g: Grid, x: number, y: number): number {
  if (y < 0 || y >= g.height) return -1;
  if (g.wrapX) x = ((x % g.width) + g.width) % g.width;
  else if (x < 0 || x >= g.width) return -1;
  if (((x + y) & 1) !== 0) return -1;
  return tileIndex(g, x, y);
}

/** Neighbour in direction `dir` (0..7), or -1 off the map. */
export function neighbour(g: Grid, i: number, dir: number): number {
  return wrapTile(g, tileX(g, i) + DIR_DX[dir]!, tileY(g, i) + DIR_DY[dir]!);
}

export function neighbours(g: Grid, i: number): number[] {
  const out: number[] = [];
  for (let d = 0; d < 8; d++) {
    const n = neighbour(g, i, d);
    if (n >= 0) out.push(n);
  }
  return out;
}

/** Direction index from tile a to adjacent tile b, or -1 if not adjacent. */
export function directionTo(g: Grid, a: number, b: number): number {
  for (let d = 0; d < 8; d++) if (neighbour(g, a, d) === b) return d;
  return -1;
}

/** Signed x difference b - a, taking the short way round on wrapping maps. */
export function deltaX(g: Grid, ax: number, bx: number): number {
  let dx = bx - ax;
  if (g.wrapX) {
    if (dx > g.width / 2) dx -= g.width;
    else if (dx < -g.width / 2) dx += g.width;
  }
  return dx;
}

/** Tile distance (king moves on the rotated grid). */
export function distance(g: Grid, a: number, b: number): number {
  const dx = deltaX(g, tileX(g, a), tileX(g, b));
  const dy = tileY(g, b) - tileY(g, a);
  return (Math.abs(dx) + Math.abs(dy)) >> 1;
}

/** All tiles within `r` tile steps of `i` (including `i`). */
export function tilesInRadius(g: Grid, i: number, r: number): number[] {
  const x0 = tileX(g, i);
  const y0 = tileY(g, i);
  const out: number[] = [];
  for (let du = -r; du <= r; du++) {
    for (let dv = -r; dv <= r; dv++) {
      const t = wrapTile(g, x0 + du - dv, y0 + du + dv);
      if (t >= 0) out.push(t);
    }
  }
  return out;
}
