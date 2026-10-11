/**
 * Movement rules (docs/rules/movement.md). Costs are in thirds of a movement point
 * (`rules.moveScale`): a road step costs 1, flat terrain 3, hills 6.
 */
import { safeSeaTravel } from './civs.ts';
import type { CommandError } from './commands.ts';
import { directionTo, tileX, tileY } from './grid.ts';
import { atWar, crossesRiver, hasTechFlag, tileOwners } from './queries.ts';
import type { Rules } from './rules.ts';
import { IMP_RAIL, IMP_ROAD, type GameState, type Unit } from './state.ts';
import { cityAt } from './territory.ts';
import { isArmy, transportFor } from './units.ts';

export type MoveCheck =
  | { ok: true; cost: number; explain: string }
  | { ok: false; error: CommandError };

const fail = (code: CommandError['code'], message: string): MoveCheck => ({ ok: false, error: { code, message } });

/**
 * Can this unit stand on `tile` (ignoring other units)? Land units at sea and aircraft
 * on carriers count as standing on their transport's tile when `carried` is set.
 */
export function canStandOn(rules: Rules, state: GameState, u: Unit, tile: number, carried = u.carriedBy !== null && state.units[u.carriedBy]?.tile === tile): string | null {
  const rule = rules.unit(u.type);
  const terrain = rules.terrains[state.map.terrain[tile]!]!;
  const city = cityAt(state, tile);
  if (rule.domain === 'land') {
    if (terrain.water) return carried ? null : 'Land units cannot enter water without a transport.';
    if (terrain.impassable) return `${terrain.name} is impassable.`;
    if (rule.abilities.includes('wheeled') && terrain.impassableToWheeled && !(state.map.improvements[tile]! & IMP_ROAD))
      return `Wheeled units need a road to enter ${terrain.name}.`;
  } else if (rule.domain === 'sea') {
    if (!terrain.water) return city && city.owner === u.owner ? null : 'Ships can only enter your own coastal cities on land.';
    if (rule.abilities.includes('sinksInSea') && terrain.id !== 'coast' && (terrain.id === 'ocean' || !safeSeaTravel(rules, state, u.owner)))
      return `${rule.name} must stay in coastal waters.`;
    if (rule.abilities.includes('sinksInOcean') && terrain.id === 'ocean') return `${rule.name} cannot enter the ocean.`;
  } else {
    if (carried) return null;
    if (city && city.owner === u.owner) return null;
    return 'Aircraft are based in your cities or on carriers.';
  }
  return null;
}

const BLOCK_NOT_ADJACENT = -1;
const BLOCK_AIR = -2;
const BLOCK_IMMOBILE = -3;
const BLOCK_TERRAIN = -4;
const BLOCK_ENEMY = -5;
const BLOCK_FOREIGN_UNIT = -6;
const BLOCK_CITY = -7;

/**
 * The cost of one step in movement thirds, or a negative block code. The hot path of
 * path finding: no strings, no allocation.
 */
export function stepValue(rules: Rules, state: GameState, u: Unit, from: number, to: number): number {
  const dir = directionTo(state.map, from, to);
  if (dir < 0) return BLOCK_NOT_ADJACENT;
  const rule = rules.unit(u.type);
  if (rule.domain === 'air') return BLOCK_AIR;
  if (rule.abilities.includes('immobile')) return BLOCK_IMMOBILE;
  if (canStandOn(rules, state, u, to, false) !== null) return BLOCK_TERRAIN;
  const owners = tileOwners(state).get(to);
  if (owners) {
    for (const owner of owners) {
      if (owner === u.owner) continue;
      return atWar(state, u.owner, owner) ? BLOCK_ENEMY : BLOCK_FOREIGN_UNIT;
    }
  }
  const city = cityAt(state, to);
  if (city && city.owner !== u.owner) return BLOCK_CITY;
  const scale = rules.moveScale;
  if (rule.domain === 'sea') return scale;
  const imp = state.map.improvements;
  const river = crossesRiver(state, from, dir);
  const bridged = !river || hasTechFlag(rules, state.players[u.owner]!, 'enablesBridges');
  if (imp[from]! & imp[to]! & IMP_RAIL && bridged) return 0;
  if (imp[from]! & imp[to]! & IMP_ROAD && bridged) return 1;
  if (rule.abilities.includes('allTerrainAsRoads')) return 1;
  const terrain = rules.terrains[state.map.terrain[to]!]!;
  if (rule.ignoresTerrainCost.includes(terrain.id)) return scale;
  return terrain.movementCost * scale;
}

/** Cost of one step, ignoring how many moves the unit has left, with the reason for the UI. */
export function stepCost(rules: Rules, state: GameState, u: Unit, from: number, to: number): MoveCheck {
  const cost = stepValue(rules, state, u, from, to);
  const rule = rules.unit(u.type);
  switch (cost) {
    case BLOCK_NOT_ADJACENT:
      return fail('notAdjacent', 'Units move one tile at a time to an adjacent tile.');
    case BLOCK_AIR:
      return fail('cannotEnter', 'Aircraft fly missions; rebase them to move.');
    case BLOCK_IMMOBILE:
      return fail('cannotEnter', `${rule.name} cannot move by itself.`);
    case BLOCK_TERRAIN:
      return fail('cannotEnter', canStandOn(rules, state, u, to, false) ?? 'Cannot enter.');
    case BLOCK_ENEMY:
      return fail('cannotEnter', 'Enemy units hold that tile; move onto it to attack.');
    case BLOCK_FOREIGN_UNIT:
      return fail('cannotEnter', `Another civilization's unit holds that tile.`);
    case BLOCK_CITY:
      return fail('cannotEnter', `${cityAt(state, to)!.name} belongs to another civilization.`);
  }
  if (rule.domain === 'sea') return { ok: true, cost, explain: 'Open water: 1' };
  const imp = state.map.improvements;
  const terrain = rules.terrains[state.map.terrain[to]!]!;
  const road = (imp[from]! & imp[to]! & IMP_ROAD) !== 0;
  let explain: string;
  if (cost === 0) explain = 'Railroad: free';
  else if (cost === 1 && road) explain = 'Road: 1/3';
  else if (cost === 1) explain = `${rule.name} treats all terrain as road: 1/3`;
  else if (rule.ignoresTerrainCost.includes(terrain.id)) explain = `${rule.name} ignores ${terrain.name}: 1`;
  else explain = `${terrain.name}: ${terrain.movementCost}${road ? ' (road does not bridge the river yet)' : ''}`;
  return { ok: true, cost, explain };
}

/**
 * Full check for moving now. A unit with any movement left may always make a step;
 * if the step costs more than it has, the move uses up the rest (docs/rules/movement.md).
 */
export function checkMove(rules: Rules, state: GameState, u: Unit, to: number): MoveCheck {
  if (u.carriedBy !== null && state.units[u.carriedBy] && isArmy(rules, state.units[u.carriedBy]!))
    return fail('invalid', 'This unit fights inside an army and moves with it.');
  const ship = boardingTransport(rules, state, u, to);
  if (ship) {
    if (u.movesLeft <= 0) return fail('noMovesLeft', 'This unit has no movement left this turn.');
    return { ok: true, cost: rules.moveScale, explain: `Boards the ${rules.unit(ship.type).name}: 1` };
  }
  const step = stepCost(rules, state, u, u.tile, to);
  if (!step.ok) return step;
  if (u.movesLeft <= 0) return fail('noMovesLeft', 'This unit has no movement left this turn.');
  return step;
}

/** The transport a land unit would board by stepping onto `to` (an adjacent water tile), if any. */
export function boardingTransport(rules: Rules, state: GameState, u: Unit, to: number): Unit | undefined {
  const rule = rules.unit(u.type);
  if (rule.domain !== 'land' || rule.abilities.includes('immobile')) return undefined;
  if (!rules.terrains[state.map.terrain[to]!]!.water) return undefined;
  if (directionTo(state.map, u.tile, to) < 0) return undefined;
  return transportFor(rules, state, u, to);
}

/**
 * Enemy units whose zone of control the move passes through: units with the ZOC ability
 * (or standing in a fortress) adjacent to both the start and the end tile, owned by a
 * civilization at war with the mover. Each gets a free shot at the mover (docs/rules/combat.md).
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
    if (other.carriedBy !== null || !atWar(state, u.owner, other.owner)) continue;
    const r = rules.unit(other.type);
    if (r.domain !== 'land') continue;
    const exerts = r.zoneOfControl || (r.attack > 0 && (state.map.improvements[other.tile]! & fortressBit) !== 0);
    if (exerts && near(other.tile, from) && near(other.tile, to)) out.push(other.id);
  }
  return out.sort((a, b) => a - b);
}
