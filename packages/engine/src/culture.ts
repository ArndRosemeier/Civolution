/**
 * Resistance in conquered cities and culture flips (docs/rules/culture.md).
 */
import { replaceCitizens, updateTerritory } from './cities.ts';
import { cultureOpinion } from './espionage.ts';
import { distance, tilesInRadius } from './grid.ts';
import type { Rules } from './rules.ts';
import type { City, GameState } from './state.ts';
import type { Tx } from './tx.ts';
import { removeUnitDeep } from './units.ts';
import { reveal } from './vision.ts';

/** Foreign cities this close (in tiles) press on a city's loyalty. */
export const FLIP_RADIUS = 8;
/** A flip needs this much more foreign than home influence, in percent. */
export const FLIP_THRESHOLD_PERCENT = 200;
/** Highest chance of a flip in one turn, in percent. */
export const FLIP_MAX_PERCENT = 20;
/** Each military unit in the city lowers the chance by this much, in percent. */
export const GARRISON_PERCENT = 2;
/** Military units in a city needed to quell one resister each turn. */
export const UNITS_PER_QUELLED = 2;

function garrison(rules: Rules, state: GameState, city: City): number {
  let n = 0;
  for (const u of Object.values(state.units)) {
    if (u.tile !== city.tile || u.owner !== city.owner || u.carriedBy !== null) continue;
    const r = rules.unit(u.type);
    if (r.domain === 'land' && (r.attack > 0 || r.defence > 0)) n++;
  }
  return n;
}

/**
 * A conquered city's people may resist: each citizen resists with the chance the rule
 * file's culture table gives for how they see the conqueror. Retaking a city of your own
 * people meets no resistance.
 */
export function startResistance(rules: Rules, tx: Tx, cityId: number, loser: number): void {
  const c = tx.state.cities[cityId]!;
  if (c.nationality === c.owner || tx.state.players[loser]?.barbarian || !tx.state.players[c.nationality]?.alive) {
    if (c.resisters !== 0) tx.city(cityId).resisters = 0;
    return;
  }
  const opinion = cultureOpinion(rules, tx.state, c.owner, c.nationality);
  let n = 0;
  for (let i = 0; i < c.size; i++) if (tx.random(100) < opinion.initialResistanceChance) n++;
  tx.city(cityId).resisters = n;
  if (n > 0) tx.emit({ type: 'resistanceStarted', city: cityId, player: c.owner, tile: c.tile, resisters: n });
}

/** Each turn resisters may give up, and the garrison quells some (docs/rules/culture.md). */
export function runResistance(rules: Rules, tx: Tx): void {
  for (const c of Object.values(tx.state.cities).sort((a, b) => a.id - b.id)) {
    if (c.resisters <= 0) continue;
    const opinion = cultureOpinion(rules, tx.state, c.owner, c.nationality);
    let left = 0;
    for (let i = 0; i < c.resisters; i++) if (tx.random(100) < opinion.continuedResistanceChance) left++;
    left = Math.max(0, Math.min(c.size, left - Math.floor(garrison(rules, tx.state, c) / UNITS_PER_QUELLED)));
    tx.city(c.id).resisters = left;
    if (left === 0) tx.emit({ type: 'resistanceEnded', city: c.id, player: c.owner, tile: c.tile });
  }
}

/** Culture pressing on `city` from each civilization within FLIP_RADIUS: city culture over distance. */
export function cultureInfluence(state: GameState, city: City): Map<number, number> {
  const out = new Map<number, number>();
  for (const other of Object.values(state.cities)) {
    const d = other.id === city.id ? 1 : distance(state.map, other.tile, city.tile);
    if (d > FLIP_RADIUS) continue;
    const p = state.players[other.owner];
    if (!p?.alive || p.barbarian) continue;
    out.set(other.owner, (out.get(other.owner) ?? 0) + Math.floor((other.culture + 10 * other.size) / Math.max(1, d)));
  }
  return out;
}

export interface FlipOdds {
  /** The civilization the city leans toward, or null. */
  toward: number | null;
  /** Chance in percent of flipping this turn. */
  chance: number;
  reasons: string[];
}

/**
 * The chance a city changes sides this turn (docs/rules/culture.md). Capitals never flip;
 * otherwise a neighbour's culture must outweigh the home influence at least twofold, and
 * unrest, the city's own people and the two civilizations' standing tilt the odds.
 */
export function flipOdds(rules: Rules, state: GameState, city: City, disorder: boolean): FlipOdds {
  const none: FlipOdds = { toward: null, chance: 0, reasons: [] };
  if (!state.options.cultureFlips || 'palace' in city.buildings) return none;
  const influence = cultureInfluence(state, city);
  const home = Math.max(1, influence.get(city.owner) ?? 0);
  let toward: number | null = null;
  let best = 0;
  for (const [p, v] of [...influence].sort((a, b) => a[0] - b[0])) {
    if (p === city.owner) continue;
    if (v > best) {
      best = v;
      toward = p;
    }
  }
  if (toward === null) return none;
  const ratio = Math.floor((best * 100) / home);
  if (ratio < FLIP_THRESHOLD_PERCENT) return { toward, chance: 0, reasons: [`Foreign culture at ${ratio} % of home (needs ${FLIP_THRESHOLD_PERCENT} %)`] };
  const reasons = [`Foreign culture at ${ratio} % of home`];
  let chance = Math.floor((ratio - 100) / 50);
  const opinion = cultureOpinion(rules, state, toward, city.owner);
  const lean = Math.floor(opinion.propagandaSuccess / 5);
  chance += lean;
  reasons.push(`The people are ${opinion.name} ${state.players[toward]!.name} (+${lean})`);
  if (disorder) {
    chance += 5;
    reasons.push('Civil disorder (+5)');
  }
  if (city.resisters > 0) {
    chance += 5;
    reasons.push('Resisters (+5)');
  }
  if (city.nationality === toward) {
    chance += 5;
    reasons.push('Its people belong to them (+5)');
  }
  const g = garrison(rules, state, city);
  if (g > 0) {
    chance -= g * GARRISON_PERCENT;
    reasons.push(`${g} military units (−${g * GARRISON_PERCENT})`);
  }
  return { toward, chance: Math.max(0, Math.min(FLIP_MAX_PERCENT, chance)), reasons };
}

/** Rolls culture flips for every city (end of turn); `disorder` holds the cities in disorder. */
export function runCultureFlips(rules: Rules, tx: Tx, disorder: ReadonlySet<number>): void {
  if (!tx.state.options.cultureFlips) return;
  for (const c of Object.values(tx.state.cities).sort((a, b) => a.id - b.id)) {
    const cur = tx.state.cities[c.id];
    if (!cur) continue;
    const odds = flipOdds(rules, tx.state, cur, disorder.has(c.id));
    if (odds.toward === null || odds.chance <= 0) continue;
    if (tx.random(100) >= odds.chance) continue;
    flipCity(rules, tx, c.id, odds.toward);
  }
}

/** The city joins `to`; the garrison that failed to hold it is lost (as in Civ3). */
export function flipCity(rules: Rules, tx: Tx, cityId: number, to: number): void {
  const c = tx.state.cities[cityId]!;
  const from = c.owner;
  for (const u of Object.values(tx.state.units).sort((a, b) => a.id - b.id)) {
    if (u.tile === c.tile && u.owner === from && tx.state.units[u.id] && u.carriedBy === null) removeUnitDeep(tx, u.id, false, 'destroyed');
  }
  const w = tx.city(cityId);
  w.owner = to;
  w.build = null;
  w.queue = [];
  w.shields = 0;
  w.shieldsFor = null;
  w.manualTiles = false;
  w.disorder = 0;
  w.capturedOn = null;
  w.resisters = 0;
  for (const b of Object.keys(w.buildings)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by building id
    if (rules.building(b).kind === 'smallWonder') delete w.buildings[b];
  }
  updateTerritory(rules, tx);
  replaceCitizens(rules, tx, cityId);
  reveal(tx, to, tilesInRadius(tx.state.map, c.tile, 2));
  tx.emit({ type: 'cityRevolted', city: cityId, player: to, from, tile: c.tile, name: c.name, cause: 'culture' });
}
