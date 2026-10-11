/**
 * What AI cities build (PLAN.md §9: city management via the automation module with AI
 * weights): defenders where a city is short or threatened, settlers while there is land,
 * an army when at war or preparing one, otherwise the automation's building priorities
 * shaded by the civilization's build preferences.
 */
import { planBuild } from '@civolution/automation';
import { buildBlocker, buildOptions, cityReport, isCoastal, playerUnits, unitsAt, TRAIT_CHARACTERISTIC, type Build, type City, type GameState, type Trait } from '@civolution/engine';
import { bestTransport, explorerShip } from './naval.ts';
import type { UnitRule } from '@civolution/data-schema';
import { roleOf, type View } from './view.ts';

export interface BuildNeeds {
  /** Field units (attackers, siege, armies) the civilization wants, and has. */
  wantField: number;
  haveField: number;
  /** Settlers wanted on top of those already walking. */
  settlersWanted: number;
  /** Defenders each city wants. */
  garrison: Map<number, number>;
  /** The coastal city that should build a transport for an invasion, if any. */
  transportAt?: number;
  /** A ship to explore the seas is wanted. */
  seaExplorer?: boolean;
  /** A coastal city should build settlers for a colony across the water. */
  colonize?: boolean;
  /** Naval and air are not built by the AI yet beyond what it already has. */
}

/** Units a city can build now, by role. */
export function unitChoices(view: View, state: GameState, city: City): UnitRule[] {
  return buildOptions(view.rules, state, city)
    .filter((o) => o.blocker === null && o.build.kind === 'unit')
    .map((o) => view.rules.unit(o.build.id));
}

/** The civilization's own unique units are worth a third more to it (they can start its golden age). */
const UNIQUE_BONUS = 4 / 3;

export function bestDefender(units: UnitRule[], unique: readonly string[] = []): UnitRule | null {
  const d = units.filter((u) => roleOf(u) === 'defender' && u.domain === 'land' && u.populationCost === 0);
  const score = (u: UnitRule) => u.defence * (u.hitPointBonus + 3) * (unique.includes(u.id) ? UNIQUE_BONUS : 1);
  d.sort((a, b) => score(b) - score(a) || a.shieldCost - b.shieldCost || a.id.localeCompare(b.id));
  return d[0] ?? null;
}

export function bestAttacker(units: UnitRule[], unique: readonly string[] = []): UnitRule | null {
  const d = units.filter((u) => roleOf(u) === 'attacker' && u.domain === 'land' && u.populationCost === 0);
  const score = (u: UnitRule) => u.attack * (u.hitPointBonus + 3) * (u.movement > 1 ? 1.25 : 1) * (unique.includes(u.id) ? UNIQUE_BONUS : 1);
  d.sort((a, b) => score(b) - score(a) || a.shieldCost - b.shieldCost || a.id.localeCompare(b.id));
  return d[0] ?? null;
}

export function bestSiege(units: UnitRule[]): UnitRule | null {
  const d = units.filter((u) => roleOf(u) === 'siege' && u.domain === 'land');
  d.sort((a, b) => b.bombardStrength * b.rateOfFire - a.bombardStrength * a.rateOfFire || a.shieldCost - b.shieldCost || a.id.localeCompare(b.id));
  return d[0] ?? null;
}

/** Defenders standing in a city. */
export function defendersIn(view: View, state: GameState, city: City): number {
  return unitsAt(state, city.tile).filter((u) => u.owner === city.owner && u.carriedBy === null && roleOf(view.rules.unit(u.type)) === 'defender').length;
}

/** How many defenders a city wants: one, more on the frontier, in the capital, when big or threatened. */
export function garrisonFor(view: View, city: City): number {
  let n = 1;
  const frontier = view.frontier.has(city.id);
  if (frontier && (view.enemies.length > 0 || city.size >= 4 || city.id === view.capital?.id)) n++;
  if (city.size >= 12) n++;
  const threat = view.threat.get(city.id) ?? 0;
  if (threat > 0) n += Math.min(2, Math.ceil(threat / 8));
  return Math.min(n, 4);
}

/** The field force a civilization keeps: more when at war, preparing one, or warlike by nature. */
export function wantedField(view: View, preparing: boolean): number {
  const cities = view.cities.length;
  const base = Math.floor(cities * (0.3 + 0.15 * Math.max(0, view.traits.aggression)));
  // At war the field force grows with the empire, but not so far that its upkeep starves research.
  if (view.enemies.length > 0 || preparing) return Math.max(6, Math.ceil(cities * (1.2 + 0.25 * view.traits.aggression)));
  return base;
}

export function fieldCount(view: View, state: GameState): number {
  return playerUnits(state, view.player).filter((u) => {
    const r = roleOf(view.rules.unit(u.type));
    return (r === 'attacker' || r === 'siege' || r === 'army') && !(u.carriedBy !== null && view.rules.unit(state.units[u.carriedBy]?.type ?? u.type).abilities.includes('army'));
  }).length;
}

export interface AiBuild {
  build: Build;
  reason: string;
}

/** What `city` should build now. */
export function aiBuild(view: View, state: GameState, city: City, needs: BuildNeeds): AiBuild {
  const units = unitChoices(view, state, city);
  const report = { threat: view.threat.get(city.id) ?? 0 };
  const defenders = defendersIn(view, state, city);
  const want = needs.garrison.get(city.id) ?? 1;
  const unique = view.me.civ ? view.rules.civ(view.me.civ).uniqueUnits : [];
  const defender = bestDefender(units, unique);
  if (defender && defenders < want && (defenders === 0 || report.threat > 0 || view.enemies.length > 0 || defenders < Math.min(want, 2))) {
    return { build: { kind: 'unit', id: defender.id }, reason: defenders === 0 ? 'AI: no defender in the city' : `AI: garrison ${defenders} of ${want}` };
  }
  if (needs.transportAt === city.id) {
    const ship = bestTransport(units);
    if (ship) {
      needs.transportAt = -1;
      return { build: { kind: 'unit', id: ship.id }, reason: 'AI: a transport for the crossing' };
    }
  }
  if (needs.seaExplorer && isCoastal(view.rules, state, city.tile)) {
    const ship = explorerShip(units);
    if (ship) {
      needs.seaExplorer = false;
      return { build: { kind: 'unit', id: ship.id }, reason: 'AI: a ship to explore the coasts' };
    }
  }
  if (needs.colonize && city.size >= 3 && isCoastal(view.rules, state, city.tile)) {
    const settler = units.find((u) => u.specialActions.includes('buildCity'));
    if (settler) {
      needs.colonize = false;
      return { build: { kind: 'unit', id: settler.id }, reason: 'AI: settlers for new land across the water' };
    }
  }
  // Field army when at war or preparing one, from cities with production to spare.
  if (needs.haveField < needs.wantField && city.size >= 2) {
    const siegeShare = needs.haveField > 0 && needs.haveField % 4 === 3;
    const siege = siegeShare ? bestSiege(units) : null;
    const attacker = siege ?? bestAttacker(units, unique);
    if (attacker) {
      needs.haveField++;
      return { build: { kind: 'unit', id: attacker.id }, reason: `AI: field army ${needs.haveField} of ${needs.wantField}` };
    }
  }
  // Settlers come from cities big enough to spare a citizen; wonders from cities with the production for them.
  const shields = cityReport(view.rules, state, city).shields.value;
  const wonder = traitWonder(view, state, city, shields);
  if (wonder) return wonder;
  const settlerOk = needs.settlersWanted > 0;
  const plan = planBuild(view.rules, state, city, { noSettlers: !settlerOk, noWonders: view.traits.never.has('wonders') || shields < 8, growFirst: true });
  if (plan.build.kind === 'unit' && view.rules.unit(plan.build.id).specialActions.includes('buildCity')) needs.settlersWanted--;
  if (plan.build.kind === 'building' && plan.build.id === 'wealth') return fallback(view, units);
  return { build: plan.build, reason: `AI: ${plan.reason}` };
}

/**
 * The capital (or the most productive city) of a civilization at peace builds a great
 * wonder that matches its traits, once it has a temple and a library: those wonders count
 * toward its golden age (docs/rules/golden-ages.md).
 */
function traitWonder(view: View, state: GameState, city: City, shields: number): AiBuild | null {
  if (view.traits.never.has('wonders') || view.enemies.length > 0 || shields < 6) return null;
  const rules = view.rules;
  const mine = view.cities;
  const best = [...mine].sort((a, b) => b.size - a.size || a.id - b.id)[0];
  if (city.id !== view.capital?.id && city.id !== best?.id) return null;
  for (const b of ['temple', 'library']) if (rules.hasBuilding(b) && !(b in city.buildings) && buildBlocker(rules, state, city, { kind: 'building', id: b }) === null) return null;
  if (mine.some((c) => c.id !== city.id && c.build?.kind === 'building' && rules.building(c.build.id).kind === 'wonder')) return null;
  const civ = view.me.civ ? rules.civ(view.me.civ) : null;
  const wanted = new Set((civ?.traits ?? []).map((t) => TRAIT_CHARACTERISTIC[t as Trait]));
  const options = rules.set.buildings
    .filter((b) => b.kind === 'wonder' && !b.unitProduced && buildBlocker(rules, state, city, { kind: 'building', id: b.id }) === null)
    .map((b) => ({ b, match: b.tags.filter((t) => wanted.has(t)).length }))
    .filter((x) => x.match > 0)
    .sort((x, y) => y.match - x.match || x.b.cost - y.b.cost || x.b.id.localeCompare(y.b.id));
  const pick = options[0]?.b;
  return pick ? { build: { kind: 'building', id: pick.id }, reason: `AI: ${pick.name}, a wonder for our golden age` } : null;
}

/** When the economy plan has nothing useful: a unit for the field if warlike, else wealth. */
function fallback(view: View, units: UnitRule[]): AiBuild {
  const attacker = view.traits.aggression > 0 ? bestAttacker(units, view.me.civ ? view.rules.civ(view.me.civ).uniqueUnits : []) : null;
  if (attacker) return { build: { kind: 'unit', id: attacker.id }, reason: 'AI: building up strength' };
  return { build: { kind: 'building', id: 'wealth' }, reason: 'AI: nothing more urgent' };
}
