/**
 * Civilizations (docs/rules/civilizations.md): traits, unique units, free advances, city
 * and leader names, and golden ages (docs/rules/golden-ages.md).
 */
import type { CivRule } from '@civolution/data-schema';
import { empireInfo } from './empire.ts';
import { CITY_NAMES } from './names.ts';
import type { Rules } from './rules.ts';
import type { GameState, Player } from './state.ts';
import type { Tx } from './tx.ts';

export const TRAITS = ['militaristic', 'religious', 'commercial', 'industrious', 'expansionist', 'scientific', 'agricultural', 'seafaring'] as const;
export type Trait = (typeof TRAITS)[number];

/**
 * The building characteristic that matches each trait: improvements with it cost half for
 * the civilization, and wonders with it count toward its golden age.
 */
export const TRAIT_CHARACTERISTIC: Record<Trait, string> = {
  militaristic: 'militaryInstallation',
  religious: 'placeOfWorship',
  commercial: 'tradeInstallation',
  industrious: 'constructionInstallation',
  expansionist: 'explorationInstallation',
  scientific: 'researchInstallation',
  agricultural: 'agriculturalInstallation',
  seafaring: 'seafaringInstallation',
};

/** Industrious workers work this much faster, in percent. */
export const INDUSTRIOUS_WORK_PERCENT = 50;
/** Industrious cities of at least this size make an extra shield on their tile. */
export const INDUSTRIOUS_CITY_SIZE = 7;
/** Commercial civilizations get this many more optimal cities, in percent (less corruption). */
export const COMMERCIAL_OCN_PERCENT = 25;
/** Chance in percent that a scientific civilization first to an advance gains a scientific leader. */
export const SCIENTIFIC_LEADER_PERCENT = 10;

export function civOf(rules: Rules, p: Player | undefined): CivRule | null {
  return p?.civ ? rules.civ(p.civ) : null;
}

export function hasTrait(rules: Rules, state: GameState, player: number, trait: Trait): boolean {
  return civOf(rules, state.players[player])?.traits.includes(trait) ?? false;
}

function popcount(x: number): number {
  let v = x >>> 0;
  let c = 0;
  while (v) {
    v &= v - 1;
    c++;
  }
  return c;
}

/** A second entry with an already-used name (Rifleman, Impi, …): a variant the game makes itself, never built. */
export function isUnitVariant(rules: Rules, id: string): boolean {
  const m = /^(.*\D)\d+$/.exec(id);
  return !!m && rules.hasUnit(m[1]!);
}

/** Units cities can build at all: not leaders, armies, kings or variants. */
function buildableKind(rules: Rules, id: string): boolean {
  const u = rules.unit(id);
  if (u.shieldCost <= 0) return false;
  if (u.aiRoles.includes('leader') || u.aiRoles.includes('army') || u.abilities.includes('king')) return false;
  return !isUnitVariant(rules, id);
}

/** Units every civilization may build; unnamed players (tests, scenarios) are limited to these. */
export function isCommonUnit(rules: Rules, id: string): boolean {
  return buildableKind(rules, id) && popcount(rules.unit(id).availableToMask & ~1) >= 16;
}

/**
 * Whether `player` may build `id`: a civilization builds what the rule file makes available
 * to it (its unique unit in place of the common one), an unnamed player the common units.
 */
export function unitAvailable(rules: Rules, state: GameState, player: number, id: string): boolean {
  const civ = civOf(rules, state.players[player]);
  if (!civ) return isCommonUnit(rules, id);
  if (!buildableKind(rules, id)) return false;
  return ((rules.unit(id).availableToMask >>> civ.unitBit) & 1) === 1;
}

/**
 * The unit `player` fields in place of `id`: `id` itself when the civilization builds it,
 * else its unique unit taking that place (same domain, same advance, same upgrade; the Inca
 * Chasqui Scout for the Scout), else `id` unchanged (docs/rules/civilizations.md).
 */
export function civVersionOf(rules: Rules, state: GameState, player: number, id: string): string {
  const civ = civOf(rules, state.players[player]);
  if (!civ || unitAvailable(rules, state, player, id)) return id;
  const base = rules.unit(id);
  const match = civ.uniqueUnits.find((uu) => {
    if (!rules.hasUnit(uu)) return false;
    const u = rules.unit(uu);
    return u.domain === base.domain && u.requiredTech === base.requiredTech && u.upgradeTo === base.upgradeTo;
  });
  return match ?? id;
}

/** The next unit up `id`'s upgrade line that `player` builds (lines skip other civilizations' unique units). */
export function nextUpgrade(rules: Rules, state: GameState, player: number, id: string): string | undefined {
  let next = rules.unit(id).upgradeTo;
  for (let guard = 0; next && guard < 20; guard++) {
    if (unitAvailable(rules, state, player, next)) return next;
    next = rules.unit(next).upgradeTo;
  }
  return undefined;
}

/** Whether a civilization trait halves this building's cost for `player` (improvements only). */
export function traitDiscount(rules: Rules, state: GameState, player: number, building: string): Trait | null {
  const r = rules.building(building);
  if (r.kind !== 'improvement') return null;
  const civ = civOf(rules, state.players[player]);
  if (!civ) return null;
  for (const t of civ.traits) if (r.tags.includes(TRAIT_CHARACTERISTIC[t as Trait])) return t as Trait;
  return null;
}

/** A name for `player`'s next city: its civilization's list in order, then the shared list. */
export function nextCityName(rules: Rules, state: GameState, player: number): string {
  const used = new Set(Object.values(state.cities).map((c) => c.name));
  const civ = civOf(rules, state.players[player]);
  for (const n of civ?.cityNames ?? []) if (!used.has(n)) return n;
  for (const n of CITY_NAMES) if (!used.has(n)) return n;
  const mine = Object.values(state.cities).filter((c) => c.owner === player).length;
  return `New Town ${mine + 1}`;
}

/** The name of `player`'s next great leader (military or scientific). */
export function leaderName(rules: Rules, state: GameState, player: number, scientific: boolean): string {
  const p = state.players[player]!;
  const civ = civOf(rules, p);
  const list = (scientific ? civ?.scientificLeaders : civ?.militaryLeaders) ?? [];
  if (list.length === 0) return scientific ? 'Great Scientist' : 'Great Leader';
  const name = list[p.leadersBorn % list.length]!;
  const round = Math.floor(p.leadersBorn / list.length);
  return round > 0 ? `${name} ${['II', 'III', 'IV', 'V'][Math.min(3, round - 1)]}` : name;
}

// ---------------------------------------------------------------------------
// Golden ages
// ---------------------------------------------------------------------------

export function inGoldenAge(state: GameState, player: number): boolean {
  const g = state.players[player]?.goldenAge;
  return !!g && state.turn < g.until;
}

/** Starts `player`'s one golden age (docs/rules/golden-ages.md). */
export function startGoldenAge(rules: Rules, tx: Tx, player: number, cause: 'uniqueUnit' | 'wonders', detail: string): void {
  const p = tx.state.players[player]!;
  if (p.hadGoldenAge || p.barbarian || !p.alive) return;
  const pl = tx.player(player);
  pl.hadGoldenAge = true;
  pl.goldenAge = { since: tx.state.turn, until: tx.state.turn + rules.set.general.goldenAgeDuration };
  tx.emit({ type: 'goldenAgeStarted', player, cause, detail, until: pl.goldenAge.until });
}

/** A unique unit's first victory starts its civilization's golden age. */
export function uniqueUnitVictory(rules: Rules, tx: Tx, player: number, unitType: string): void {
  const civ = civOf(rules, tx.state.players[player]);
  if (!civ || tx.state.players[player]!.hadGoldenAge) return;
  if (!civ.uniqueUnits.includes(unitType) || !rules.unit(unitType).abilities.includes('startsGoldenAge')) return;
  startGoldenAge(rules, tx, player, 'uniqueUnit', `${rules.unit(unitType).name} won a battle`);
}

/**
 * The civilization's great wonders cover both of its traits' characteristics (one wonder
 * may cover both): its golden age starts.
 */
export function checkWonderGoldenAge(rules: Rules, tx: Tx, player: number): void {
  const p = tx.state.players[player]!;
  const civ = civOf(rules, p);
  if (!civ || p.hadGoldenAge) return;
  const owned = [...empireInfo(rules, tx.state, player).activeWonders].filter((w) => rules.building(w).kind === 'wonder');
  const tags = new Set(owned.flatMap((w) => rules.building(w).tags));
  if (civ.traits.length > 0 && civ.traits.every((t) => tags.has(TRAIT_CHARACTERISTIC[t as Trait]))) {
    startGoldenAge(rules, tx, player, 'wonders', `wonders matching the ${civ.traits.join(' and ')} traits`);
  }
}

/** Ends golden ages whose time is up (start of turn). */
export function endGoldenAges(tx: Tx): void {
  for (const p of tx.state.players) {
    if (p.goldenAge && tx.state.turn >= p.goldenAge.until) {
      tx.player(p.id).goldenAge = null;
      tx.emit({ type: 'goldenAgeEnded', player: p.id });
    }
  }
}

/**
 * Extra movement points for ships: seafaring civilizations get one, and so does each
 * active wonder with plusOneShipMovement (Great Lighthouse, Magellan's Voyage).
 */
export function shipMoveBonus(rules: Rules, state: GameState, player: number): number {
  const p = state.players[player];
  if (!p || p.barbarian) return 0;
  let bonus = hasTrait(rules, state, player, 'seafaring') ? 1 : 0;
  for (const w of empireInfo(rules, state, player).activeWonders) if (rules.building(w).effects.includes('plusOneShipMovement')) bonus++;
  return bonus;
}

/** Ships that must hug the coast may cross sea (not ocean) with safeSeaTravel (Great Lighthouse). */
export function safeSeaTravel(rules: Rules, state: GameState, player: number): boolean {
  const p = state.players[player];
  if (!p || p.barbarian) return false;
  for (const w of empireInfo(rules, state, player).activeWonders) if (rules.building(w).effects.includes('safeSeaTravel')) return true;
  return false;
}
