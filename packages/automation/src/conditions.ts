/**
 * What templates and the player's rules test (`Condition`) and ask for (`BuildRef`):
 * city values, unit roles, and the best unit of a role a city can build now.
 */
import {
  atWar,
  buildOptions,
  cityReport,
  isCoastal,
  playerCities,
  unitsAt,
  type Build,
  type BuildRef,
  type City,
  type CityReport,
  type Condition,
  type GameState,
  type Rules,
  type Stat,
  type UnitRole,
} from '@civolution/engine';
import type { UnitRule } from '@civolution/data-schema';

/** The role a unit type plays for automation. */
export function unitRole(rule: UnitRule): UnitRole | 'other' {
  if (rule.abilities.includes('army') || rule.abilities.includes('leader') || rule.abilities.includes('king')) return 'other';
  if (rule.specialActions.includes('buildCity')) return 'settler';
  if (rule.jobs.length > 0) return 'worker';
  if (rule.domain === 'sea') return 'ship';
  if (rule.domain === 'air') return 'other';
  if (rule.attack === 0 && rule.bombardStrength > 0) return 'siege';
  if (rule.attack === 0 && rule.defence === 0) return 'explorer';
  if (rule.attack > rule.defence) return 'attacker';
  if (rule.defence > 0) return 'defender';
  return 'other';
}

/** A city with its report computed once, on demand. */
export class CityView {
  private cached: CityReport | null = null;
  constructor(
    readonly rules: Rules,
    readonly state: GameState,
    readonly city: City,
  ) {}
  get report(): CityReport {
    this.cached ??= cityReport(this.rules, this.state, this.city);
    return this.cached;
  }
}

export function defenders(rules: Rules, state: GameState, city: City): number {
  return unitsAt(state, city.tile).filter((u) => u.owner === city.owner && u.carriedBy === null && unitRole(rules.unit(u.type)) === 'defender').length;
}

export function atWarWithAnyone(state: GameState, player: number): boolean {
  return state.players[player]!.atWarWith.some((e) => !state.players[e]!.barbarian && atWar(state, player, e));
}

export function statValue(view: CityView, stat: Stat, building?: string): number {
  const { rules, state, city } = view;
  switch (stat) {
    case 'size':
      return city.size;
    case 'unhappy':
      return view.report.unhappy;
    case 'happy':
      return view.report.happy;
    case 'foodSurplus':
      return view.report.foodSurplus;
    case 'shields':
      return view.report.shields.value;
    case 'commerce':
      return view.report.commerceBase.value;
    case 'corruption':
      return view.report.corruptionRate.value;
    case 'defenders':
      return defenders(rules, state, city);
    case 'gold':
      return state.players[city.owner]!.gold;
    case 'atWar':
      return atWarWithAnyone(state, city.owner) ? 1 : 0;
    case 'coastal':
      return isCoastal(rules, state, city.tile) ? 1 : 0;
    case 'turn':
      return state.turn;
    case 'cities':
      return playerCities(state, city.owner).length;
    case 'has':
      return building !== undefined && building in city.buildings ? 1 : 0;
  }
}

export function holds(view: CityView, c: Condition): boolean {
  const v = statValue(view, c.stat, c.building);
  return c.op === '>=' ? v >= c.value : c.op === '<=' ? v <= c.value : v === c.value;
}

const STAT_LABEL: Record<Stat, string> = {
  size: 'size',
  unhappy: 'unhappy',
  happy: 'happy',
  foodSurplus: 'food surplus',
  shields: 'shields',
  commerce: 'commerce',
  corruption: 'corruption %',
  defenders: 'defenders',
  gold: 'treasury',
  atWar: 'at war',
  coastal: 'coastal',
  turn: 'turn',
  cities: 'cities',
  has: 'has',
};

/** "unhappy ≥ 2", "at war", "no Temple" … for reasons and the editor. */
export function describeCondition(rules: Rules, c: Condition): string {
  if (c.stat === 'has') {
    const name = c.building && rules.hasBuilding(c.building) ? rules.building(c.building).name : (c.building ?? '?');
    return (c.op === '=' && c.value === 0) || (c.op === '<=' && c.value <= 0) ? `no ${name}` : `has ${name}`;
  }
  if (c.stat === 'atWar' || c.stat === 'coastal') return (c.op === '=' && c.value === 0) || (c.op === '<=' && c.value <= 0) ? `not ${STAT_LABEL[c.stat]}` : STAT_LABEL[c.stat];
  return `${STAT_LABEL[c.stat]} ${c.op === '>=' ? '≥' : c.op === '<=' ? '≤' : '='} ${c.value}`;
}

const ROLE_SCORE: Record<UnitRole, (u: UnitRule) => number> = {
  defender: (u) => u.defence * (u.hitPointBonus + 3),
  attacker: (u) => u.attack * (u.hitPointBonus + 3) * (u.movement > 1 ? 1.25 : 1),
  siege: (u) => u.bombardStrength * Math.max(1, u.rateOfFire),
  worker: (u) => u.workRate * 10 - u.shieldCost,
  settler: (u) => -u.shieldCost,
  explorer: (u) => u.movement * 10 - u.shieldCost,
  ship: (u) => (u.attack + u.defence) * (u.hitPointBonus + 3) + u.capacity,
};

/** The best unit of `role` the city can build now, or null. */
export function bestOfRole(rules: Rules, state: GameState, city: City, role: UnitRole): string | null {
  const options = buildOptions(rules, state, city)
    .filter((o) => o.blocker === null && o.build.kind === 'unit')
    .map((o) => rules.unit(o.build.id))
    .filter((u) => unitRole(u) === role && (role === 'settler' || u.populationCost === 0));
  options.sort((a, b) => ROLE_SCORE[role](b) - ROLE_SCORE[role](a) || a.shieldCost - b.shieldCost || a.id.localeCompare(b.id));
  return options[0]?.id ?? null;
}

/** The concrete build a reference stands for in this city, or null when it has none. */
export function resolveBuild(rules: Rules, state: GameState, city: City, ref: BuildRef): Build | null {
  if (ref.kind === 'role') {
    const id = bestOfRole(rules, state, city, ref.role);
    return id ? { kind: 'unit', id } : null;
  }
  if (ref.kind === 'unit' ? !rules.hasUnit(ref.id) : !rules.hasBuilding(ref.id)) return null;
  return { kind: ref.kind, id: ref.id };
}

const ROLE_LABEL: Record<UnitRole, string> = {
  defender: 'best defender',
  attacker: 'best attacker',
  siege: 'best siege unit',
  worker: 'worker',
  settler: 'settler',
  explorer: 'explorer',
  ship: 'best ship',
};

export function describeBuild(rules: Rules, ref: BuildRef): string {
  if (ref.kind === 'role') return ROLE_LABEL[ref.role];
  if (ref.kind === 'unit') return rules.hasUnit(ref.id) ? rules.unit(ref.id).name : ref.id;
  return rules.hasBuilding(ref.id) ? rules.building(ref.id).name : ref.id;
}
