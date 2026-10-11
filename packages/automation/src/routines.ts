/**
 * Unit routines (PLAN.md §8.4). A routine looks at the state and proposes the next
 * ordinary engine command for one unit, with a reason the UI can show. It never
 * changes state itself, so automation cannot do anything the player could not.
 *
 * Phase 1 ships two: `explore` and `autoWorker` (roads first, then irrigation and mines
 * around the player's home tile). Governors, templates and policies follow in Phase 5.
 */
import { bestSite, siteScore } from './empire.ts';
import {
  cityAt,
  cityReport,
  checkJob,
  costField,
  landMasses,
  tilesInRadius,
  distance,
  foundBlocker,
  playerCities,
  IMP_IRRIGATION,
  IMP_MINE,
  IMP_ROAD,
  isExplored,
  neighbours,
  tileOwners,
  type Command,
  type GameState,
  type Rules,
  type Unit,
} from '@civolution/engine';

export type RoutineId = 'explore' | 'autoWorker' | 'autoSettle';

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
    case 'autoSettle':
      return proposeAutoSettle(rules, state, u);
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

/** Where a worker calls home: its nearest city, or the start position before there are cities. */
export function homeTile(state: GameState, player: number, from?: number): number {
  const cities = playerCities(state, player);
  if (cities.length === 0) return state.map.starts[player] ?? 0;
  if (from === undefined) return cities[0]!.tile;
  let best = cities[0]!;
  for (const c of cities) if (distance(state.map, c.tile, from) < distance(state.map, best.tile, from)) best = c;
  return best.tile;
}

/** Settle: walk to the best city site nearby and found a city there. */
export function proposeAutoSettle(rules: Rules, state: GameState, u: Unit): Proposal | null {
  const target = u.order?.type === 'goto' ? u.order.target : -1;
  if (target >= 0 && siteScore(rules, state, u.owner, target) > 0) {
    return { command: { type: 'skip', player: u.owner, unit: u.id, reason: 'Settling: travelling to the site' } };
  }
  const site = bestSite(rules, state, u.owner, u.tile, 12);
  if (site < 0) {
    return { command: { type: 'setRoutine', player: u.owner, unit: u.id, routine: null, reason: 'Settling: no free site nearby' }, finished: true };
  }
  if (site === u.tile) {
    if (foundBlocker(rules, state, u) !== null) return null;
    return { command: { type: 'foundCity', player: u.owner, unit: u.id, reason: 'Settling: founding a city on the best site nearby' }, finished: true };
  }
  return { command: { type: 'goto', player: u.owner, unit: u.id, to: site, reason: 'Settling: heading for the best site nearby' } };
}

/**
 * Auto worker: candidate jobs within six tiles of home, scored by usefulness minus
 * travel; tiles another worker already claims are skipped.
 */
export function proposeAutoWorker(rules: Rules, state: GameState, u: Unit): Proposal | null {
  if (u.order?.type === 'work') return null;
  // Already on the way to a job: the engine carries the goto on at the start of each turn.
  const owners = tileOwners(state);
  const foreign = (t: number) => (owners.get(t) ?? []).some((o) => o !== u.owner);
  if (u.order?.type === 'goto' && u.order.target !== u.tile && !foreign(u.order.target)) {
    return { command: { type: 'skip', player: u.owner, unit: u.id, reason: 'Auto worker: travelling to the job' } };
  }
  const home = homeTile(state, u.owner, u.tile);
  const claimed = new Set<number>();
  for (const other of Object.values(state.units)) {
    if (other.owner !== u.owner || other.id === u.id || other.routine !== 'autoWorker') continue;
    if (other.order?.type === 'goto') claimed.add(other.order.target);
    if (other.order?.type === 'work') claimed.add(other.tile);
  }
  // Candidates: explored tiles near home on the worker's own land; travel by distance
  // (a full path search per idle worker per turn costs too much on big maps).
  const masses = landMasses(rules, state);
  const p = state.players[u.owner]!;
  const candidates: Job[] = [];
  // A home city short of food wants forests and wetlands cleared in its work area.
  const homeCity = cityAt(state, home);
  const hungry = homeCity ? cityReport(rules, state, homeCity).foodSurplus < 2 : false;
  for (const tile of tilesInRadius(state.map, home, 6)) {
    const d = distance(state.map, home, tile);
    if (claimed.has(tile) || masses[tile] !== masses[u.tile] || !isExplored(p, tile)) continue;
    const t = rules.terrains[state.map.terrain[tile]!]!;
    const imp = state.map.improvements[tile]!;
    const travel = distance(state.map, u.tile, tile);
    const consider = (job: string, value: number, why: string) => {
      if (foreign(tile)) return;
      const probe = { ...u, tile };
      if (!checkJob(rules, state, probe, job).ok) return;
      candidates.push({ tile, job, score: value - travel * 2 - d, why });
    };
    if (!(imp & IMP_ROAD)) consider('road', 30 - d * 3, `road ${d} tiles from home`);
    if (t.irrigationFood > 0 && !(imp & IMP_IRRIGATION) && !(imp & IMP_MINE)) consider('irrigation', 18 + t.food * 2, `irrigate ${t.name}`);
    if (t.mineShields > 1 && !(imp & IMP_MINE)) consider('mine', 16 + t.mineShields * 2, `mine ${t.name}`);
    if (hungry && d <= 2 && t.transform && t.transform.job !== 'plantForest')
      consider(t.transform.job, 34 - d * 2, `clear ${t.name} for food near ${homeCity!.name}`);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score || a.tile - b.tile);
  const pick = candidates[0]!;
  if (pick.tile === u.tile) {
    return { command: { type: 'work', player: u.owner, unit: u.id, job: pick.job, reason: `Auto worker: ${pick.why}` } };
  }
  return { command: { type: 'goto', player: u.owner, unit: u.id, to: pick.tile, reason: `Auto worker: heading to ${pick.why}` } };
}
