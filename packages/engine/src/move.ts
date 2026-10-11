/**
 * Carrying out a move once it has been checked: boarding and leaving transports,
 * cargo travelling along, zone-of-control shots, sight, tribal villages and barbarian
 * camps (docs/rules/movement.md, combat.md, naval.md, barbarians.md).
 */
import { attackStrength, defenceStrength } from './combat.ts';
import { learn } from './cities.ts';
import type { HutOutcome } from './commands.ts';
import { tilesInRadius } from './grid.ts';
import { checkMove, zocUnits } from './movement.ts';
import { findPath } from './pathfind.ts';
import { invalidateTileOwners } from './queries.ts';
import type { Rules } from './rules.ts';
import { researchBlocker } from './science.ts';
import { FLAG_CAMP, FLAG_HUT, IMP_FORTRESS, type Unit } from './state.ts';
import { cityAt } from './territory.ts';
import type { Tx } from './tx.ts';
import { carryAlong, cargoOf, isArmy, newUnit, transportFor } from './units.ts';
import { reveal, unitSight } from './vision.ts';
import { meetAround } from './diplomacy.ts';

/** Gold for destroying a barbarian camp (docs/rules/barbarians.md). */
export const CAMP_GOLD = 25;

/** Moves a unit one step (already checked) and runs everything a step triggers. */
export function moveUnitTo(rules: Rules, tx: Tx, unitId: number, to: number, cost: number): void {
  const before = tx.state.units[unitId]!;
  const from = before.tile;
  const rule = rules.unit(before.type);
  const zoc = zocUnits(rules, tx.state, before, from, to, IMP_FORTRESS);
  const water = rules.terrains[tx.state.map.terrain[to]!]!.water;
  let boarded: Unit | undefined;
  if (rule.domain === 'land' && water) boarded = transportFor(rules, tx.state, before, to);
  const u = tx.unit(unitId);
  u.tile = to;
  u.movesLeft = Math.max(0, u.movesLeft - cost);
  u.fortified = false;
  u.acted = true;
  u.carriedBy = boarded ? boarded.id : null;
  carryAlong(tx, unitId, to);
  invalidateTileOwners(tx.state);
  tx.emit({ type: 'unitMoved', unit: unitId, player: u.owner, from, to, cost });
  if (boarded) tx.emit({ type: 'unitBoarded', unit: unitId, transport: boarded.id, player: u.owner });
  if (zoc.length > 0) {
    tx.emit({ type: 'zoneOfControl', unit: unitId, player: u.owner, from, to, by: zoc });
    zocShots(rules, tx, unitId, zoc);
  }
  const sight = unitSight(rules, tx.state, u);
  reveal(tx, u.owner, sight);
  meetAround(tx, u.owner, sight);
  const flags = tx.state.map.flags[to]!;
  if (rule.domain === 'land' && !water) {
    if (flags & FLAG_HUT) enterHut(rules, tx, unitId, to);
    if (flags & FLAG_CAMP && !tx.state.players[u.owner]!.barbarian) destroyCamp(tx, to, u.owner);
  }
}

/**
 * Zone of control (docs/rules/combat.md): each enemy unit whose zone the move crosses
 * fires one round at the mover. A hit costs a hit point but never the last one.
 */
function zocShots(rules: Rules, tx: Tx, unitId: number, by: number[]): void {
  for (const id of by) {
    const u = tx.state.units[unitId];
    const z = tx.state.units[id];
    if (!u || !z) continue;
    const target = isArmy(rules, u) ? cargoOf(tx.state, u.id).sort((a, b) => b.hp - a.hp)[0] : u;
    if (!target) continue;
    const a = attackStrength(rules, tx.state, z, u.owner).value;
    const d = defenceStrength(rules, tx.state, target, u.tile, { kind: 'land', opponent: z.owner }, u.owner).value;
    if (a <= 0) continue;
    const hit = tx.random(a + d) < a && target.hp > 1;
    if (hit) tx.unit(target.id).hp = target.hp - 1;
    if (hit && target.id !== u.id) tx.unit(u.id).hp = u.hp - 1;
    tx.emit({ type: 'zoneOfControlAttack', unit: unitId, player: u.owner, by: id, byPlayer: z.owner, hit });
  }
}

export function destroyCamp(tx: Tx, tile: number, player: number): void {
  const flags = tx.mapArray('flags');
  flags[tile] = flags[tile]! & ~FLAG_CAMP;
  tx.player(player).gold = tx.state.players[player]!.gold + CAMP_GOLD;
  tx.emit({ type: 'campDestroyed', tile, player, gold: CAMP_GOLD });
}

/**
 * Tribal villages (docs/rules/turns.md): gold, a map, a free unit, a free advance,
 * hostile barbarians, or nothing.
 */
function enterHut(rules: Rules, tx: Tx, unitId: number, tile: number): void {
  const u = tx.state.units[unitId]!;
  const flags = tx.mapArray('flags');
  flags[tile] = flags[tile]! & ~FLAG_HUT;
  const roll = tx.random(100);
  const p = tx.state.players[u.owner]!;
  const barbarians = tx.state.players.find((x) => x.barbarian && x.alive);
  // A civilization with a single city meets no barbarians in villages: two warriors could end a game before it starts.
  const ownCities = Object.values(tx.state.cities).filter((c) => c.owner === u.owner).length;
  const nearOwnCity = Object.values(tx.state.cities).some((c) => c.owner === u.owner && tilesInRadius(tx.state.map, c.tile, 3).includes(tile));
  const techs = rules.set.techs.filter((t) => researchBlocker(rules, p, t.id) === null && t.prerequisites.length > 0).sort((a, b) => a.costFactor - b.costFactor || a.id.localeCompare(b.id));
  let outcome: HutOutcome;
  if (roll < 30) {
    const amount = 25 * (1 + tx.random(3));
    tx.player(u.owner).gold = p.gold + amount;
    outcome = { kind: 'gold', amount };
  } else if (roll < 45) {
    const tiles = reveal(tx, u.owner, tilesInRadius(tx.state.map, tile, 6), 'Map from a tribal village');
    outcome = { kind: 'map', tiles: tiles.length };
  } else if (roll < 62 && rules.hasUnit('warrior')) {
    const unit = tx.addUnit(newUnit(rules, u.owner, 'warrior', tile));
    tx.emit({ type: 'unitCreated', unit: unit.id, player: u.owner, unitType: 'warrior', tile });
    outcome = { kind: 'unit', unitType: 'warrior', unit: unit.id };
  } else if (roll < 77 && techs.length > 0) {
    const tech = techs[tx.random(Math.min(3, techs.length))]!.id;
    learn(rules, tx, u.owner, tech);
    outcome = { kind: 'tech', tech };
  } else if (roll < 90 && barbarians && !nearOwnCity && tx.state.turn > 5 && ownCities >= 2) {
    const count = 1 + tx.random(2);
    const spots = tilesInRadius(tx.state.map, tile, 1).filter((t) => t !== tile && canHostBarbarian(rules, tx, t));
    let made = 0;
    for (let i = 0; i < count && i < spots.length; i++) {
      const type = rules.set.general.basicBarbarian;
      const b = tx.addUnit(newUnit(rules, barbarians.id, type, spots[i]!));
      tx.emit({ type: 'unitCreated', unit: b.id, player: barbarians.id, unitType: type, tile: spots[i]! });
      made++;
    }
    outcome = made > 0 ? { kind: 'barbarians', units: made } : { kind: 'empty' };
  } else {
    outcome = { kind: 'empty' };
  }
  tx.emit({ type: 'hutEntered', unit: unitId, player: u.owner, tile, outcome });
}

/** Free land tile where a barbarian may appear. */
export function canHostBarbarian(rules: Rules, tx: Tx, t: number): boolean {
  const terrain = rules.terrains[tx.state.map.terrain[t]!]!;
  if (terrain.water || terrain.impassable) return false;
  if (cityAt(tx.state, t)) return false;
  return !Object.values(tx.state.units).some((x) => x.tile === t);
}

/**
 * Moves a unit along its goto order as far as its movement allows. The planned route is
 * kept on the order between turns and only planned again when its next step is refused,
 * so a long march costs one path search instead of one a turn.
 */
export function continueGoto(rules: Rules, tx: Tx, unitId: number): void {
  const planned = tx.state.units[unitId]?.order;
  let route: number[] = planned?.type === 'goto' ? (planned.route ?? []) : [];
  for (let guard = 0; guard < 1000; guard++) {
    const u = tx.state.units[unitId];
    if (!u || u.order?.type !== 'goto') return;
    const target = u.order.target;
    if (u.tile === target) {
      tx.unit(unitId).order = null;
      tx.emit({ type: 'gotoFinished', unit: unitId, player: u.owner, arrived: true });
      return;
    }
    if (u.movesLeft <= 0) {
      if (u.order.route !== route) tx.unit(unitId).order = { type: 'goto', target, route };
      return;
    }
    // Follow the planned route; plan (again) when there is none or the next step is refused.
    let next = route[0];
    let check = next === undefined ? null : checkMove(rules, tx.state, u, next);
    if (next === undefined || !check?.ok) {
      route = findPath(rules, tx.state, u, target)?.tiles ?? [];
      next = route[0];
      check = next === undefined ? null : checkMove(rules, tx.state, u, next);
    }
    if (next === undefined || !check?.ok) {
      tx.unit(unitId).order = null;
      tx.emit({ type: 'gotoFinished', unit: unitId, player: u.owner, arrived: false });
      return;
    }
    route = route.slice(1);
    moveUnitTo(rules, tx, unitId, next, check.cost);
  }
}

