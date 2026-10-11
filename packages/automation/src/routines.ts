/**
 * Unit routines (PLAN.md §8.4). A routine looks at the state and proposes the next
 * ordinary engine command for one unit, with a reason the UI can show. It never
 * changes state itself, so automation cannot do anything the player could not.
 *
 * Phase 1 ships two: `explore` and `autoWorker` (roads first, then irrigation and mines
 * around the player's home tile). Governors, templates and policies follow in Phase 5.
 */
import {
  checkJob,
  costField,
  distance,
  IMP_IRRIGATION,
  IMP_MINE,
  IMP_ROAD,
  isExplored,
  neighbours,
  unitsAt,
  type Command,
  type GameState,
  type Rules,
  type Unit,
} from '@civolution/engine';

export type RoutineId = 'explore' | 'autoWorker';

export interface Proposal {
  command: Command;
  /** Set when the routine has nothing left to do and should be switched off. */
  finished?: boolean;
}

/** Next command for this unit's routine, or null if it should wait for next turn. */
export function proposeRoutine(rules: Rules, state: GameState, u: Unit): Proposal | null {
  if (u.movesLeft <= 0) return null;
  switch (u.routine) {
    case 'explore':
      return proposeExplore(rules, state, u);
    case 'autoWorker':
      return proposeAutoWorker(rules, state, u);
    default:
      return null;
  }
}

function unexploredAround(state: GameState, player: number, tile: number): number {
  const p = state.players[player]!;
  return neighbours(state.map, tile).filter((t) => !isExplored(p, t)).length;
}

/** Explore: head for the cheapest-to-reach tile that borders the most unexplored land. */
export function proposeExplore(rules: Rules, state: GameState, u: Unit): Proposal {
  if (u.order?.type === 'goto' && unexploredAround(state, u.owner, u.order.target) > 0) {
    // Already heading somewhere useful; the engine continues the goto at turn start.
    return { command: { type: 'skip', player: u.owner, unit: u.id, reason: 'Exploring: travelling on' } };
  }
  const field = costField(rules, state, u, rules.moveScale * 60);
  let best = -1;
  let bestScore = 0;
  for (const [tile, cost] of field) {
    if (tile === u.tile) continue;
    const unknown = unexploredAround(state, u.owner, tile);
    if (unknown === 0) continue;
    const score = Math.floor((unknown * 1000) / (cost + rules.moveScale));
    if (score > bestScore || (score === bestScore && tile < best)) {
      best = tile;
      bestScore = score;
    }
  }
  if (best < 0) {
    return {
      command: { type: 'setRoutine', player: u.owner, unit: u.id, routine: null, reason: 'Exploring: nothing left this unit can reach' },
      finished: true,
    };
  }
  return { command: { type: 'goto', player: u.owner, unit: u.id, to: best, reason: `Exploring: ${unexploredAround(state, u.owner, best)} unknown tiles next to the target` } };
}

interface Job {
  tile: number;
  job: string;
  score: number;
  why: string;
}

/** The player's home tile until cities exist: their start position. */
export function homeTile(state: GameState, player: number): number {
  return state.map.starts[player] ?? 0;
}

/**
 * Auto worker: candidate jobs within six tiles of home, scored by usefulness minus
 * travel; tiles another worker already claims are skipped.
 */
export function proposeAutoWorker(rules: Rules, state: GameState, u: Unit): Proposal | null {
  if (u.order?.type === 'work') return null;
  const home = homeTile(state, u.owner);
  const claimed = new Set<number>();
  for (const other of Object.values(state.units)) {
    if (other.owner !== u.owner || other.id === u.id || other.routine !== 'autoWorker') continue;
    if (other.order?.type === 'goto') claimed.add(other.order.target);
    if (other.order?.type === 'work') claimed.add(other.tile);
  }
  const field = costField(rules, state, u, rules.moveScale * 30);
  const candidates: Job[] = [];
  for (const [tile, cost] of field) {
    const d = distance(state.map, home, tile);
    if (d > 6 || claimed.has(tile)) continue;
    const t = rules.terrains[state.map.terrain[tile]!]!;
    const imp = state.map.improvements[tile]!;
    const travel = Math.floor(cost / rules.moveScale);
    const consider = (job: string, value: number, why: string) => {
      if (unitsAt(state, tile).some((o) => o.owner !== u.owner)) return;
      const probe = { ...u, tile };
      if (!checkJob(rules, state, probe, job).ok) return;
      candidates.push({ tile, job, score: value - travel * 2 - d, why });
    };
    if (!(imp & IMP_ROAD)) consider('road', 30 - d * 3, `road ${d} tiles from home`);
    if (t.irrigationFood > 0 && !(imp & IMP_IRRIGATION) && !(imp & IMP_MINE)) consider('irrigation', 18 + t.food * 2, `irrigate ${t.name}`);
    if (t.mineShields > 1 && !(imp & IMP_MINE)) consider('mine', 16 + t.mineShields * 2, `mine ${t.name}`);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score || a.tile - b.tile);
  const pick = candidates[0]!;
  if (pick.tile === u.tile) {
    return { command: { type: 'work', player: u.owner, unit: u.id, job: pick.job, reason: `Auto worker: ${pick.why}` } };
  }
  return { command: { type: 'goto', player: u.owner, unit: u.id, to: pick.tile, reason: `Auto worker: heading to ${pick.why}` } };
}
