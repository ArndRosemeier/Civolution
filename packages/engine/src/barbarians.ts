/**
 * Barbarians (docs/rules/barbarians.md): camps appear in empty land far from the
 * civilizations, spawn raiders, and the raiders go for nearby cities and units. The
 * engine moves them at the end of every turn through the same commands as everyone.
 */
import { distance, neighbours, tileCount } from './grid.ts';
import { canHostBarbarian } from './move.ts';
import { checkMove } from './movement.ts';
import type { Rules } from './rules.ts';
import { FLAG_CAMP, FLAG_HUT, type GameState, type Unit } from './state.ts';
import type { Tx } from './tx.ts';
import { newUnit } from './units.ts';
import { moveOrAttack, previewAttack } from './war.ts';

const LEVELS = { none: 0, sedentary: 1, roaming: 2, restless: 3, raging: 4 } as const;
/** Percent chance per turn that a new camp appears, by activity level. */
const CAMP_CHANCE = [0, 4, 6, 9, 14];
/** A camp sends out a raider once every this many turns on average, by activity level. */
const RAID_INTERVAL = [0, 0, 14, 9, 5];
/** First turn on which camps appear. */
export const BARBARIAN_START_TURN = 10;
/** Raiders look this far for something to attack. */
const SEARCH_RADIUS = 8;

export function barbarianPlayer(state: GameState): number {
  return state.players.findIndex((p) => p.barbarian && p.alive);
}

export function campTiles(state: GameState): number[] {
  const out: number[] = [];
  const f = state.map.flags;
  for (let t = 0; t < f.length; t++) if (f[t]! & FLAG_CAMP) out.push(t);
  return out;
}

/** The unit barbarians field now: the mounted one once any civilization leaves the first era. */
function raiderType(rules: Rules, state: GameState): string {
  const g = rules.set.general;
  return state.players.some((p) => !p.barbarian && p.alive && p.era >= 1) ? g.advancedBarbarian : g.basicBarbarian;
}

function maxCamps(state: GameState, level: number): number {
  return level + Math.floor(tileCount(state.map) / 1500);
}

/** A tile far from every city and civilized unit (a stand-in for "seen by nobody"). */
function campSite(rules: Rules, tx: Tx): number {
  const n = tileCount(tx.state.map);
  const cities = Object.values(tx.state.cities);
  const units = Object.values(tx.state.units).filter((u) => !tx.state.players[u.owner]!.barbarian);
  for (let tries = 0; tries < 40; tries++) {
    const t = tx.random(n);
    if (!canHostBarbarian(rules, tx, t)) continue;
    if (tx.state.map.territory[t]! >= 0 || tx.state.map.flags[t]! & (FLAG_CAMP | FLAG_HUT)) continue;
    if (cities.some((c) => distance(tx.state.map, c.tile, t) < 6)) continue;
    if (units.some((u) => distance(tx.state.map, u.tile, t) < 4)) continue;
    return t;
  }
  return -1;
}

function spawn(rules: Rules, tx: Tx, player: number, tile: number, guard: boolean): void {
  const type = raiderType(rules, tx.state);
  const u = tx.addUnit({ ...newUnit(rules, player, type, tile), fortified: guard, order: guard ? { type: 'fortify' } : null });
  tx.emit({ type: 'unitCreated', unit: u.id, player, unitType: type, tile });
}

/** Barbarian part of the end of turn. */
export function runBarbarians(rules: Rules, tx: Tx): void {
  const player = barbarianPlayer(tx.state);
  if (player < 0) return;
  const level = LEVELS[tx.state.settings.barbarians];
  if (level === 0) return;
  const camps = campTiles(tx.state);
  const units = () => Object.values(tx.state.units).filter((u) => u.owner === player).sort((a, b) => a.id - b.id);
  const unitCap = camps.length * 3 + 4;

  if (tx.state.turn >= BARBARIAN_START_TURN && camps.length < maxCamps(tx.state, level) && tx.random(100) < CAMP_CHANCE[level]!) {
    const t = campSite(rules, tx);
    if (t >= 0) {
      const flags = tx.mapArray('flags');
      flags[t] = flags[t]! | FLAG_CAMP;
      tx.emit({ type: 'campAppeared', tile: t });
      spawn(rules, tx, player, t, true);
      camps.push(t);
    }
  }

  for (const t of camps) {
    const here = units().filter((u) => u.tile === t);
    if (here.length === 0) {
      spawn(rules, tx, player, t, true);
      continue;
    }
    const interval = RAID_INTERVAL[level]!;
    if (interval > 0 && units().length < unitCap && tx.random(interval) === 0) {
      const spots = neighbours(tx.state.map, t).filter((x) => canHostBarbarian(rules, tx, x));
      if (spots.length > 0) spawn(rules, tx, player, spots[tx.random(spots.length)]!, false);
    }
  }

  if (level < LEVELS.roaming) return;
  for (const u0 of units()) {
    if (u0.order?.type === 'fortify' && tx.state.map.flags[u0.tile]! & FLAG_CAMP) continue;
    raid(rules, tx, u0.id);
  }
}

/** Nearest civilized city or unit within reach, or -1. */
function targetFor(state: GameState, u: Unit): number {
  let best = -1;
  let bestD = Infinity;
  const consider = (tile: number, bonus: number) => {
    const d = distance(state.map, u.tile, tile) - bonus;
    if (d < bestD || (d === bestD && tile < best)) {
      bestD = d;
      best = tile;
    }
  };
  for (const c of Object.values(state.cities)) if (distance(state.map, u.tile, c.tile) <= SEARCH_RADIUS) consider(c.tile, 1);
  for (const x of Object.values(state.units)) {
    if (x.owner === u.owner || x.carriedBy !== null) continue;
    if (distance(state.map, u.tile, x.tile) <= SEARCH_RADIUS) consider(x.tile, 0);
  }
  return best;
}

function raid(rules: Rules, tx: Tx, unitId: number): void {
  for (let step = 0; step < 6; step++) {
    const u = tx.state.units[unitId];
    if (!u || u.movesLeft <= 0) return;
    const target = targetFor(tx.state, u);
    // Attack an adjacent enemy when the odds are tolerable.
    const adjacent = neighbours(tx.state.map, u.tile)
      .filter((t) => Object.values(tx.state.units).some((x) => x.tile === t && x.owner !== u.owner) || Object.values(tx.state.cities).some((c) => c.tile === t))
      .sort((a, b) => a - b);
    let attacked = false;
    for (const t of adjacent) {
      if (u.attacked) break;
      const p = previewAttack(rules, tx.state, u, t);
      if (p && p.odds.attackerWins + p.odds.attackerRetreats < 0.25) continue;
      if (moveOrAttack(rules, tx, unitId, t, false) === null) {
        attacked = true;
        break;
      }
    }
    if (attacked) continue;
    // Otherwise close in on the target, or wander.
    const options = neighbours(tx.state.map, u.tile).filter((t) => checkMove(rules, tx.state, u, t).ok);
    if (options.length === 0) return;
    let next: number;
    if (target >= 0) {
      options.sort((a, b) => distance(tx.state.map, a, target) - distance(tx.state.map, b, target) || a - b);
      next = options[0]!;
      if (distance(tx.state.map, next, target) >= distance(tx.state.map, u.tile, target)) return;
    } else {
      if (tx.random(2) === 0) return;
      next = options[tx.random(options.length)]!;
    }
    if (moveOrAttack(rules, tx, unitId, next, false) !== null) return;
  }
}
