/**
 * Unit helpers shared by movement, combat and the turn: hit points, cargo (transports,
 * carriers and armies), creating and removing units (docs/rules/combat.md,
 * docs/rules/naval.md, docs/rules/armies.md).
 */
import type { UnitRule } from '@civolution/data-schema';
import type { GameEvent } from './commands.ts';
import type { Rules } from './rules.ts';
import type { GameState, Unit } from './state.ts';
import type { Tx } from './tx.ts';

/** Hit points of a unit of this experience level at full health. */
export function levelHp(rules: Rules, type: string, experience: string): number {
  const level = rules.set.experienceLevels.find((l) => l.id === experience);
  return Math.max(1, (level?.hitPoints ?? 3) + rules.unit(type).hitPointBonus);
}

export function isArmy(rules: Rules, u: Unit): boolean {
  return rules.unit(u.type).abilities.includes('army');
}

/** Units directly held by `holder` (cargo or army members), by id. */
export function cargoOf(state: GameState, holder: number): Unit[] {
  const out: Unit[] = [];
  for (const u of Object.values(state.units)) if (u.carriedBy === holder) out.push(u);
  return out.sort((a, b) => a.id - b.id);
}

/** Full health: the level's hit points, or for an army the sum of its members'. */
export function maxHp(rules: Rules, state: GameState, u: Unit): number {
  if (isArmy(rules, u)) return cargoOf(state, u.id).reduce((a, m) => a + levelHp(rules, m.type, m.experience), 0);
  return levelHp(rules, u.type, u.experience);
}

/** Current hit points; an army's is the sum of its members'. */
export function currentHp(rules: Rules, state: GameState, u: Unit): number {
  if (isArmy(rules, u)) return cargoOf(state, u.id).reduce((a, m) => a + m.hp, 0);
  return u.hp;
}

/** How many units of what kind `holder` can carry. */
export function cargoSpace(rules: Rules, state: GameState, holder: Unit): number {
  const rule = rules.unit(holder.type);
  if (rule.abilities.includes('army')) return rule.capacity + (largerArmies(rules, state, holder.owner) ? 1 : 0);
  return rule.capacity;
}

function largerArmies(rules: Rules, state: GameState, player: number): boolean {
  for (const c of Object.values(state.cities)) {
    if (c.owner !== player) continue;
    for (const b of Object.keys(c.buildings)) if (rules.building(b).effects.includes('buildLargerArmies')) return true;
  }
  return false;
}

/** Whether a holder of this rule can take a unit of that rule aboard (armies use joinArmy instead). */
export function canCarry(holder: UnitRule, cargo: UnitRule): boolean {
  if (holder.capacity <= 0 || holder.abilities.includes('army')) return false;
  if (holder.abilities.includes('aircraftCarrier')) return cargo.domain === 'air';
  if (holder.abilities.includes('canCarryTacticalMissiles'))
    return cargo.abilities.includes('tacticalMissile') || cargo.abilities.includes('cruiseMissile');
  if (holder.abilities.includes('carriesFootUnitsOnly')) return cargo.domain === 'land' && cargo.abilities.includes('footSoldier');
  if (holder.domain === 'sea') return cargo.domain === 'land';
  return false;
}

/** A transport of `owner` on `tile` with room for `u`, or undefined. */
export function transportFor(rules: Rules, state: GameState, u: Unit, tile: number): Unit | undefined {
  const rule = rules.unit(u.type);
  const holders = Object.values(state.units)
    .filter((h) => h.tile === tile && h.owner === u.owner && h.id !== u.id && h.carriedBy === null && canCarry(rules.unit(h.type), rule))
    .sort((a, b) => a.id - b.id);
  return holders.find((h) => cargoOf(state, h.id).length < cargoSpace(rules, state, h));
}

/** Maximum movement in thirds; an army moves at its slowest member's pace. */
export function unitMaxMoves(rules: Rules, state: GameState, u: Unit): number {
  if (isArmy(rules, u)) {
    const members = cargoOf(state, u.id);
    if (members.length > 0) return Math.min(...members.map((m) => rules.unit(m.type).movement)) * rules.moveScale;
  }
  return rules.unit(u.type).movement * rules.moveScale;
}

export function newUnit(rules: Rules, owner: number, type: string, tile: number, experience = 'regular'): Omit<Unit, 'id'> {
  return {
    owner,
    type,
    tile,
    movesLeft: rules.unit(type).movement * rules.moveScale,
    experience,
    // An army's hit points are its members'; it starts empty.
    hp: rules.unit(type).abilities.includes('army') ? 0 : levelHp(rules, type, experience),
    fortified: false,
    acted: false,
    attacked: false,
    carriedBy: null,
    order: null,
    routine: null,
  };
}

/**
 * Removes a unit with everything it carries. Cargo of a ship in port and members of an
 * army standing on land are set down instead when `release` is true.
 */
export function removeUnitDeep(tx: Tx, id: number, release: boolean, why: Extract<GameEvent, { type: 'unitLost' }>['why']): void {
  const u = tx.state.units[id];
  if (!u) return;
  for (const c of cargoOf(tx.state, id)) {
    if (release) tx.unit(c.id).carriedBy = null;
    else removeUnitDeep(tx, c.id, false, why);
  }
  tx.removeUnit(id);
  tx.emit({ type: 'unitLost', unit: id, player: u.owner, unitType: u.type, tile: u.tile, why });
}

/** Moves a holder's cargo (recursively) to its tile. */
export function carryAlong(tx: Tx, holder: number, tile: number): void {
  for (const c of cargoOf(tx.state, holder)) {
    tx.unit(c.id).tile = tile;
    carryAlong(tx, c.id, tile);
  }
}
