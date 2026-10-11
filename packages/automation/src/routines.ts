/**
 * Unit routines (PLAN.md §8.4). A routine looks at the state and proposes the next
 * ordinary engine command for one unit, with a reason the UI can show. It never
 * changes state itself, so automation cannot do anything the player could not.
 *
 * Routines: `explore`, `autoWorker` (the worker pool's job board when one is given,
 * else jobs around the worker's home city), `autoSettle`, `garrison` (to the nearest own
 * city short of defenders, then fortify), `patrol:<a>:<b>` (back and forth),
 * `rally:<tile>` (walk there and fortify) and `bombard` (fire at enemies in range).
 */
import { bestSite, siteScore } from './empire.ts';
import { defenders } from './conditions.ts';
import type { JobBoard } from './workers.ts';
import {
  atWar,
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

export type RoutineId = 'explore' | 'autoWorker' | 'autoSettle' | 'garrison' | 'bombard' | `patrol:${number}:${number}` | `rally:${number}`;

export interface Proposal {
  command: Command;
  /** Set when the routine has nothing left to do and should be switched off. */
  finished?: boolean;
}

/** Shared per run: the worker pool's board, when workers are pooled. */
export interface RoutineContext {
  board?: JobBoard;
}

/** Next command for this unit's routine, or null if it should wait for next turn. */
export function proposeRoutine(rules: Rules, state: GameState, u: Unit, ctx: RoutineContext = {}): Proposal | null {
  if (u.movesLeft <= 0) return null;
  const routine = u.routine ?? '';
  if (routine.startsWith('patrol:')) return proposePatrol(u, routine);
  if (routine.startsWith('rally:')) return proposeRally(u, Number(routine.slice(6)));
  switch (routine) {
    case 'explore':
      return proposeExplore(rules, state, u);
    case 'autoWorker':
      return ctx.board ? proposePooledWorker(u, ctx.board) : proposeAutoWorker(rules, state, u);
    case 'autoSettle':
      return proposeAutoSettle(rules, state, u);
    case 'garrison':
      return proposeGarrison(rules, state, u);
    case 'bombard':
      return proposeBombard(rules, state, u);
    default:
      return null;
  }
}

/** A worker of the pool: the board says where it works, or where it runs to. */
function proposePooledWorker(u: Unit, board: JobBoard): Proposal | null {
  if (u.order?.type === 'work') return null;
  const flee = board.retreat.find((r) => r.unit === u.id);
  if (flee) {
    if (flee.to === u.tile) return { command: { type: 'fortify', player: u.owner, unit: u.id, reason: 'Auto worker: waiting in the city until the enemy leaves' } };
    return { command: { type: 'goto', player: u.owner, unit: u.id, to: flee.to, reason: 'Auto worker: retreating from enemy units' } };
  }
  const a = board.assignments.find((x) => x.unit === u.id);
  if (!a) return null;
  if (a.tile === u.tile) return { command: { type: 'work', player: u.owner, unit: u.id, job: a.job, reason: `Auto worker: ${a.why}` } };
  if (u.order?.type === 'goto' && u.order.target === a.tile) return { command: { type: 'skip', player: u.owner, unit: u.id, reason: `Auto worker: on the way to ${a.why}` } };
  return { command: { type: 'goto', player: u.owner, unit: u.id, to: a.tile, reason: `Auto worker: heading to ${a.why}` } };
}

/** Garrison: to the nearest own city on this land short of defenders, then fortify there. */
function proposeGarrison(rules: Rules, state: GameState, u: Unit): Proposal | null {
  if (u.fortified) return null;
  const want = Math.max(1, state.players[u.owner]!.automation.garrison);
  const here = cityAt(state, u.tile);
  if (here?.owner === u.owner && defenders(rules, state, here) <= want)
    return { command: { type: 'fortify', player: u.owner, unit: u.id, reason: `Garrison: guarding ${here.name}` } };
  if (u.order?.type === 'goto') return { command: { type: 'skip', player: u.owner, unit: u.id, reason: 'Garrison: on the way' } };
  const masses = landMasses(rules, state);
  const heading = new Map<number, number>();
  for (const o of Object.values(state.units))
    if (o.owner === u.owner && o.routine === 'garrison' && o.order?.type === 'goto') heading.set(o.order.target, (heading.get(o.order.target) ?? 0) + 1);
  const options = playerCities(state, u.owner)
    .filter((c) => masses[c.tile] === masses[u.tile] && c.tile !== u.tile)
    .map((c) => ({ c, short: want - defenders(rules, state, c) - (heading.get(c.tile) ?? 0), d: distance(state.map, u.tile, c.tile) }));
  const pick = options.filter((o) => o.short > 0).sort((a, b) => a.d - b.d || a.c.id - b.c.id)[0];
  if (pick) return { command: { type: 'goto', player: u.owner, unit: u.id, to: pick.c.tile, reason: `Garrison: ${pick.c.name} needs ${pick.short} more defender${pick.short === 1 ? '' : 's'}` } };
  if (here?.owner === u.owner) return { command: { type: 'fortify', player: u.owner, unit: u.id, reason: `Garrison: every city is guarded; reserve in ${here.name}` } };
  const nearest = options.sort((a, b) => a.d - b.d || a.c.id - b.c.id)[0];
  if (nearest) return { command: { type: 'goto', player: u.owner, unit: u.id, to: nearest.c.tile, reason: `Garrison: every city is guarded; reserve in ${nearest.c.name}` } };
  return { command: { type: 'setRoutine', player: u.owner, unit: u.id, routine: null, reason: 'Garrison: no city to guard on this land' }, finished: true };
}

/** Patrol between two tiles. */
function proposePatrol(u: Unit, routine: string): Proposal | null {
  const [, a, b] = routine.split(':').map(Number) as [number, number, number];
  if (u.order?.type === 'goto') return { command: { type: 'skip', player: u.owner, unit: u.id, reason: 'Patrol: on the way' } };
  const to = u.tile === a ? b : a;
  if (to === u.tile) return null;
  return { command: { type: 'goto', player: u.owner, unit: u.id, to, reason: 'Patrol: to the other end of the route' } };
}

/** Rally: walk to the rally point and fortify there. */
function proposeRally(u: Unit, tile: number): Proposal | null {
  if (u.tile === tile) return u.fortified ? null : { command: { type: 'fortify', player: u.owner, unit: u.id, reason: 'Rally point reached' }, finished: true };
  if (u.order?.type === 'goto') return { command: { type: 'skip', player: u.owner, unit: u.id, reason: 'Rally: on the way' } };
  return { command: { type: 'goto', player: u.owner, unit: u.id, to: tile, reason: 'Rally: heading for the rally point' } };
}

/** Bombard: fire at the strongest enemy stack or city in range; otherwise wait. */
function proposeBombard(rules: Rules, state: GameState, u: Unit): Proposal | null {
  const r = rules.unit(u.type);
  if (!r.specialActions.includes('bombard') || r.bombardStrength <= 0 || u.attacked) return null;
  const range = Math.max(1, r.bombardRange);
  let best = -1;
  let bestCount = 0;
  for (const t of tilesInRadius(state.map, u.tile, range)) {
    if (t === u.tile) continue;
    const enemies = Object.values(state.units).filter((x) => x.tile === t && x.owner !== u.owner && atWar(state, u.owner, x.owner)).length;
    const city = cityAt(state, t);
    const count = enemies + (city && city.owner !== u.owner && atWar(state, u.owner, city.owner) ? 2 : 0);
    if (count > bestCount || (count === bestCount && count > 0 && t < best)) {
      best = t;
      bestCount = count;
    }
  }
  if (best < 0) return null;
  return { command: { type: 'bombard', player: u.owner, unit: u.id, target: best, reason: 'Bombard routine: firing at the enemy in range' }, finished: true };
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
    // With military delegated, an explorer that is done goes back to guarding cities.
    const military = state.players[u.owner]!.automation.delegate.military && rules.unit(u.type).defence > 0;
    return {
      command: { type: 'setRoutine', player: u.owner, unit: u.id, routine: military ? 'garrison' : null, reason: military ? 'Exploring done: back to garrison duty' : 'Exploring: nothing left this unit can reach' },
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
