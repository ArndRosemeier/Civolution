/**
 * War: attacking, capturing and razing, bombardment, air missions, nuclear strikes,
 * pillage, upgrades, transports, armies and great leaders, war and peace, healing and
 * war weariness (docs/rules/combat.md, bombard.md, air.md, naval.md, armies.md,
 * capture.md, war-weariness.md, nukes.md).
 */
import { cityReport } from './city.ts';
import { replaceCitizens, updateTerritory } from './cities.ts';
import {
  attackSide,
  battleOdds,
  defenceSide,
  defenceStrength,
  fight,
  isCombatant,
  pickDefender,
  type CombatKind,
  type Odds,
} from './combat.ts';
import type { BombardHit, Command, CommandError, UnitLossReason } from './commands.ts';
import { cityResources, empireInfo } from './empire.ts';
import { distance, neighbours, tilesInRadius } from './grid.ts';
import { canStandOn, checkMove } from './movement.ts';
import { moveUnitTo } from './move.ts';
import { nextCommonUpgrade } from './production.ts';
import { atWar, hasTechFlag } from './queries.ts';
import type { Rules } from './rules.ts';
import {
  FLAG_CAMP,
  IMP_BARRICADE,
  IMP_CRATER,
  IMP_FORTRESS,
  IMP_IRRIGATION,
  IMP_MINE,
  IMP_POLLUTION,
  IMP_RAIL,
  IMP_ROAD,
  type City,
  type GameState,
  type Unit,
} from './state.ts';
import { cityAt, playerCities } from './territory.ts';
import type { Tx } from './tx.ts';
import { cargoOf, cargoSpace, currentHp, isArmy, levelHp, newUnit, removeUnitDeep, transportFor, unitMaxMoves } from './units.ts';
import { reveal } from './vision.ts';

/** One in this many victories promotes the winner (docs/rules/combat.md). */
export const PROMOTION_ODDS = 8;
/** One in this many victories by an elite unit brings a great leader; halved by the Heroic Epic. */
export const LEADER_ODDS = 16;
/** One in this many victories by a unit that enslaves takes a captive. */
export const ENSLAVE_ODDS = 3;
/** Chance in percent that missile defence stops a nuclear strike. */
export const MISSILE_DEFENCE_PERCENT = 75;

const err = (code: CommandError['code'], message: string): CommandError => ({ code, message });

function name(state: GameState, p: number): string {
  return state.players[p]?.name ?? `player ${p}`;
}

function hasEffect(rules: Rules, state: GameState, player: number, effect: string): boolean {
  if (state.players[player]?.barbarian) return false;
  for (const w of empireInfo(rules, state, player).activeWonders) if (rules.building(w).effects.includes(effect)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// War weariness
// ---------------------------------------------------------------------------

/** Adds war weariness points for `player` against `enemy` (barbarian fights do not count). */
export function addWeariness(tx: Tx, player: number, enemy: number, points: number): void {
  const p = tx.state.players[player];
  const e = tx.state.players[enemy];
  if (!p || !e || p.barbarian || e.barbarian || points <= 0) return;
  const pl = tx.player(player);
  pl.weariness = { ...pl.weariness, [enemy]: (pl.weariness[enemy] ?? 0) + points };
}

/** Weariness fades by a tenth each turn and ends with peace (docs/rules/war-weariness.md). */
export function decayWeariness(tx: Tx): void {
  for (const p of tx.state.players) {
    const keys = Object.keys(p.weariness);
    if (keys.length === 0) continue;
    const next: Record<string, number> = {};
    for (const k of keys) {
      const v = p.weariness[k]!;
      if (!atWar(tx.state, p.id, Number(k))) continue;
      const left = v - Math.ceil(v / 10);
      if (left > 0) next[k] = left;
    }
    tx.player(p.id).weariness = next;
  }
}

/** Unhappy faces war weariness adds in a city (docs/rules/war-weariness.md). */
export function wearinessFaces(rules: Rules, state: GameState, city: City, have: Set<string>): number {
  const p = state.players[city.owner]!;
  const gov = rules.government(p.government);
  if (gov.warWeariness === 'none') return 0;
  const total = Object.values(p.weariness).reduce((a, x) => a + x, 0);
  let faces = Math.floor(total / (gov.warWeariness === 'high' ? 20 : 40));
  if ([...have].some((b) => rules.building(b).effects.includes('reducesWarWeariness'))) faces = Math.floor(faces / 2);
  if (hasEffect(rules, state, city.owner, 'reducesWarWearinessAll')) faces = Math.floor(faces / 2);
  return faces;
}

// ---------------------------------------------------------------------------
// Attacks and moving onto enemies
// ---------------------------------------------------------------------------

export interface AttackPreview {
  defender: Unit;
  kind: CombatKind;
  odds: Odds;
}

/** Why `u` cannot attack `tile` now, or null. */
export function attackBlocker(rules: Rules, state: GameState, u: Unit, tile: number): string | null {
  const rule = rules.unit(u.type);
  if (rule.domain === 'air') return 'Aircraft attack with bombing missions.';
  if (isArmy(rules, u) ? cargoOf(state, u.id).length === 0 : rule.attack <= 0) return `${rule.name} cannot attack.`;
  if (u.movesLeft <= 0) return 'No movement left this turn.';
  if (u.attacked && !rule.abilities.includes('blitz')) return 'This unit has already attacked this turn.';
  const water = rules.terrains[state.map.terrain[tile]!]!.water;
  if (rule.domain === 'land') {
    if (water) return 'Land units cannot attack at sea.';
    if (u.carriedBy !== null && !rule.abilities.includes('amphibious')) return 'Only amphibious units can attack straight from a ship.';
    const blocked = canStandOn(rules, state, u, tile, false);
    if (blocked) return blocked;
  } else if (!water) {
    return 'Ships attack ships; bombard targets on land.';
  }
  return null;
}

/** The defender `u` would meet attacking `tile`, and the odds; null when nothing there defends. */
export function previewAttack(rules: Rules, state: GameState, u: Unit, tile: number): AttackPreview | null {
  const kind: CombatKind = rules.unit(u.type).domain === 'sea' ? 'sea' : 'land';
  const defender = pickDefender(rules, state, u, tile, kind, u.tile);
  if (!defender) return null;
  const a = attackSide(rules, state, u, defender);
  const d = defenceSide(rules, state, defender, u, kind, u.tile);
  return { defender, kind, odds: battleOdds(a, d) };
}

/**
 * A move onto `to`: an attack when enemy units defend it, a capture when an enemy city
 * or enemy units there are undefended, otherwise an ordinary step.
 */
export function moveOrAttack(rules: Rules, tx: Tx, unitId: number, to: number, raze: boolean): CommandError | null {
  const state = tx.state;
  const u = state.units[unitId]!;
  const enemies = Object.values(state.units).filter((x) => x.tile === to && x.owner !== u.owner);
  const city = cityAt(state, to);
  const foreignCity = city && city.owner !== u.owner ? city : undefined;
  if (enemies.length === 0 && !foreignCity) {
    const check = checkMove(rules, state, u, to);
    if (!check.ok) return check.error;
    tx.unit(unitId).order = null;
    moveUnitTo(rules, tx, unitId, to, check.cost);
    return null;
  }
  const other = enemies[0]?.owner ?? foreignCity!.owner;
  if (!atWar(state, u.owner, other)) return err('notAtWar', `You are at peace with ${name(state, other)}; declare war first.`);
  if (distance(state.map, u.tile, to) !== 1) return err('notAdjacent', 'Units attack an adjacent tile.');
  const why = attackBlocker(rules, state, u, to);
  if (why) return err('invalid', why);
  const preview = previewAttack(rules, state, u, to);
  tx.unit(unitId).order = null;
  if (preview) {
    attack(rules, tx, unitId, preview.defender.id, preview.kind, raze);
    return null;
  }
  if (rules.unit(u.type).domain !== 'land') return err('invalid', 'Only land units capture.');
  enterUndefended(rules, tx, unitId, to, raze);
  return null;
}

function promote(rules: Rules, tx: Tx, unitId: number, vsBarbarians: boolean): void {
  const u = tx.state.units[unitId];
  if (!u || tx.state.players[u.owner]!.barbarian || isArmy(rules, u)) return;
  const levels = rules.set.experienceLevels;
  const i = levels.findIndex((l) => l.id === u.experience);
  if (i < 0 || i >= levels.length - 1) return;
  // Barbarians teach no more than veteran skills.
  if (vsBarbarians && i + 1 >= levels.length - 1) return;
  if (tx.random(PROMOTION_ODDS) !== 0) return;
  const next = levels[i + 1]!;
  const w = tx.unit(unitId);
  w.hp = u.hp + (levelHp(rules, u.type, next.id) - levelHp(rules, u.type, u.experience));
  w.experience = next.id;
  tx.emit({ type: 'unitPromoted', unit: unitId, player: u.owner, experience: next.id });
}

function maybeLeader(rules: Rules, tx: Tx, winner: Unit, wasElite: boolean, vsBarbarians: boolean): void {
  const leaderType = rules.set.general.leaderUnit;
  if (!wasElite || vsBarbarians || tx.state.players[winner.owner]!.barbarian) return;
  if (Object.values(tx.state.units).some((x) => x.owner === winner.owner && x.type === leaderType)) return;
  const odds = hasEffect(rules, tx.state, winner.owner, 'increasesLeaderChance') ? LEADER_ODDS / 2 : LEADER_ODDS;
  if (tx.random(odds) !== 0) return;
  const tile = tx.state.units[winner.id]?.tile ?? winner.tile;
  const leader = tx.addUnit({ ...newUnit(rules, winner.owner, leaderType, tile), movesLeft: 0 });
  tx.emit({ type: 'leaderBorn', unit: leader.id, player: winner.owner, tile });
}

/** Units with defensive bombard in the defending stack fire once at a land attacker. */
function defensiveBombard(rules: Rules, tx: Tx, attackerId: number, tile: number): void {
  const a = tx.state.units[attackerId]!;
  if (rules.unit(a.type).domain !== 'land') return;
  const shooters = Object.values(tx.state.units)
    .filter((x) => x.tile === tile && x.owner !== a.owner && x.carriedBy === null && !x.attacked && rules.unit(x.type).bombardStrength > 0 && rules.unit(x.type).domain === 'land')
    .sort((x, y) => x.id - y.id);
  for (const s of shooters) {
    const att = tx.state.units[attackerId]!;
    const target = isArmy(rules, att) ? cargoOf(tx.state, att.id).sort((x, y) => y.hp - x.hp)[0] : att;
    if (!target) return;
    const b = rules.unit(s.type).bombardStrength * 100;
    const d = Math.max(1, rules.unit(target.type).defence * 100);
    const hit = target.hp > 1 && tx.random(b + d) < b;
    if (hit) tx.unit(target.id).hp = target.hp - 1;
    tx.unit(s.id).attacked = true;
    tx.emit({ type: 'defensiveBombard', unit: s.id, player: s.owner, target: attackerId, targetPlayer: a.owner, hit });
  }
  syncArmyHp(rules, tx, attackerId);
}

/** Keeps an army's hit points equal to its members' total. */
function syncArmyHp(rules: Rules, tx: Tx, armyId: number): void {
  const army = tx.state.units[armyId];
  if (!army || !isArmy(rules, army)) return;
  const hp = currentHp(rules, tx.state, army);
  if (army.hp !== hp) tx.unit(armyId).hp = hp;
}

/** Applies a side's hit points after a battle; returns whether the side's unit survives. */
function applySide(rules: Rules, tx: Tx, unitId: number, members: number[], hp: number[], why: UnitLossReason): boolean {
  const u = tx.state.units[unitId]!;
  if (!isArmy(rules, u)) {
    if (hp[0]! <= 0) {
      removeUnitDeep(tx, unitId, false, why);
      return false;
    }
    if (u.hp !== hp[0]) tx.unit(unitId).hp = hp[0]!;
    return true;
  }
  members.forEach((m, i) => {
    if (!tx.state.units[m]) return;
    if (hp[i]! <= 0) removeUnitDeep(tx, m, false, why);
    else if (tx.state.units[m].hp !== hp[i]) tx.unit(m).hp = hp[i]!;
  });
  if (cargoOf(tx.state, unitId).length === 0) {
    removeUnitDeep(tx, unitId, false, why);
    return false;
  }
  syncArmyHp(rules, tx, unitId);
  return true;
}

/** One battle between `attackerId` and `defenderId`, with everything that follows. */
export function attack(rules: Rules, tx: Tx, attackerId: number, defenderId: number, kind: CombatKind, raze: boolean): void {
  const from = tx.state.units[attackerId]!.tile;
  const tile = tx.state.units[defenderId]!.tile;
  defensiveBombard(rules, tx, attackerId, tile);
  const a0 = tx.state.units[attackerId]!;
  const d0 = tx.state.units[defenderId]!;
  const aSide = attackSide(rules, tx.state, a0, d0);
  const dSide = defenceSide(rules, tx.state, d0, a0, kind, from);
  const odds = battleOdds(aSide, dSide);
  const result = fight(aSide, dSide, (n) => tx.random(n));
  const aElite = a0.experience === rules.set.experienceLevels.at(-1)?.id;
  const dElite = d0.experience === rules.set.experienceLevels.at(-1)?.id;
  const aBarb = tx.state.players[a0.owner]!.barbarian;
  const dBarb = tx.state.players[d0.owner]!.barbarian;
  {
    const a = tx.unit(attackerId);
    a.movesLeft = Math.max(0, a0.movesLeft - rules.moveScale);
    a.attacked = true;
    a.acted = true;
    a.fortified = false;
  }
  const attackerAlive = applySide(rules, tx, attackerId, aSide.members, result.attackerHp, 'combat');
  const defenderAlive = applySide(rules, tx, defenderId, dSide.members, result.defenderHp, 'combat');
  tx.emit({
    type: 'combat',
    attacker: attackerId,
    attackerPlayer: a0.owner,
    attackerType: a0.type,
    defender: defenderId,
    defenderPlayer: d0.owner,
    defenderType: d0.type,
    from,
    tile,
    result: result.result,
    rounds: result.rounds,
    attackerHp: attackerAlive ? currentHp(rules, tx.state, tx.state.units[attackerId]!) : 0,
    defenderHp: defenderAlive ? currentHp(rules, tx.state, tx.state.units[defenderId]!) : 0,
    odds: Math.round(odds.attackerWins * 1000) / 10,
  });
  addWeariness(tx, a0.owner, d0.owner, 1);
  addWeariness(tx, d0.owner, a0.owner, 1);
  if (!attackerAlive) addWeariness(tx, a0.owner, d0.owner, 3);
  if (!defenderAlive) addWeariness(tx, d0.owner, a0.owner, 3);

  if (result.result === 'attackerWon' && attackerAlive) {
    const winner = tx.state.units[attackerId]!;
    if (isArmy(rules, winner) && !tx.state.players[winner.owner]!.armyVictory) tx.player(winner.owner).armyVictory = true;
    promote(rules, tx, attackerId, dBarb);
    maybeLeader(rules, tx, winner, aElite, dBarb);
    const rule = rules.unit(winner.type);
    if (rule.specialActions.includes('enslave') && rule.enslavesTo && !aBarb && tx.random(ENSLAVE_ODDS) === 0) {
      const slave = tx.addUnit({ ...newUnit(rules, winner.owner, rule.enslavesTo, winner.tile), movesLeft: 0 });
      tx.emit({ type: 'unitCaptured', unit: slave.id, player: winner.owner, from: d0.owner, unitType: rule.enslavesTo, tile: winner.tile });
    }
    checkElimination(rules, tx, d0.owner, a0.owner);
    // The last defender fell: the attacker takes what is left.
    const after = tx.state.units[attackerId];
    if (after && kind === 'land' && !pickDefender(rules, tx.state, after, tile, kind, after.tile)) {
      const leftovers = Object.values(tx.state.units).some((x) => x.tile === tile && x.owner !== after.owner);
      const city = cityAt(tx.state, tile);
      if (leftovers || (city && city.owner !== after.owner) || tx.state.map.flags[tile]! & FLAG_CAMP) enterUndefended(rules, tx, attackerId, tile, raze);
    }
  } else if (result.result === 'defenderWon' && defenderAlive) {
    const winner = tx.state.units[defenderId]!;
    promote(rules, tx, defenderId, aBarb);
    maybeLeader(rules, tx, winner, dElite, aBarb);
    checkElimination(rules, tx, a0.owner, d0.owner);
  }
}

/** Kinds of unit a victor takes rather than destroys (docs/rules/capture.md). */
function capturable(rules: Rules, u: Unit): boolean {
  const r = rules.unit(u.type);
  if (r.domain !== 'land' || r.defence > 0 || r.abilities.includes('leader') || r.abilities.includes('king')) return false;
  return r.jobs.length > 0 || r.specialActions.includes('buildCity') || r.bombardStrength > 0;
}

/** Moves onto an undefended tile: captures or destroys what stands there, then takes the city. */
export function enterUndefended(rules: Rules, tx: Tx, unitId: number, tile: number, raze: boolean): void {
  const u = tx.state.units[unitId]!;
  const captor = tx.state.players[u.owner]!;
  const canCapture = rules.unit(u.type).specialActions.includes('capture') || isArmy(rules, u);
  const losers = new Set<number>();
  for (const x of Object.values(tx.state.units).filter((y) => y.tile === tile && y.owner !== u.owner && y.carriedBy === null).sort((a, b) => a.id - b.id)) {
    losers.add(x.owner);
    if (canCapture && !captor.barbarian && capturable(rules, x)) {
      const r = rules.unit(x.type);
      const type = r.specialActions.includes('buildCity') ? rules.set.general.slaveUnit : x.type;
      const c = tx.unit(x.id);
      c.owner = u.owner;
      c.type = type;
      c.hp = levelHp(rules, type, c.experience);
      c.movesLeft = 0;
      c.order = null;
      c.routine = null;
      c.fortified = false;
      tx.emit({ type: 'unitCaptured', unit: x.id, player: u.owner, from: x.owner, unitType: type, tile });
    } else {
      removeUnitDeep(tx, x.id, false, 'destroyed');
    }
  }
  const step = Math.min(u.movesLeft, rules.moveScale);
  moveUnitTo(rules, tx, unitId, tile, step);
  const city = cityAt(tx.state, tile);
  if (city && city.owner !== u.owner) {
    losers.add(city.owner);
    if (captor.barbarian) raidCity(rules, tx, city.id, unitId);
    else captureCity(rules, tx, city.id, u.owner, raze);
  }
  for (const p of [...losers].sort((a, b) => a - b)) checkElimination(rules, tx, p, u.owner);
}

/** Gold a captor takes: the city's share of its owner's population, times the treasury. */
function plunder(state: GameState, city: City): number {
  const pop = playerCities(state, city.owner).reduce((a, c) => a + c.size, 0);
  return Math.floor((state.players[city.owner]!.gold * city.size) / Math.max(1, pop));
}

/** Gives the palace to the owner's largest remaining city when the capital falls. */
function relocatePalace(rules: Rules, tx: Tx, player: number): void {
  if (!rules.hasBuilding('palace')) return;
  const cities = playerCities(tx.state, player);
  if (cities.length === 0 || cities.some((c) => 'palace' in c.buildings)) return;
  const next = [...cities].sort((a, b) => b.size - a.size || a.id - b.id)[0]!;
  tx.city(next.id).buildings.palace = tx.state.turn;
}

/** Captures (or razes) a city (docs/rules/capture.md). */
export function captureCity(rules: Rules, tx: Tx, cityId: number, captor: number, raze: boolean): void {
  const c0 = tx.state.cities[cityId]!;
  const loser = c0.owner;
  const gold = plunder(tx.state, c0);
  if (gold > 0) {
    tx.player(loser).gold = tx.state.players[loser]!.gold - gold;
    tx.player(captor).gold = tx.state.players[captor]!.gold + gold;
  }
  addWeariness(tx, loser, captor, 10);
  if (raze || c0.size <= 1) {
    destroyCity(rules, tx, cityId, captor);
    return;
  }
  const c = tx.city(cityId);
  c.owner = captor;
  c.size = c0.size - 1;
  c.food = 0;
  c.shields = 0;
  c.shieldsFor = null;
  c.build = null;
  c.queue = [];
  c.manualTiles = false;
  c.disorder = 0;
  c.celebrating = false;
  c.forcedLabor = [];
  c.hurried = false;
  c.wonderUnitTimer = 0;
  c.capturedOn = tx.state.turn;
  for (const b of Object.keys(c0.buildings).sort()) {
    const r = rules.building(b);
    if (r.kind === 'wonder') continue;
    const lost = b === 'palace' || r.kind === 'smallWonder' || tx.random(2) === 0;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by building id
    if (lost) delete c.buildings[b];
  }
  tx.emit({ type: 'cityCaptured', city: cityId, player: captor, from: loser, tile: c0.tile, name: c0.name, gold });
  relocatePalace(rules, tx, loser);
  // A civilization without a capital makes its first conquest the capital.
  if (rules.hasBuilding('palace') && !playerCities(tx.state, captor).some((x) => 'palace' in x.buildings)) tx.city(cityId).buildings.palace = tx.state.turn;
  updateTerritory(rules, tx);
  replaceCitizens(rules, tx, cityId);
  reveal(tx, captor, tilesInRadius(tx.state.map, c0.tile, 2));
}

/** Destroys a city; its wonders are lost for good. */
export function destroyCity(rules: Rules, tx: Tx, cityId: number, by: number): void {
  const c = tx.state.cities[cityId]!;
  for (const b of Object.keys(c.buildings)) if (tx.state.wonders[b] === cityId) tx.setWonder(b, -1);
  tx.removeCity(cityId);
  tx.emit({ type: 'cityDestroyed', city: cityId, player: c.owner, by, tile: c.tile, name: c.name });
  relocatePalace(rules, tx, c.owner);
  updateTerritory(rules, tx);
}

/** Barbarians entering an undefended city loot it and leave (docs/rules/barbarians.md). */
function raidCity(rules: Rules, tx: Tx, cityId: number, raider: number): void {
  const c = tx.state.cities[cityId]!;
  const owner = tx.state.players[c.owner]!;
  const gold = Math.min(owner.gold, 10 * c.size);
  tx.player(c.owner).gold = owner.gold - gold;
  removeUnitDeep(tx, raider, false, 'spent');
  if (c.size <= 1) {
    tx.emit({ type: 'cityRaided', city: cityId, player: c.owner, tile: c.tile, gold, size: 0 });
    destroyCity(rules, tx, cityId, tx.state.players.find((p) => p.barbarian)!.id);
    return;
  }
  tx.city(cityId).size = c.size - 1;
  replaceCitizens(rules, tx, cityId);
  tx.emit({ type: 'cityRaided', city: cityId, player: c.owner, tile: c.tile, gold, size: c.size - 1 });
}

/** A civilization with no cities and nothing to found one with is out of the game. */
export function checkElimination(rules: Rules, tx: Tx, player: number, by: number | null): void {
  const p = tx.state.players[player];
  if (!p?.alive || p.barbarian) return;
  if (playerCities(tx.state, player).length > 0) return;
  const units = Object.values(tx.state.units).filter((u) => u.owner === player);
  if (units.some((u) => rules.unit(u.type).specialActions.includes('buildCity'))) return;
  // Before the first city is founded a civilization is still alive with its settlers.
  for (const u of units.sort((a, b) => a.id - b.id)) if (tx.state.units[u.id]) removeUnitDeep(tx, u.id, false, 'eliminated');
  const pl = tx.player(player);
  pl.alive = false;
  pl.atWarWith = [];
  pl.weariness = {};
  tx.emit({ type: 'playerEliminated', player, by });
}

// ---------------------------------------------------------------------------
// Bombardment, air missions and nukes
// ---------------------------------------------------------------------------

/** Improvements a hit can destroy: ordinary buildings, not wonders or the palace. */
function destroyable(rules: Rules, c: City): string[] {
  return Object.keys(c.buildings)
    .filter((b) => rules.building(b).kind === 'improvement' && b !== 'palace')
    .sort();
}

/**
 * Bombardment (docs/rules/bombard.md): `rof` rounds of strength B against the target's
 * defence; each hit takes a hit point from a unit (never the last one unless the
 * bombard is lethal), a citizen, or a building.
 */
function bombardTile(rules: Rules, tx: Tx, shooter: Unit, strength: number, rof: number, tile: number, kind: CombatKind, buildingsOnly: boolean): BombardHit[] {
  const rule = rules.unit(shooter.type);
  const hits: BombardHit[] = [];
  const b = strength * 100;
  for (let r = 0; r < Math.max(1, rof); r++) {
    const targets = Object.values(tx.state.units)
      .filter((x) => x.tile === tile && x.owner !== shooter.owner && x.carriedBy === null && isCombatant(rules, tx.state, x) && !isArmy(rules, x))
      .sort((x, y) => x.id - y.id);
    const lethal = (x: Unit) => {
      const water = rules.terrains[tx.state.map.terrain[x.tile]!]!.water;
      return water ? rule.abilities.includes('lethalSeaBombard') : rule.abilities.includes('lethalLandBombard');
    };
    const hurtable = targets.filter((x) => x.hp > 1 || lethal(x));
    const city = cityAt(tx.state, tile);
    const options: ('unit' | 'population' | 'building')[] = [];
    if (!buildingsOnly && hurtable.length > 0) options.push('unit');
    if (city && city.owner !== shooter.owner) {
      if (!buildingsOnly && city.size > 1) options.push('population');
      if (destroyable(rules, city).length > 0) options.push('building');
    }
    if (options.length === 0) {
      hits.push({ kind: 'miss' });
      continue;
    }
    const pick = options[tx.random(options.length)]!;
    let d = 100;
    if (pick === 'unit' || targets.length > 0) {
      for (const t of targets) d = Math.max(d, defenceStrength(rules, tx.state, t, tile, { kind, opponent: shooter.owner }).value);
    }
    if (tx.random(b + d) >= b) {
      hits.push({ kind: 'miss' });
      continue;
    }
    if (pick === 'unit') {
      const t = hurtable.sort((x, y) => y.hp - x.hp || x.id - y.id)[0]!;
      if (t.hp <= 1) {
        removeUnitDeep(tx, t.id, false, 'bombard');
        hits.push({ kind: 'unit', unit: t.id, killed: true });
        addWeariness(tx, t.owner, shooter.owner, 3);
      } else {
        tx.unit(t.id).hp = t.hp - 1;
        hits.push({ kind: 'unit', unit: t.id, killed: false });
      }
    } else if (pick === 'population') {
      tx.city(city!.id).size = city!.size - 1;
      replaceCitizens(rules, tx, city!.id);
      hits.push({ kind: 'population', size: city!.size - 1 });
    } else {
      const list = destroyable(rules, city!);
      const lost = list[tx.random(list.length)]!;
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by building id
      delete tx.city(city!.id).buildings[lost];
      hits.push({ kind: 'building', building: lost });
    }
  }
  return hits;
}

/** Owner of what a strike on `tile` would hit (units first, then the city), or null. */
function targetOwner(state: GameState, shooter: Unit, tile: number): number | null {
  const unit = Object.values(state.units).find((x) => x.tile === tile && x.owner !== shooter.owner);
  if (unit) return unit.owner;
  const city = cityAt(state, tile);
  return city && city.owner !== shooter.owner ? city.owner : null;
}

function spend(rules: Rules, tx: Tx, unitId: number): void {
  const u = tx.unit(unitId);
  const rule = rules.unit(u.type);
  u.movesLeft = rule.abilities.includes('blitz') ? Math.max(0, u.movesLeft - rules.moveScale) : 0;
  u.attacked = true;
  u.acted = true;
  u.fortified = false;
}

function bombardCommand(rules: Rules, tx: Tx, cmd: Extract<Command, { type: 'bombard' }>): CommandError | null {
  const u = tx.state.units[cmd.unit]!;
  const rule = rules.unit(u.type);
  if (rule.domain === 'air') return err('invalid', 'Aircraft bomb with an air mission.');
  if (!rule.specialActions.includes('bombard') || rule.bombardStrength <= 0) return err('invalid', `${rule.name} cannot bombard.`);
  if (u.movesLeft <= 0) return err('noMovesLeft', 'No movement left this turn.');
  if (u.attacked && !rule.abilities.includes('blitz')) return err('invalid', 'This unit has already fired this turn.');
  const range = Math.max(1, rule.bombardRange);
  const dist = distance(tx.state.map, u.tile, cmd.target);
  if (dist < 1 || dist > range) return err('invalid', `Out of range (${range} tile${range === 1 ? '' : 's'}).`);
  const owner = targetOwner(tx.state, u, cmd.target);
  if (owner === null) return err('invalid', 'Nothing to bombard there.');
  if (!atWar(tx.state, u.owner, owner)) return err('notAtWar', `You are at peace with ${name(tx.state, owner)}.`);
  const kind: CombatKind = rules.terrains[tx.state.map.terrain[cmd.target]!]!.water ? 'sea' : 'bombard';
  const hits = bombardTile(rules, tx, u, rule.bombardStrength, rule.rateOfFire, cmd.target, kind, false);
  tx.emit({ type: 'bombarded', unit: u.id, player: u.owner, from: u.tile, tile: cmd.target, targetPlayer: owner, hits });
  if (rule.abilities.includes('cruiseMissile')) removeUnitDeep(tx, u.id, false, 'spent');
  else spend(rules, tx, u.id);
  checkElimination(rules, tx, owner, u.owner);
  return null;
}

/** An enemy interceptor rises against an air mission over `tile`; returns whether the mission goes on. */
function interception(rules: Rules, tx: Tx, planeId: number, tile: number): boolean {
  const plane = tx.state.units[planeId]!;
  const prule = rules.unit(plane.type);
  const fighters = Object.values(tx.state.units)
    .filter((x) => x.order?.type === 'intercept' && !x.attacked && atWar(tx.state, x.owner, plane.owner) && rules.unit(x.type).airMissions.includes('intercept'))
    .filter((x) => distance(tx.state.map, x.tile, tile) <= rules.unit(x.type).operationalRange)
    .sort((a, b) => rules.unit(b.type).attack - rules.unit(a.type).attack || a.id - b.id);
  const f = fighters[0];
  if (!f) return true;
  const g = rules.set.general;
  const chance = prule.abilities.includes('stealth') ? g.stealthInterceptChance : g.interceptChance;
  tx.unit(f.id).attacked = true;
  if (tx.random(100) >= chance) return true;
  const a = { unit: f.id, members: [f.id], strengths: [rules.unit(f.type).attack * 100], hp: [f.hp], retreat: 0 };
  const d = { unit: plane.id, members: [plane.id], strengths: [Math.max(1, prule.defence) * 100], hp: [plane.hp], retreat: 0 };
  const r = fight(a, d, (n) => tx.random(n));
  const fAlive = applySide(rules, tx, f.id, [f.id], r.attackerHp, 'shotDown');
  const pAlive = applySide(rules, tx, plane.id, [plane.id], r.defenderHp, 'shotDown');
  tx.emit({ type: 'intercepted', unit: planeId, player: plane.owner, by: f.id, byPlayer: f.owner, survived: pAlive });
  if (!fAlive) addWeariness(tx, f.owner, plane.owner, 3);
  if (!pAlive) addWeariness(tx, plane.owner, f.owner, 3);
  return pAlive;
}

/** Anti-air fire from the target tile: one shot from its best air defence (docs/rules/air.md). */
function airDefence(rules: Rules, tx: Tx, planeId: number, tile: number): boolean {
  const plane = tx.state.units[planeId]!;
  const guns = Object.values(tx.state.units)
    .filter((x) => x.tile === tile && x.owner !== plane.owner && rules.unit(x.type).airDefence > 0)
    .sort((a, b) => rules.unit(b.type).airDefence - rules.unit(a.type).airDefence || a.id - b.id);
  const gun = guns[0];
  if (!gun) return true;
  const a = rules.unit(gun.type).airDefence * 100;
  const d = Math.max(1, rules.unit(plane.type).defence) * 100;
  if (tx.random(a + d) >= a) return true;
  if (plane.hp > 1) {
    tx.unit(planeId).hp = plane.hp - 1;
    return true;
  }
  removeUnitDeep(tx, planeId, false, 'shotDown');
  tx.emit({ type: 'intercepted', unit: planeId, player: plane.owner, by: gun.id, byPlayer: gun.owner, survived: false });
  addWeariness(tx, plane.owner, gun.owner, 3);
  return false;
}

/** A carrier of the player's on `tile` with room for `u`, or a city of theirs there. */
function airBase(rules: Rules, state: GameState, u: Unit, tile: number): { carrier: Unit | null } | null {
  const city = cityAt(state, tile);
  if (city && city.owner === u.owner) return { carrier: null };
  const carrier = transportFor(rules, state, u, tile);
  return carrier ? { carrier } : null;
}

function airCommand(rules: Rules, tx: Tx, cmd: Extract<Command, { type: 'airMission' }>): CommandError | null {
  const u = tx.state.units[cmd.unit]!;
  const rule = rules.unit(u.type);
  if (rule.domain !== 'air' && !rule.airMissions.length) return err('invalid', `${rule.name} does not fly missions.`);
  if (!rule.airMissions.includes(cmd.mission)) return err('invalid', `${rule.name} cannot fly that mission.`);
  if (u.movesLeft <= 0 || u.attacked) return err('noMovesLeft', 'This aircraft has flown this turn.');
  const p = tx.state.players[u.owner]!;
  const range = rule.operationalRange;
  if (cmd.mission === 'intercept') {
    const w = tx.unit(u.id);
    w.order = { type: 'intercept' };
    w.movesLeft = 0;
    tx.emit({ type: 'orderChanged', unit: u.id, player: u.owner });
    return null;
  }
  if (cmd.target === undefined) return err('invalid', 'Pick a target tile.');
  const target = cmd.target;
  const dist = distance(tx.state.map, u.tile, target);
  if (cmd.mission === 'rebase') {
    if (dist > range * 2 || dist === 0) return err('invalid', `Rebasing reaches ${range * 2} tiles.`);
    const base = airBase(rules, tx.state, u, target);
    if (!base) return err('invalid', 'Rebase to one of your cities or a carrier with room.');
    const w = tx.unit(u.id);
    const from = u.tile;
    w.tile = target;
    w.carriedBy = base.carrier?.id ?? null;
    w.movesLeft = 0;
    w.order = null;
    w.acted = true;
    tx.emit({ type: 'airMission', unit: u.id, player: u.owner, mission: 'rebase', from, target });
    tx.emit({ type: 'unitMoved', unit: u.id, player: u.owner, from, to: target, cost: 0 });
    reveal(tx, u.owner, tilesInRadius(tx.state.map, target, 1));
    return null;
  }
  if (cmd.mission === 'recon') {
    if (dist > range * 2) return err('invalid', `Reconnaissance reaches ${range * 2} tiles.`);
    tx.emit({ type: 'airMission', unit: u.id, player: u.owner, mission: 'recon', from: u.tile, target });
    if (interception(rules, tx, u.id, target)) {
      reveal(tx, u.owner, tilesInRadius(tx.state.map, target, 2), 'Reconnaissance flight');
      spend(rules, tx, u.id);
    }
    return null;
  }
  // Bombing.
  if (dist < 1 || dist > range) return err('invalid', `Out of range (${range} tiles).`);
  if (cmd.mission === 'precisionBomb' && !hasTechFlag(rules, p, 'enablesPrecisionBombing')) return err('invalid', 'Precision bombing needs the right technology.');
  const owner = targetOwner(tx.state, u, target);
  if (owner === null) return err('invalid', 'Nothing to bomb there.');
  if (!atWar(tx.state, u.owner, owner)) return err('notAtWar', `You are at peace with ${name(tx.state, owner)}.`);
  tx.emit({ type: 'airMission', unit: u.id, player: u.owner, mission: cmd.mission, from: u.tile, target });
  if (!interception(rules, tx, u.id, target) || !airDefence(rules, tx, u.id, target)) {
    checkElimination(rules, tx, u.owner, owner);
    return null;
  }
  const plane = tx.state.units[u.id]!;
  const hits = bombardTile(rules, tx, plane, rule.bombardStrength, rule.rateOfFire, target, 'air', cmd.mission === 'precisionBomb');
  tx.emit({ type: 'bombarded', unit: u.id, player: u.owner, from: u.tile, tile: target, targetPlayer: owner, hits });
  spend(rules, tx, u.id);
  checkElimination(rules, tx, owner, u.owner);
  return null;
}

/** Whether nuclear weapons exist: someone has built the Manhattan Project. */
export function nukesEnabled(rules: Rules, state: GameState): boolean {
  return Object.entries(state.wonders).some(([w, c]) => c >= 0 && rules.building(w).effects.includes('allowsAllCivsNukes'));
}

function nukeCommand(rules: Rules, tx: Tx, cmd: Extract<Command, { type: 'nuke' }>): CommandError | null {
  const u = tx.state.units[cmd.unit]!;
  const rule = rules.unit(u.type);
  if (!rule.abilities.includes('nuclearWeapon')) return err('invalid', `${rule.name} is not a nuclear weapon.`);
  if (!nukesEnabled(rules, tx.state)) return err('invalid', 'Nuclear weapons need the Manhattan Project to be built somewhere.');
  if (u.movesLeft <= 0) return err('noMovesLeft', 'No movement left this turn.');
  const range = rule.abilities.includes('icbm') ? Infinity : Math.max(1, rule.bombardRange);
  const dist = distance(tx.state.map, u.tile, cmd.target);
  if (dist < 1 || dist > range) return err('invalid', `Out of range (${range} tiles).`);
  const owner = targetOwner(tx.state, u, cmd.target);
  if (owner === null) return err('invalid', 'Nothing to strike there.');
  if (!atWar(tx.state, u.owner, owner)) return err('notAtWar', `You are at peace with ${name(tx.state, owner)}.`);
  removeUnitDeep(tx, u.id, false, 'spent');
  const shielded = Object.values(tx.state.cities).some(
    (c) => c.owner !== u.owner && distance(tx.state.map, c.tile, cmd.target) <= 3 && hasEffect(rules, tx.state, c.owner, 'decreasesMissileSuccess'),
  );
  if (shielded && tx.random(100) < MISSILE_DEFENCE_PERCENT) {
    tx.emit({ type: 'nuclearStrike', unit: u.id, player: u.owner, tile: cmd.target, stopped: true });
    return null;
  }
  tx.emit({ type: 'nuclearStrike', unit: u.id, player: u.owner, tile: cmd.target, stopped: false });
  const area = [cmd.target, ...neighbours(tx.state.map, cmd.target)];
  const hitPlayers = new Set<number>();
  for (const x of Object.values(tx.state.units).filter((y) => area.includes(y.tile) && y.carriedBy === null).sort((a, b) => a.id - b.id)) {
    if (!tx.state.units[x.id]) continue;
    hitPlayers.add(x.owner);
    removeUnitDeep(tx, x.id, false, 'nuke');
  }
  for (const c of Object.values(tx.state.cities).filter((y) => area.includes(y.tile)).sort((a, b) => a.id - b.id)) {
    hitPlayers.add(c.owner);
    tx.city(c.id).size = Math.max(1, Math.floor(c.size / 2));
    replaceCitizens(rules, tx, c.id);
  }
  const imp = tx.mapArray('improvements');
  for (const t of area) if (!rules.terrains[tx.state.map.terrain[t]!]!.water) imp[t] = imp[t]! | (t === cmd.target && !cityAt(tx.state, t) ? IMP_CRATER : IMP_POLLUTION);
  for (const p of [...hitPlayers].sort((a, b) => a - b)) {
    if (p !== u.owner) addWeariness(tx, p, u.owner, 10);
    checkElimination(rules, tx, p, u.owner);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Other unit commands
// ---------------------------------------------------------------------------

const PILLAGE_ORDER: [number, string][] = [
  [IMP_MINE, 'mine'],
  [IMP_IRRIGATION, 'irrigation'],
  [IMP_RAIL, 'railroad'],
  [IMP_ROAD, 'road'],
  [IMP_FORTRESS, 'fortress'],
  [IMP_BARRICADE, 'barricade'],
];

function pillageCommand(rules: Rules, tx: Tx, u: Unit): CommandError | null {
  const rule = rules.unit(u.type);
  if (!rule.specialActions.includes('pillage')) return err('invalid', `${rule.name} cannot pillage.`);
  if (u.movesLeft <= 0) return err('noMovesLeft', 'No movement left this turn.');
  const owner = tx.state.map.territory[u.tile]!;
  if (owner >= 0 && owner !== u.owner && !atWar(tx.state, u.owner, owner)) return err('notAtWar', `You are at peace with ${name(tx.state, owner)}.`);
  const city = cityAt(tx.state, u.tile);
  const have = tx.state.map.improvements[u.tile]!;
  const hit = PILLAGE_ORDER.find(([bit]) => have & bit && !(city && (bit === IMP_ROAD || bit === IMP_RAIL)));
  if (!hit) return err('invalid', 'Nothing to pillage here.');
  const imp = tx.mapArray('improvements');
  imp[u.tile] = have & ~hit[0];
  spend(rules, tx, u.id);
  tx.emit({ type: 'tilePillaged', tile: u.tile, player: u.owner, removed: hit[1] });
  return null;
}

/** The unit `u` would upgrade to in its city now, with the gold it costs, or a reason it cannot. */
export function upgradeQuote(rules: Rules, state: GameState, u: Unit): { to: string; gold: number } | { reason: string } {
  const rule = rules.unit(u.type);
  const city = cityAt(state, u.tile);
  if (!city || city.owner !== u.owner) return { reason: 'Units upgrade in your cities.' };
  if (!rule.upgradeTo) return { reason: `${rule.name} has no upgrade.` };
  const p = state.players[u.owner]!;
  const resources = cityResources(empireInfo(rules, state, u.owner), city);
  const ready = (id: string) => {
    const r = rules.unit(id);
    return (!r.requiredTech || p.techs.includes(r.requiredTech)) && r.requiredResources.every((x) => resources.has(x));
  };
  let to: string | null = null;
  const first = nextCommonUpgrade(rules, u.type);
  if (!first) return { reason: `${rule.name} has no upgrade.` };
  for (let next: string | undefined = first, guard = 0; next && guard < 20; next = nextCommonUpgrade(rules, next), guard++) {
    if (!ready(next)) break;
    to = next;
  }
  if (!to) return { reason: `${rules.unit(first).name} is not available yet.` };
  let gold = Math.max(0, rules.unit(to).shieldCost - rule.shieldCost) * rules.set.general.upgradeCostPerShield;
  if (hasEffect(rules, state, u.owner, 'halvesUpgradeCost')) gold = Math.floor(gold / 2);
  return { to, gold };
}

function upgradeCommand(rules: Rules, tx: Tx, u: Unit): CommandError | null {
  if (isArmy(rules, u)) return err('invalid', 'Armies do not upgrade.');
  if (u.movesLeft <= 0) return err('noMovesLeft', 'No movement left this turn.');
  const q = upgradeQuote(rules, tx.state, u);
  if ('reason' in q) return err('invalid', q.reason);
  const p = tx.state.players[u.owner]!;
  if (p.gold < q.gold) return err('invalid', `Needs ${q.gold} gold; the treasury has ${p.gold}.`);
  tx.player(u.owner).gold = p.gold - q.gold;
  const w = tx.unit(u.id);
  const from = u.type;
  w.type = q.to;
  w.hp = Math.min(levelHp(rules, q.to, u.experience), u.hp + (levelHp(rules, q.to, u.experience) - levelHp(rules, from, u.experience)));
  w.movesLeft = 0;
  w.acted = true;
  tx.emit({ type: 'unitUpgraded', unit: u.id, player: u.owner, from, to: q.to, gold: q.gold });
  return null;
}

/** How many armies a civilization may have (docs/rules/armies.md). */
export function armyLimit(rules: Rules, state: GameState, player: number): number {
  return Math.max(1, Math.floor(playerCities(state, player).length / rules.set.general.citiesPerArmy));
}

export function armyCount(rules: Rules, state: GameState, player: number): number {
  return Object.values(state.units).filter((u) => u.owner === player && isArmy(rules, u)).length;
}

function buildArmyCommand(rules: Rules, tx: Tx, u: Unit): CommandError | null {
  const rule = rules.unit(u.type);
  if (!rule.specialActions.includes('buildArmy')) return err('invalid', `${rule.name} cannot form an army.`);
  const city = cityAt(tx.state, u.tile);
  if (!city || city.owner !== u.owner) return err('invalid', 'Leaders form armies in your cities.');
  if (armyCount(rules, tx.state, u.owner) >= armyLimit(rules, tx.state, u.owner))
    return err('invalid', `You may field ${armyLimit(rules, tx.state, u.owner)} arm${armyLimit(rules, tx.state, u.owner) === 1 ? 'y' : 'ies'} (one per ${rules.set.general.citiesPerArmy} cities).`);
  removeUnitDeep(tx, u.id, false, 'formedArmy');
  const army = tx.addUnit({ ...newUnit(rules, u.owner, rules.set.general.armyUnit, u.tile), hp: 0, movesLeft: 0 });
  tx.emit({ type: 'armyFormed', unit: army.id, player: u.owner, tile: u.tile });
  tx.emit({ type: 'unitCreated', unit: army.id, player: u.owner, unitType: army.type, tile: u.tile });
  return null;
}

function joinArmyCommand(rules: Rules, tx: Tx, u: Unit, armyId: number): CommandError | null {
  const army = tx.state.units[armyId];
  if (!army || army.owner !== u.owner || !isArmy(rules, army)) return err('invalid', 'Pick one of your armies.');
  if (army.tile !== u.tile) return err('invalid', 'The unit must stand with the army.');
  const rule = rules.unit(u.type);
  if (rule.domain !== 'land' || isArmy(rules, u) || rule.abilities.includes('leader') || rule.abilities.includes('king') || !isCombatant(rules, tx.state, u) || rule.attack <= 0)
    return err('invalid', `${rule.name} cannot join an army.`);
  if (u.carriedBy !== null) return err('invalid', 'Unload the unit first.');
  if (cargoOf(tx.state, armyId).length >= cargoSpace(rules, tx.state, army)) return err('invalid', 'The army is full.');
  const w = tx.unit(u.id);
  w.carriedBy = armyId;
  w.fortified = false;
  w.order = null;
  w.routine = null;
  syncArmyHp(rules, tx, armyId);
  const a = tx.unit(armyId);
  a.movesLeft = Math.min(army.movesLeft, u.movesLeft, unitMaxMoves(rules, tx.state, a));
  tx.emit({ type: 'unitJoinedArmy', unit: u.id, army: armyId, player: u.owner });
  return null;
}

function leaderHurryCommand(rules: Rules, tx: Tx, u: Unit): CommandError | null {
  const rule = rules.unit(u.type);
  if (!rule.specialActions.includes('finishImprovements')) return err('invalid', `${rule.name} cannot hurry production.`);
  const city = cityAt(tx.state, u.tile);
  if (!city || city.owner !== u.owner) return err('invalid', 'Leaders hurry production in your cities.');
  if (city.build?.kind !== 'building' || rules.building(city.build.id).kind === 'wealth') return err('invalid', 'The city must be building an improvement or wonder.');
  if (cityReport(rules, tx.state, city).disorder) return err('invalid', 'Not while the city is in disorder.');
  const cost = rules.building(city.build.id).cost;
  removeUnitDeep(tx, u.id, false, 'spent');
  const c = tx.city(city.id);
  c.shields = Math.max(c.shields, cost);
  c.shieldsFor = rules.building(city.build.id).kind === 'improvement' ? 'improvement' : 'wonder';
  c.hurried = true;
  tx.emit({ type: 'cityHurried', city: city.id, player: u.owner, tile: city.tile, gold: 0, citizens: 0 });
  return null;
}

function loadCommand(rules: Rules, tx: Tx, u: Unit): CommandError | null {
  if (u.carriedBy !== null) return err('invalid', 'Already aboard.');
  const ship = transportFor(rules, tx.state, u, u.tile);
  if (!ship) return err('invalid', 'No transport with room here.');
  const w = tx.unit(u.id);
  w.carriedBy = ship.id;
  w.order = { type: 'sentry' };
  w.fortified = false;
  tx.emit({ type: 'unitBoarded', unit: u.id, transport: ship.id, player: u.owner });
  return null;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Handles the war commands; returns an error, or null after applying. */
export function applyWarCommand(rules: Rules, tx: Tx, cmd: Command): CommandError | null {
  const state = tx.state;
  if (cmd.type === 'razeCity') {
    const c = state.cities[cmd.city];
    if (!c || c.owner !== cmd.player) return err('notYourCity', 'Pick one of your cities.');
    if (c.capturedOn !== state.turn) return err('invalid', 'Only a city taken this turn can be razed.');
    destroyCity(rules, tx, c.id, cmd.player);
    return null;
  }
  if (cmd.type === 'declareWar' || cmd.type === 'makePeace') {
    const t = state.players[cmd.target];
    if (!t?.alive || cmd.target === cmd.player) return err('invalid', 'Pick another living civilization.');
    if (t.barbarian) return err('invalid', 'There is no treaty with the barbarians.');
    const at = state.players[cmd.player]!.atWarWith.includes(cmd.target);
    if (cmd.type === 'declareWar') {
      if (at) return err('invalid', `Already at war with ${t.name}.`);
      tx.player(cmd.player).atWarWith = [...state.players[cmd.player]!.atWarWith, cmd.target].sort((a, b) => a - b);
      tx.player(cmd.target).atWarWith = [...t.atWarWith, cmd.player].sort((a, b) => a - b);
      tx.emit({ type: 'warDeclared', player: cmd.player, target: cmd.target });
    } else {
      if (!at) return err('invalid', `Not at war with ${t.name}.`);
      tx.player(cmd.player).atWarWith = state.players[cmd.player]!.atWarWith.filter((x) => x !== cmd.target);
      tx.player(cmd.target).atWarWith = t.atWarWith.filter((x) => x !== cmd.player);
      const a = tx.player(cmd.player);
      a.weariness = Object.fromEntries(Object.entries(a.weariness).filter(([k]) => Number(k) !== cmd.target));
      const b = tx.player(cmd.target);
      b.weariness = Object.fromEntries(Object.entries(b.weariness).filter(([k]) => Number(k) !== cmd.player));
      tx.emit({ type: 'peaceMade', player: cmd.player, target: cmd.target });
    }
    return null;
  }
  if (!('unit' in cmd)) return err('invalid', `Not a war command: ${cmd.type}.`);
  const u = state.units[cmd.unit]!;
  if (u.carriedBy !== null && state.units[u.carriedBy] && isArmy(rules, state.units[u.carriedBy]!))
    return err('invalid', 'This unit fights inside an army.');
  switch (cmd.type) {
    case 'bombard':
      return bombardCommand(rules, tx, cmd);
    case 'airMission':
      return airCommand(rules, tx, cmd);
    case 'nuke':
      return nukeCommand(rules, tx, cmd);
    case 'pillage':
      return pillageCommand(rules, tx, u);
    case 'upgrade':
      return upgradeCommand(rules, tx, u);
    case 'load':
      return loadCommand(rules, tx, u);
    case 'buildArmy':
      return buildArmyCommand(rules, tx, u);
    case 'joinArmy':
      return joinArmyCommand(rules, tx, u, cmd.army);
    case 'leaderHurry':
      return leaderHurryCommand(rules, tx, u);
    default:
      return err('invalid', `Not a war command: ${cmd.type}.`);
  }
}

// ---------------------------------------------------------------------------
// End of turn
// ---------------------------------------------------------------------------

function healsFully(rules: Rules, state: GameState, u: Unit, city: City): boolean {
  const domain = rules.unit(u.type).domain;
  const effect = domain === 'land' ? 'veteranGroundUnits' : domain === 'sea' ? 'veteranSeaUnits' : 'veteranAirUnits';
  const have = empireInfo(rules, state, city.owner).effective.get(city.id) ?? new Set<string>();
  return [...have].some((b) => rules.building(b).effects.includes(effect));
}

/**
 * Units that rested this turn heal (docs/rules/combat.md): one hit point in the field,
 * two in a city of their own, all of them with a barracks, harbour or airport there;
 * none in enemy land without Battlefield Medicine, and ships only in port.
 */
export function healUnits(rules: Rules, tx: Tx): void {
  const units = Object.values(tx.state.units).sort((a, b) => a.id - b.id);
  for (const u0 of units) {
    if (isArmy(rules, u0)) continue;
    const holder = u0.carriedBy === null ? null : tx.state.units[u0.carriedBy];
    const resting = holder && isArmy(rules, holder) ? !holder.acted : !u0.acted;
    if (!resting) continue;
    const max = levelHp(rules, u0.type, u0.experience);
    if (u0.hp >= max) continue;
    const city = cityAt(tx.state, u0.tile);
    const own = city && city.owner === u0.owner ? city : undefined;
    const domain = rules.unit(u0.type).domain;
    let heal = 0;
    if (own) heal = healsFully(rules, tx.state, u0, own) ? max : 2;
    else if (domain === 'land' && !(holder && !isArmy(rules, holder))) {
      const terr = tx.state.map.territory[u0.tile]!;
      const hostile = terr >= 0 && terr !== u0.owner && atWar(tx.state, u0.owner, terr);
      heal = hostile && !hasEffect(rules, tx.state, u0.owner, 'allowsHealingInEnemyTerritory') ? 0 : 1;
    } else if (domain === 'air') heal = 1;
    if (heal > 0) tx.unit(u0.id).hp = Math.min(max, u0.hp + heal);
  }
  for (const u of units) if (tx.state.units[u.id] && isArmy(rules, u)) syncArmyHp(rules, tx, u.id);
}
