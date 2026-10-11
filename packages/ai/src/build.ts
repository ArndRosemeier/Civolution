/**
 * What AI cities build (PLAN.md §9: city management via the automation module with AI
 * weights): defenders where a city is short or threatened, settlers while there is land,
 * an army when at war or preparing one, otherwise the automation's building priorities
 * shaded by the civilization's build preferences.
 */
import { planBuild } from '@civolution/automation';
import { buildOptions, playerUnits, unitsAt, type Build, type City, type GameState } from '@civolution/engine';
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
  /** Naval and air are not built by the AI yet beyond what it already has. */
}

/** Units a city can build now, by role. */
export function unitChoices(view: View, state: GameState, city: City): UnitRule[] {
  return buildOptions(view.rules, state, city)
    .filter((o) => o.blocker === null && o.build.kind === 'unit')
    .map((o) => view.rules.unit(o.build.id));
}

export function bestDefender(units: UnitRule[]): UnitRule | null {
  const d = units.filter((u) => roleOf(u) === 'defender' && u.domain === 'land' && u.populationCost === 0);
  d.sort((a, b) => b.defence * (b.hitPointBonus + 3) - a.defence * (a.hitPointBonus + 3) || a.shieldCost - b.shieldCost || a.id.localeCompare(b.id));
  return d[0] ?? null;
}

export function bestAttacker(units: UnitRule[]): UnitRule | null {
  const d = units.filter((u) => roleOf(u) === 'attacker' && u.domain === 'land' && u.populationCost === 0);
  const score = (u: UnitRule) => u.attack * (u.hitPointBonus + 3) * (u.movement > 1 ? 1.25 : 1);
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
  if (view.frontier.has(city.id)) n++;
  if (city.id === view.capital?.id) n++;
  if (city.size >= 10) n++;
  const threat = view.threat.get(city.id) ?? 0;
  if (threat > 0) n += Math.min(3, Math.ceil(threat / 6));
  if (view.enemies.length > 0 && view.frontier.has(city.id)) n++;
  return Math.min(n, 6);
}

/** The field force a civilization keeps: more when at war, preparing one, or warlike by nature. */
export function wantedField(view: View, preparing: boolean): number {
  const cities = view.cities.length;
  const base = Math.floor(cities * (0.3 + 0.15 * Math.max(0, view.traits.aggression)));
  if (view.enemies.length > 0 || preparing) return Math.max(6, Math.ceil(cities * (1.5 + 0.3 * view.traits.aggression)));
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
  const defender = bestDefender(units);
  if (defender && defenders < want && (defenders === 0 || report.threat > 0 || view.enemies.length > 0 || defenders < Math.min(want, 2))) {
    return { build: { kind: 'unit', id: defender.id }, reason: defenders === 0 ? 'AI: no defender in the city' : `AI: garrison ${defenders} of ${want}` };
  }
  // Field army when at war or preparing one, from cities with production to spare.
  if (needs.haveField < needs.wantField && city.size >= 2) {
    const siegeShare = needs.haveField > 0 && needs.haveField % 4 === 3;
    const siege = siegeShare ? bestSiege(units) : null;
    const attacker = siege ?? bestAttacker(units);
    if (attacker) {
      needs.haveField++;
      return { build: { kind: 'unit', id: attacker.id }, reason: `AI: field army ${needs.haveField} of ${needs.wantField}` };
    }
  }
  const plan = planBuild(view.rules, state, city, { noSettlers: needs.settlersWanted <= 0, noWonders: view.traits.never.has('wonders') });
  if (plan.build.kind === 'unit' && view.rules.unit(plan.build.id).specialActions.includes('buildCity')) needs.settlersWanted--;
  if (plan.build.kind === 'building' && plan.build.id === 'wealth') return fallback(view, units);
  return { build: plan.build, reason: `AI: ${plan.reason}` };
}

/** When the economy plan has nothing useful: a unit for the field if warlike, else wealth. */
function fallback(view: View, units: UnitRule[]): AiBuild {
  const attacker = view.traits.aggression > 0 ? bestAttacker(units) : null;
  if (attacker) return { build: { kind: 'unit', id: attacker.id }, reason: 'AI: building up strength' };
  return { build: { kind: 'building', id: 'wealth' }, reason: 'AI: nothing more urgent' };
}
