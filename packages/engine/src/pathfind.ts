/**
 * Shortest paths for goto orders: Dijkstra over the tiles the owner has explored,
 * using the movement rules for step costs. A step never counts for more than the
 * unit's full movement, because a unit may always make one step per turn.
 */
import { distance, neighbours } from './grid.ts';
import { stepCost, stepValue } from './movement.ts';
import { IMP_RAIL } from './state.ts';
import { isExplored, maxMoves } from './queries.ts';
import type { Rules } from './rules.ts';
import type { GameState, Unit } from './state.ts';

export interface Path {
  /** Tiles after the start, ending at the target. */
  tiles: number[];
  /** Sum of step costs in movement thirds. */
  cost: number;
}

/** Minimal binary heap of [priority, value] pairs. */
class Heap {
  private items: [number, number][] = [];
  get size(): number {
    return this.items.length;
  }
  push(p: number, v: number): void {
    const a = this.items;
    a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]![0] < p || (a[parent]![0] === p && a[parent]![1] <= v)) break;
      a[i] = a[parent]!;
      i = parent;
    }
    a[i] = [p, v];
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      const less = (x: [number, number], y: [number, number]) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = -1;
        let best = last;
        if (l < a.length && less(a[l]!, best)) { m = l; best = a[l]!; }
        if (r < a.length && less(a[r]!, best)) { m = r; best = a[r]!; }
        if (m < 0) break;
        a[i] = a[m]!;
        i = m;
      }
      a[i] = last;
    }
    return top;
  }
}

export function findPath(rules: Rules, state: GameState, u: Unit, target: number, maxCost = Infinity): Path | null {
  if (target === u.tile) return { tiles: [], cost: 0 };
  const owner = state.players[u.owner]!;
  if (!isExplored(owner, target)) return null;
  const cap = Math.max(1, maxMoves(rules, u));
  // A*: every step costs at least a road move, unless railroads (free) exist anywhere.
  const floor = hasRails(state) ? 0 : 1;
  const h = (t: number) => (floor === 0 ? 0 : distance(state.map, t, target) * floor);
  const dist = new Map<number, number>([[u.tile, 0]]);
  const prev = new Map<number, number>();
  const heap = new Heap();
  heap.push(h(u.tile), u.tile);
  while (heap.size > 0) {
    const [f, tile] = heap.pop();
    const d = dist.get(tile) ?? Infinity;
    if (f - h(tile) > d) continue;
    if (tile === target) break;
    if (d > maxCost) break;
    for (const next of neighbours(state.map, tile)) {
      if (!isExplored(owner, next)) continue;
      const step = stepValue(rules, state, u, tile, next);
      if (step < 0) continue;
      const nd = d + Math.min(step, cap);
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        prev.set(next, tile);
        heap.push(nd + h(next), next);
      }
    }
  }
  if (!dist.has(target)) return null;
  const tiles: number[] = [];
  for (let t = target; t !== u.tile; t = prev.get(t)!) tiles.push(t);
  tiles.reverse();
  return { tiles, cost: dist.get(target)! };
}

/** Turns a path takes for this unit starting with its current moves, simulating the step rule. */
export function pathTurns(rules: Rules, state: GameState, u: Unit, path: Path): number {
  const full = maxMoves(rules, u);
  let left = u.movesLeft;
  let turns = 1;
  let from = u.tile;
  for (const tile of path.tiles) {
    if (left <= 0) {
      turns++;
      left = full;
    }
    const step = stepCost(rules, state, u, from, tile);
    left -= step.ok ? step.cost : full;
    from = tile;
  }
  return turns;
}

/** Every tile reachable this turn with the unit's remaining moves (for range overlays). */
export function reachableThisTurn(rules: Rules, state: GameState, u: Unit): number[] {
  const best = new Map<number, number>([[u.tile, u.movesLeft]]);
  const queue = [u.tile];
  while (queue.length > 0) {
    const tile = queue.shift()!;
    const left = best.get(tile)!;
    if (left <= 0) continue;
    for (const next of neighbours(state.map, tile)) {
      const step = stepValue(rules, state, u, tile, next);
      if (step < 0) continue;
      const after = Math.max(0, left - step);
      if (after > (best.get(next) ?? -1)) {
        best.set(next, after);
        queue.push(next);
      }
    }
  }
  best.delete(u.tile);
  return [...best.keys()].sort((a, b) => a - b);
}

/**
 * Cost from the unit to every explored tile it can reach (Dijkstra without a target),
 * with the same step rule as findPath. Used by automation to pick destinations.
 * `settled` sees each tile once, cheapest first, when its cost is final; returning true
 * ends the search early.
 */
export function costField(rules: Rules, state: GameState, u: Unit, maxCost = Infinity, settled?: (tile: number, cost: number) => boolean): Map<number, number> {
  const owner = state.players[u.owner]!;
  const cap = Math.max(1, maxMoves(rules, u));
  const dist = new Map<number, number>([[u.tile, 0]]);
  const heap = new Heap();
  heap.push(0, u.tile);
  while (heap.size > 0) {
    const [d, tile] = heap.pop();
    if (d > (dist.get(tile) ?? Infinity)) continue;
    if (settled?.(tile, d)) break;
    if (d > maxCost) continue;
    for (const next of neighbours(state.map, tile)) {
      if (!isExplored(owner, next)) continue;
      const step = stepValue(rules, state, u, tile, next);
      if (step < 0) continue;
      const nd = d + Math.min(step, cap);
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        heap.push(nd, next);
      }
    }
  }
  return dist;
}

const railCache = new WeakMap<number[], boolean>();

/** Whether any railroad exists (free moves make the A* distance bound useless). */
function hasRails(state: GameState): boolean {
  const imp = state.map.improvements;
  let v = railCache.get(imp);
  if (v === undefined) {
    v = imp.some((x) => (x & IMP_RAIL) !== 0);
    railCache.set(imp, v);
  }
  return v;
}
