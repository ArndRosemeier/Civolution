/**
 * Worker automation (PLAN.md §8.3): one pool for all of a player's automated workers.
 * Jobs are gathered empire-wide and scored by the player's task priorities and each
 * city's needs (food-short cities want irrigation and clearing, weak producers want
 * mines); every idle worker takes the best job near it that no one else holds. The
 * board says who does what and why, so the UI can show it.
 *
 * Fixes Civ3's worst habits: workers never replace a mine with irrigation or the other
 * way round, never work inside regions where the player forbade a job, and keep away
 * from enemies they can see.
 */
import {
  atWar,
  cityRadiusTiles,
  cityReport,
  distance,
  empireInfo,
  isExplored,
  jobBlocker,
  neighbour,
  neighbours,
  playerCities,
  playerUnits,
  visibleTiles,
  IMP_CRATER,
  IMP_IRRIGATION,
  IMP_MINE,
  IMP_POLLUTION,
  IMP_RAIL,
  IMP_ROAD,
  type City,
  type GameState,
  type Rules,
  type Unit,
  type WorkerTask,
} from '@civolution/engine';
import { knownLand } from './empire.ts';

export interface WorkerJob {
  tile: number;
  job: string;
  task: WorkerTask;
  score: number;
  why: string;
}

export interface JobAssignment {
  unit: number;
  tile: number;
  job: string;
  why: string;
  /** Tiles to walk. */
  travel: number;
}

export interface JobBoard {
  jobs: WorkerJob[];
  /** Workers already at work (kept) and those given a new job this turn. */
  assignments: JobAssignment[];
  /** Automated workers with nothing worth doing in reach. */
  idle: number[];
  /** Workers that should get out of an enemy's way, with the city they flee to. */
  retreat: { unit: number; to: number }[];
}

/** Whether the player forbade `job` on `tile` (worker regions). */
export function forbidden(state: GameState, player: number, tile: number, job: string): boolean {
  for (const r of state.players[player]!.automation.regions) if (r.forbid.includes(job) && distance(state.map, r.center, tile) <= r.radius) return true;
  return false;
}

/** Tiles from `from` toward `to`, stepping to the neighbour closest to the target (no path search). */
function walk(state: GameState, from: number, to: number, limit = 12): number[] {
  const out: number[] = [];
  let t = from;
  for (let i = 0; i < limit && t !== to; i++) {
    let best = -1;
    let bestD = Infinity;
    for (let dir = 0; dir < 8; dir++) {
      const j = neighbour(state.map, t, dir);
      if (j < 0) continue;
      const d = distance(state.map, j, to);
      if (d < bestD) {
        best = j;
        bestD = d;
      }
    }
    if (best < 0) break;
    t = best;
    out.push(t);
  }
  return out;
}

/** Enemy (at war) units the player can see, by tile. */
function dangerTiles(rules: Rules, state: GameState, player: number): Set<number> {
  const seen = visibleTiles(rules, state, player);
  const out = new Set<number>();
  for (const u of Object.values(state.units)) {
    if (u.owner === player || !seen[u.tile] || !atWar(state, player, u.owner)) continue;
    const r = rules.unit(u.type);
    if (r.attack === 0 || r.domain === 'air') continue;
    out.add(u.tile);
    for (const t of neighbours(state.map, u.tile)) {
      out.add(t);
      for (const k of neighbours(state.map, t)) out.add(k);
    }
  }
  return out;
}

/** All jobs worth doing for `player`, best first. */
export function workerJobs(rules: Rules, state: GameState, player: number, danger = dangerTiles(rules, state, player)): WorkerJob[] {
  const p = state.players[player]!;
  const m = state.map;
  const order = p.automation.workerTasks;
  const bonus = (task: WorkerTask) => (order.length - order.indexOf(task)) * 6;
  const jobs = new Map<string, WorkerJob>();
  const add = (tile: number, task: WorkerTask, job: string, base: number, why: string) => {
    if (danger.has(tile) || forbidden(state, player, tile, job)) return;
    const owner = m.territory[tile]!;
    if (owner !== player && owner !== -1) return;
    if (!isExplored(p, tile) || jobBlocker(rules, state, player, tile, job) !== null) return;
    const key = `${tile}:${job}`;
    const score = base + bonus(task);
    const prev = jobs.get(key);
    if (!prev || prev.score < score) jobs.set(key, { tile, job, task, score, why });
  };
  const cities = playerCities(state, player);
  const info = empireInfo(rules, state, player);
  const cityTiles = new Set(cities.map((c) => c.tile));
  for (const c of cities) {
    const r = cityReport(rules, state, c);
    const hungry = r.foodSurplus < 2;
    const weak = r.shieldsBase.value < Math.max(2, Math.ceil(c.size / 2));
    const worked = new Set(c.worked);
    for (const t of cityRadiusTiles(m, c.tile)) {
      if (t === c.tile || m.territory[t] !== player) continue;
      const imp = m.improvements[t]!;
      const terrain = rules.terrains[m.terrain[t]!]!;
      const w = worked.has(t) ? 10 : 0;
      if (imp & (IMP_POLLUTION | IMP_CRATER)) add(t, 'pollution', 'clearDamage', 60 + w, `clean up pollution near ${c.name}`);
      const improved = (imp & (IMP_IRRIGATION | IMP_MINE)) !== 0;
      // Hills and the like can take either: the city's need decides, once.
      const canIrrigate = terrain.irrigationFood > 0;
      const canMine = terrain.mineShields > 0;
      if (!improved && canIrrigate && (!canMine || hungry || !weak)) add(t, 'irrigate', 'irrigation', 20 + w + (hungry ? 15 : 0), `irrigate ${terrain.name} for ${c.name}${hungry ? ' (short of food)' : ''}`);
      if (!improved && canMine && (!canIrrigate || (weak && !hungry)) && terrain.mineShields > 1)
        add(t, 'mine', 'mine', 18 + w + (weak ? 15 : 0), `mine ${terrain.name} for ${c.name}${weak ? ' (low production)' : ''}`);
      if (!(imp & IMP_ROAD) && worked.has(t) && terrain.roadCommerce > 0) add(t, 'roads', 'road', 16 + w, `road for trade near ${c.name}`);
      if ((imp & IMP_ROAD) && !(imp & IMP_RAIL) && worked.has(t)) add(t, 'railroads', 'railroad', 14 + w, `railroad near ${c.name}`);
      if (hungry && worked.has(t) && terrain.transform && terrain.transform.job !== 'plantForest' && distance(m, c.tile, t) <= 2)
        add(t, 'clear', terrain.transform.job, 22 + w, `clear ${terrain.name} for food near ${c.name}`);
    }
  }
  // Roads between neighbouring cities that the network does not join yet.
  for (const c of cities) {
    let nearest: City | null = null;
    for (const o of cities) if (o !== c && (!nearest || distance(m, c.tile, o.tile) < distance(m, c.tile, nearest.tile))) nearest = o;
    if (!nearest || distance(m, c.tile, nearest.tile) > 10 || info.component.get(c.id) === info.component.get(nearest.id)) continue;
    const gaps = walk(state, c.tile, nearest.tile).filter((t) => !cityTiles.has(t) && !(m.improvements[t]! & IMP_ROAD) && !rules.terrains[m.terrain[t]!]!.water);
    for (const t of gaps.slice(0, 3)) add(t, 'connectCities', 'road', 40, `road from ${c.name} to ${nearest.name}`);
  }
  // Luxuries and strategic resources outside every city's work area need a road home.
  const areas = new Set<number>();
  for (const c of cities) for (const t of cityRadiusTiles(m, c.tile)) areas.add(t);
  for (let t = 0; t < m.resource.length; t++) {
    const res = m.resource[t]!;
    if (res < 0 || m.territory[t] !== player || areas.has(t)) continue;
    const rule = rules.resources[res]!;
    if (rule.kind === 'bonus' || (rule.revealedBy && !p.techs.includes(rule.revealedBy))) continue;
    let home: City | null = null;
    for (const c of cities) if (!home || distance(m, c.tile, t) < distance(m, home.tile, t)) home = c;
    if (!home) continue;
    const path = [t, ...walk(state, t, home.tile)].filter((x) => !cityTiles.has(x) && !rules.terrains[m.terrain[x]!]!.water);
    const gaps = path.filter((x) => !(m.improvements[x]! & IMP_ROAD));
    for (const x of gaps.slice(0, 2)) add(x, 'connectResources', 'road', 46, `connect ${rule.name} to ${home.name}`);
  }
  return [...jobs.values()].sort((a, b) => b.score - a.score || a.tile - b.tile || a.job.localeCompare(b.job));
}

/** Units in the player's worker pool. */
export function poolWorkers(state: GameState, player: number): Unit[] {
  return playerUnits(state, player).filter((u) => u.routine === 'autoWorker' && u.carriedBy === null);
}

/**
 * The job board: who works where. Workers busy with a job keep it; idle ones take, in
 * id order, the job with the best score less travel that is still free.
 */
export function jobBoard(rules: Rules, state: GameState, player: number): JobBoard {
  const danger = dangerTiles(rules, state, player);
  const jobs = workerJobs(rules, state, player, danger);
  // Land the player knows a way across (explored tiles), so a worker never picks a job it cannot walk to.
  const masses = knownLand(rules, state, player);
  const workers = poolWorkers(state, player);
  const assignments: JobAssignment[] = [];
  const idle: number[] = [];
  const retreat: { unit: number; to: number }[] = [];
  // One worker per tile: two jobs on one tile would undo each other.
  const taken = new Set<number>();
  const cities = playerCities(state, player);
  for (const u of workers) {
    if (u.order?.type === 'work') {
      taken.add(u.tile);
      const known = jobs.find((j) => j.tile === u.tile && j.job === (u.order as { job: string }).job);
      assignments.push({ unit: u.id, tile: u.tile, job: u.order.job, why: known?.why ?? `${rules.job(u.order.job).name.toLowerCase()} here`, travel: 0 });
    }
  }
  for (const u of workers) {
    if (u.order?.type === 'work') continue;
    const rule = rules.unit(u.type);
    if (danger.has(u.tile) && !cities.some((c) => c.tile === u.tile)) {
      const safe = cities.filter((c) => masses[c.tile] === masses[u.tile]).sort((a, b) => distance(state.map, a.tile, u.tile) - distance(state.map, b.tile, u.tile) || a.id - b.id)[0];
      if (safe) {
        retreat.push({ unit: u.id, to: safe.tile });
        continue;
      }
    }
    // Already walking to a free job: keep going.
    if (u.order?.type === 'goto') {
      const target = u.order.target;
      const same = jobs.find((j) => j.tile === target && !taken.has(j.tile) && rule.jobs.includes(j.job));
      if (same) {
        taken.add(same.tile);
        assignments.push({ unit: u.id, tile: same.tile, job: same.job, why: same.why, travel: distance(state.map, u.tile, same.tile) });
        continue;
      }
    }
    let best: WorkerJob | null = null;
    let bestScore = 0;
    for (const j of jobs) {
      // Jobs are sorted by score and travel only lowers it: nothing further down can win.
      if (j.score <= bestScore) break;
      if (taken.has(j.tile) || !rule.jobs.includes(j.job) || masses[j.tile] !== masses[u.tile]) continue;
      const travel = distance(state.map, u.tile, j.tile);
      if (travel > 15) continue;
      const score = j.score - travel * 3;
      if (score > bestScore) {
        best = j;
        bestScore = score;
      }
    }
    if (!best) {
      idle.push(u.id);
      continue;
    }
    taken.add(best.tile);
    assignments.push({ unit: u.id, tile: best.tile, job: best.job, why: best.why, travel: distance(state.map, u.tile, best.tile) });
  }
  return { jobs, assignments, idle, retreat };
}
