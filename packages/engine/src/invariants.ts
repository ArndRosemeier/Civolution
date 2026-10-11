/**
 * Invariant registry (PLAN.md §11): facts that must hold between turns in every game.
 * The headless runner checks them after every turn; tests check them after scripted
 * sequences. Each check returns human-readable problems, empty when all is well.
 */
import { neighbour, tileCount } from './grid.ts';
import { canStandOn } from './movement.ts';
import { isExplored, maxMoves } from './queries.ts';
import type { Rules } from './rules.ts';
import type { GameState } from './state.ts';

export interface Invariant {
  id: string;
  check(rules: Rules, state: GameState): string[];
}

export const invariants: Invariant[] = [
  {
    id: 'map-arrays',
    check(rules, s) {
      const n = tileCount(s.map);
      const out: string[] = [];
      for (const key of ['terrain', 'underlying', 'rivers', 'resource', 'improvements', 'flags'] as const)
        if (s.map[key].length !== n) out.push(`map.${key} has ${s.map[key].length} entries, expected ${n}`);
      s.map.terrain.forEach((t, i) => {
        if (!rules.terrains[t]) out.push(`tile ${i}: bad terrain ${t}`);
      });
      s.map.resource.forEach((r, i) => {
        if (r !== -1 && !rules.resources[r]) out.push(`tile ${i}: bad resource ${r}`);
      });
      return out;
    },
  },
  {
    id: 'rivers-symmetric',
    check(_rules, s) {
      const out: string[] = [];
      const pairs = [[1, 1, 4], [3, 2, 8], [5, 4, 1], [7, 8, 2]] as const;
      for (let i = 0; i < s.map.rivers.length; i++) {
        for (const [dir, bit, opposite] of pairs) {
          if (!(s.map.rivers[i]! & bit)) continue;
          const j = neighbour(s.map, i, dir);
          if (j >= 0 && !(s.map.rivers[j]! & opposite)) out.push(`river edge at tile ${i} has no partner on ${j}`);
        }
      }
      return out;
    },
  },
  {
    id: 'units-valid',
    check(rules, s) {
      const out: string[] = [];
      const n = tileCount(s.map);
      const owners = new Map<number, number>();
      for (const [key, u] of Object.entries(s.units)) {
        if (String(u.id) !== key) out.push(`unit key ${key} holds unit ${u.id}`);
        if (u.id >= s.nextUnitId) out.push(`unit ${u.id} is not below nextUnitId ${s.nextUnitId}`);
        if (!rules.hasUnit(u.type)) out.push(`unit ${u.id}: unknown type ${u.type}`);
        if (u.tile < 0 || u.tile >= n) {
          out.push(`unit ${u.id}: tile ${u.tile} off the map`);
          continue;
        }
        const p = s.players[u.owner];
        if (!p?.alive) out.push(`unit ${u.id}: owner ${u.owner} is not an active player`);
        else if (!isExplored(p, u.tile)) out.push(`unit ${u.id}: owner has not explored its tile`);
        const blocked = canStandOn(rules, s, u, u.tile);
        if (blocked && rules.unit(u.type).domain !== 'air') out.push(`unit ${u.id} (${u.type}) stands where it cannot: ${blocked}`);
        if (u.movesLeft < 0 || u.movesLeft > maxMoves(rules, u)) out.push(`unit ${u.id}: movesLeft ${u.movesLeft} out of range`);
        const other = owners.get(u.tile);
        if (other !== undefined && other !== u.owner) out.push(`tile ${u.tile} holds units of players ${other} and ${u.owner}`);
        owners.set(u.tile, u.owner);
        if (u.order?.type === 'goto' && (u.order.target < 0 || u.order.target >= n)) out.push(`unit ${u.id}: goto target off the map`);
      }
      return out;
    },
  },
  {
    id: 'work-has-workers',
    check(_rules, s) {
      const out: string[] = [];
      for (const [tile, w] of Object.entries(s.work)) {
        const working = Object.values(s.units).some((u) => String(u.tile) === tile && u.order?.type === 'work' && u.order.job === w.job);
        if (!working) out.push(`work on tile ${tile} (${w.job}) has no worker`);
        if (w.done < 0) out.push(`work on tile ${tile} has negative progress`);
      }
      return out;
    },
  },
  {
    id: 'players',
    check(_rules, s) {
      const out: string[] = [];
      const words = Math.ceil(tileCount(s.map) / 32);
      s.players.forEach((p, i) => {
        if (p.id !== i) out.push(`player at ${i} has id ${p.id}`);
        if (p.explored.length !== words) out.push(`player ${i}: explored bitset has ${p.explored.length} words, expected ${words}`);
        if (p.gold < 0) out.push(`player ${i}: negative gold`);
      });
      return out;
    },
  },
];

export function checkInvariants(rules: Rules, state: GameState): string[] {
  return invariants.flatMap((inv) => inv.check(rules, state).map((msg) => `[${inv.id}] ${msg}`));
}
