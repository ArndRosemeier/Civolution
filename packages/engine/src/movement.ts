/**
 * Movement rules (docs/rules/movement.md). Costs are in thirds of a movement point
 * (`rules.moveScale`): a road step costs 1, flat terrain 3, hills 6.
 */
import type { CommandError } from './commands.ts';
import { directionTo, tileX, tileY } from './grid.ts';
import { atWar, crossesRiver, hasTechFlag, tileOwners } from './queries.ts';
import type { Rules } from './rules.ts';
import { IMP_RAIL, IMP_ROAD, type GameState, type Unit } from './state.ts';

export type MoveCheck =
  | { ok: true; cost: number; explain: string }
  | { ok: false; error: CommandError };

const fail = (code: CommandError['code'], message: string): MoveCheck => ({ ok: false, error: { code, message } });

/** Can this unit's domain and abilities ever stand on `tile`? (ignores other units) */
export function canStandOn(rules: Rules, state: GameState, u: Unit, tile: number): string | null {
  const rule = rules.unit(u.type);
  const terrain = rules.terrains[state.map.terrain[tile]!]!;
  if (rule.domain === 'land') {
    if (terrain.water) return 'Land units cannot enter water (transports arrive in a later phase).';
    if (terrain.impassable) return `${terrain.name} is impassable.`;
    if (rule.abilities.includes('wheeled') && terrain.impassableToWheeled && !(state.map.improvements[tile]! & IMP_ROAD))
      return `Wheeled units need a road to enter ${terrain.name}.`;
  } else if (rule.domain === 'sea') {
    if (!terrain.water) return 'Ships cannot enter land (ports arrive with cities).';
    if (rule.abilities.includes('sinksInSea') && terrain.id !== 'coast') return `${rule.name} must stay in coastal waters.`;
    if (rule.abilities.includes('sinksInOcean') && terrain.id === 'ocean') return `${rule.name} cannot enter the ocean.`;
  } else {
    return 'Aircraft fly missions instead of moving (Phase 3).';
  }
  return null;
}

/** Cost of one step, ignoring how many moves the unit has left. */
export function stepCost(rules: Rules, state: GameState, u: Unit, from: number, to: number): MoveCheck {
  const dir = directionTo(state.map, from, to);
  if (dir < 0) return fail('notAdjacent', 'Units move one tile at a time to an adjacent tile.');
  const blocked = canStandOn(rules, state, u, to);
  if (blocked) return fail('cannotEnter', blocked);
  for (const owner of tileOwners(state).get(to) ?? []) {
    if (owner === u.owner) continue;
    if (atWar(state, u.owner, owner)) return fail('notImplemented', 'Attacking arrives with combat in Phase 3.');
    return fail('cannotEnter', `Another civilization's unit holds that tile.`);
  }
  const rule = rules.unit(u.type);
  const scale = rules.moveScale;
  if (rule.domain === 'sea') return { ok: true, cost: scale, explain: 'Open water: 1' };
  const imp = state.map.improvements;
  const owner = state.players[u.owner]!;
  const river = crossesRiver(state, from, dir);
  const bridged = !river || hasTechFlag(rules, owner, 'enablesBridges');
  if (imp[from]! & imp[to]! & IMP_RAIL && bridged) return { ok: true, cost: 0, explain: 'Railroad: free' };
  if (imp[from]! & imp[to]! & IMP_ROAD && bridged) return { ok: true, cost: 1, explain: 'Road: 1/3' };
  if (rule.abilities.includes('allTerrainAsRoads')) return { ok: true, cost: 1, explain: `${rule.name} treats all terrain as road: 1/3` };
  const terrain = rules.terrains[state.map.terrain[to]!]!;
  if (rule.ignoresTerrainCost.includes(terrain.id)) return { ok: true, cost: scale, explain: `${rule.name} ignores ${terrain.name}: 1` };
  const roadNote = imp[from]! & imp[to]! & IMP_ROAD ? ' (road does not bridge the river yet)' : '';
  return { ok: true, cost: terrain.movementCost * scale, explain: `${terrain.name}: ${terrain.movementCost}${roadNote}` };
}

/**
 * Full check for moving now. A unit with any movement left may always make a step;
 * if the step costs more than it has, the move uses up the rest (docs/rules/movement.md).
 */
export function checkMove(rules: Rules, state: GameState, u: Unit, to: number): MoveCheck {
  const step = stepCost(rules, state, u, u.tile, to);
  if (!step.ok) return step;
  if (u.movesLeft <= 0) return fail('noMovesLeft', 'This unit has no movement left this turn.');
  return step;
}

/**
 * Enemy units whose zone of control the move passes through: units with the ZOC ability
 * (or standing in a fortress) adjacent to both the start and the end tile, owned by a
 * civilization at war with the mover. The free attack itself arrives with combat (Phase 3).
 */
export function zocUnits(rules: Rules, state: GameState, u: Unit, from: number, to: number, fortressBit: number): number[] {
  if (rules.unit(u.type).domain !== 'land') return [];
  const g = state.map;
  const near = (a: number, b: number) => {
    let dx = Math.abs(tileX(g, a) - tileX(g, b));
    if (g.wrapX) dx = Math.min(dx, g.width - dx);
    const dy = Math.abs(tileY(g, a) - tileY(g, b));
    return dx + dy > 0 && dx + dy <= 2;
  };
  const out: number[] = [];
  for (const other of Object.values(state.units)) {
    if (!atWar(state, u.owner, other.owner)) continue;
    const r = rules.unit(other.type);
    if (r.domain !== 'land') continue;
    const exerts = r.zoneOfControl || (r.attack > 0 && (state.map.improvements[other.tile]! & fortressBit) !== 0);
    if (exerts && near(other.tile, from) && near(other.tile, to)) out.push(other.id);
  }
  return out.sort((a, b) => a - b);
}
