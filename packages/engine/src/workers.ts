/**
 * Worker jobs (docs/rules/workers.md). Work is counted in "percent worker-turns":
 * a job needs baseTurns × terrain movement cost × 100, and each worker adds
 * workRate (100 for a Worker) × the government's worker rate every turn. Workers on
 * the same tile doing the same job pool their work.
 */
import { availableResources } from './empire.ts';
import { distance } from './grid.ts';
import { cityRadiusTiles, playerCities } from './territory.ts';
import { hasFreshWaterAccess, hasTechFlag, knowsTech, unitsAt } from './queries.ts';
import type { Rules } from './rules.ts';
import {
  IMP_BARRICADE,
  IMP_CRATER,
  IMP_FORTRESS,
  IMP_IRRIGATION,
  IMP_MINE,
  IMP_POLLUTION,
  IMP_RAIL,
  IMP_ROAD,
  type GameState,
  type Unit,
} from './state.ts';
import type { Tx } from './tx.ts';

export type JobCheck = { ok: true; turns: number } | { ok: false; reason: string };

/** Work needed to finish `job` on `tile` from scratch. */
export function jobCost(rules: Rules, state: GameState, tile: number, job: string): number {
  const terrain = rules.terrains[state.map.terrain[tile]!]!;
  return rules.job(job).baseTurns * terrain.movementCost * 100;
}

/** Work one unit adds per turn. */
export function workRate(rules: Rules, state: GameState, u: Unit): number {
  const owner = state.players[u.owner]!;
  const gov = rules.government(owner.government);
  const doubled = hasTechFlag(rules, owner, 'doublesWorkRate') ? 2 : 1;
  return rules.unit(u.type).workRate * gov.workerRate * doubled;
}

/** Why a job is not possible here, or null if it is (ignores who is doing it). */
export function jobBlocker(rules: Rules, state: GameState, player: number, tile: number, job: string): string | null {
  const m = state.map;
  const terrain = rules.terrains[m.terrain[tile]!]!;
  const imp = m.improvements[tile]!;
  const p = state.players[player]!;
  const rule = rules.job(job);
  if (terrain.water) return 'Workers cannot work water tiles.';
  if (rule.requiredTech && !knowsTech(p, rule.requiredTech)) return `Requires ${rules.tech(rule.requiredTech).name}.`;
  const have = rule.requiredResources.length > 0 ? availableResources(rules, state, player) : new Set<string>();
  const missing = rule.requiredResources.filter((r) => !have.has(r));
  if (missing.length > 0)
    return `Requires access to ${missing.map((r) => rules.resources[rules.resourceIndex(r)]!.name).join(' and ')}.`;
  switch (job) {
    case 'road':
      return imp & IMP_ROAD ? 'There is already a road here.' : null;
    case 'railroad':
      if (!(imp & IMP_ROAD)) return 'Build a road first.';
      return imp & IMP_RAIL ? 'There is already a railroad here.' : null;
    case 'irrigation':
      if (terrain.irrigationFood === 0) return `${terrain.name} cannot be irrigated.`;
      if (imp & IMP_IRRIGATION) return 'This tile is already irrigated.';
      if (!hasFreshWaterAccess(state, tile, IMP_IRRIGATION) && !hasTechFlag(rules, p, 'irrigationWithoutFreshWater'))
        return 'Needs fresh water: a river, a lake or an irrigated tile next to it.';
      return null;
    case 'mine':
      if (terrain.mineShields === 0) return `${terrain.name} cannot be mined.`;
      return imp & IMP_MINE ? 'There is already a mine here.' : null;
    case 'fortress':
      if (!terrain.allowsFortress) return `Fortresses cannot be built on ${terrain.name}.`;
      return imp & IMP_FORTRESS ? 'There is already a fortress here.' : null;
    case 'barricade':
      if (!(imp & IMP_FORTRESS)) return 'Build a fortress first.';
      return imp & IMP_BARRICADE ? 'There is already a barricade here.' : null;
    case 'clearDamage':
      return imp & (IMP_POLLUTION | IMP_CRATER) ? null : 'There is no pollution or crater to clear.';
    case 'plantForest':
    case 'clearForest':
    case 'clearWetlands':
      return terrain.transform?.job === job ? null : `Not possible on ${terrain.name}.`;
    default:
      return `${rule.name} arrives in a later phase.`;
  }
}

export function checkJob(rules: Rules, state: GameState, u: Unit, job: string): JobCheck {
  const rule = rules.unit(u.type);
  if (!rule.jobs.includes(job)) return { ok: false, reason: `${rule.name} cannot do this.` };
  const blocker = jobBlocker(rules, state, u.owner, u.tile, job);
  if (blocker) return { ok: false, reason: blocker };
  return { ok: true, turns: turnsLeft(rules, state, u.tile, job, [u]) };
}

/** Turns until `job` finishes on `tile` with these workers plus any already on it. */
export function turnsLeft(rules: Rules, state: GameState, tile: number, job: string, extra: Unit[] = []): number {
  const progress = state.work[tile];
  const done = progress?.job === job ? progress.done : 0;
  const workers = new Map<number, Unit>();
  for (const u of unitsAt(state, tile)) if (u.order?.type === 'work' && u.order.job === job) workers.set(u.id, u);
  for (const u of extra) workers.set(u.id, u);
  const rate = [...workers.values()].reduce((a, u) => a + workRate(rules, state, u), 0);
  if (rate <= 0) return Infinity;
  return Math.max(1, Math.ceil((jobCost(rules, state, tile, job) - done) / rate));
}

/** End-of-turn step: add every working unit's work and complete finished jobs. */
export function advanceWork(rules: Rules, tx: Tx): void {
  const byTile = new Map<number, Unit[]>();
  for (const u of Object.values(tx.state.units).sort((a, b) => a.id - b.id)) {
    if (u.order?.type !== 'work') continue;
    const list = byTile.get(u.tile);
    if (list) list.push(u);
    else byTile.set(u.tile, [u]);
  }
  for (const key of Object.keys(tx.state.work)) if (!byTile.has(Number(key))) tx.setWork(Number(key), null);
  for (const [tile, workers] of [...byTile.entries()].sort((a, b) => a[0] - b[0])) {
    const job = (workers[0]!.order as { job: string }).job;
    const sameJob = workers.filter((u) => u.order?.type === 'work' && u.order.job === job);
    // A job that became impossible (a neighbour lost its irrigation, say) stops quietly.
    if (jobBlocker(rules, tx.state, sameJob[0]!.owner, tile, job)) {
      for (const u of sameJob) tx.unit(u.id).order = null;
      tx.setWork(tile, null);
      continue;
    }
    const prev = tx.state.work[tile];
    const done = (prev?.job === job ? prev.done : 0) + sameJob.reduce((a, u) => a + workRate(rules, tx.state, u), 0);
    if (done < jobCost(rules, tx.state, tile, job)) {
      tx.setWork(tile, { job, done });
      continue;
    }
    tx.setWork(tile, null);
    completeJob(rules, tx, tile, job, sameJob[0]!.owner);
    for (const u of sameJob) tx.unit(u.id).order = null;
  }
}

function completeJob(rules: Rules, tx: Tx, tile: number, job: string, player: number): void {
  const m = tx.state.map;
  const setImp = (add: number, remove = 0) => {
    const imp = tx.mapArray('improvements');
    imp[tile] = (imp[tile]! | add) & ~remove;
  };
  const setTerrain = (t: number) => {
    tx.mapArray('terrain')[tile] = t;
    // Resources that cannot exist on the new terrain disappear with the old one.
    const res = m.resource[tile]!;
    if (res >= 0 && !rules.terrains[t]!.possibleResources.includes(rules.resources[res]!.id)) tx.mapArray('resource')[tile] = -1;
  };
  switch (job) {
    case 'road': setImp(IMP_ROAD); break;
    case 'railroad': setImp(IMP_RAIL); break;
    case 'irrigation': setImp(IMP_IRRIGATION, IMP_MINE); break;
    case 'mine': setImp(IMP_MINE, IMP_IRRIGATION); break;
    case 'fortress': setImp(IMP_FORTRESS); break;
    case 'barricade': setImp(IMP_BARRICADE); break;
    case 'clearDamage': setImp(0, IMP_POLLUTION | IMP_CRATER); break;
    case 'plantForest': {
      const before = m.terrain[tile]!;
      tx.mapArray('underlying')[tile] = before;
      setTerrain(rules.terrainIndex(rules.terrains[before]!.transform!.result));
      setImp(0, IMP_IRRIGATION | IMP_MINE);
      break;
    }
    case 'clearForest':
    case 'clearWetlands': {
      const before = rules.terrains[m.terrain[tile]!]!;
      const under = m.underlying[tile]!;
      setTerrain(under >= 0 ? under : rules.terrainIndex(before.transform!.result));
      tx.mapArray('underlying')[tile] = -1;
      if (job === 'clearForest') {
        // The timber goes to the nearest of the player's cities whose work area holds the tile.
        const shields = rules.set.general.forestClearShields;
        const city = playerCities(tx.state, player)
          .filter((c) => cityRadiusTiles(m, c.tile).includes(tile))
          .sort((a, b) => distance(m, a.tile, tile) - distance(m, b.tile, tile) || a.id - b.id)[0];
        if (city) tx.city(city.id).shields = city.shields + shields;
        tx.emit({ type: 'forestCleared', tile, player, shields: city ? shields : 0, ...(city ? { city: city.id } : {}) });
      }
      break;
    }
  }
  tx.emit({ type: 'workCompleted', tile, job, player });
}
