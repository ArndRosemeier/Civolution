/**
 * What a city can build, what it costs, and hurrying (docs/rules/production.md).
 */
import { cityReport, effectiveBuildings, isCoastal, sizeClass } from './city.ts';
import { cityResources, empireInfo } from './empire.ts';
import { knowsTech } from './queries.ts';
import type { Rules } from './rules.ts';
import type { Build, City, GameState } from './state.ts';
import { cityRadiusTiles } from './territory.ts';

export type BuildCategory = 'unit' | 'improvement' | 'wonder';

export function buildCategory(rules: Rules, b: Build): BuildCategory {
  if (b.kind === 'unit') return 'unit';
  const kind = rules.building(b.id).kind;
  return kind === 'wonder' || kind === 'smallWonder' ? 'wonder' : 'improvement';
}

export function buildCost(rules: Rules, b: Build): number {
  return b.kind === 'unit' ? rules.unit(b.id).shieldCost : rules.building(b.id).cost;
}

export function buildName(rules: Rules, b: Build): string {
  return b.kind === 'unit' ? rules.unit(b.id).name : rules.building(b.id).name;
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

/**
 * Units every civilization may build. Until civilizations are chosen (Phase 6) a unit
 * available to fewer than half of them (unique units, the scout) is left out.
 */
export function isCommonUnit(rules: Rules, id: string): boolean {
  const u = rules.unit(id);
  if (u.shieldCost <= 0) return false;
  if (u.aiRoles.includes('leader') || u.aiRoles.includes('army')) return false;
  return popcount(u.availableToMask & ~1) >= 16;
}

/** Why `city` cannot build `b`, or null when it can. */
export function buildBlocker(rules: Rules, state: GameState, city: City, b: Build): string | null {
  const p = state.players[city.owner]!;
  const info = empireInfo(rules, state, city.owner);
  const resources = cityResources(info, city);
  if (b.kind === 'unit') {
    const u = rules.unit(b.id);
    if (!isCommonUnit(rules, b.id)) return `${u.name} is not available to your civilization.`;
    if (u.requiredTech && !knowsTech(p, u.requiredTech)) return `Requires ${rules.tech(u.requiredTech).name}.`;
    const missing = u.requiredResources.filter((r) => !resources.has(r));
    if (missing.length > 0) return `Requires ${missing.map((r) => rules.resources[rules.resourceIndex(r)]!.name).join(' and ')}.`;
    if (u.domain === 'sea' && !isCoastal(rules, state, city.tile)) return 'Ships need a coastal city.';
    if (u.domain === 'air') return 'Aircraft arrive with air combat in Phase 3.';
    if (u.upgradeTo && isCommonUnit(rules, u.upgradeTo)) {
      const up = rules.unit(u.upgradeTo);
      if ((!up.requiredTech || knowsTech(p, up.requiredTech)) && up.requiredResources.every((r) => resources.has(r)))
        return `Replaced by ${up.name}.`;
    }
    return null;
  }
  const r = rules.building(b.id);
  if (r.requiredTech && !knowsTech(p, r.requiredTech)) return `Requires ${rules.tech(r.requiredTech).name}.`;
  if (r.obsoletedBy && knowsTech(p, r.obsoletedBy)) return `Obsolete since ${rules.tech(r.obsoletedBy).name}.`;
  if (b.id in city.buildings) return 'Already built here.';
  if (r.kind === 'wonder' && b.id in state.wonders) return 'Already built by a civilization.';
  if (r.kind === 'smallWonder' && info.buildingCount.has(b.id)) return 'Your civilization already has it.';
  if (r.requiredBuilding) {
    if (r.requiredCount > 1) {
      const have = info.buildingCount.get(r.requiredBuilding) ?? 0;
      if (have < r.requiredCount) return `Requires ${r.requiredCount} ${rules.building(r.requiredBuilding).name} buildings (you have ${have}).`;
    } else if (!effectiveBuildings(rules, state, city).has(r.requiredBuilding)) {
      return `Requires a ${rules.building(r.requiredBuilding).name}.`;
    }
  }
  if (r.requiredGovernment && p.government !== r.requiredGovernment) return `Only under ${rules.government(r.requiredGovernment).name}.`;
  const missing = r.requiredResources.filter((x) => !resources.has(x));
  if (missing.length > 0) return `Requires ${missing.map((x) => rules.resources[rules.resourceIndex(x)]!.name).join(' and ')}.`;
  if (r.tags.includes('coastalInstallation') && !isCoastal(rules, state, city.tile)) return 'Needs a coastal city.';
  const area = cityRadiusTiles(state.map, city.tile);
  if (r.effects.includes('mustBeNearRiver') && !area.some((t) => state.map.rivers[t] !== 0)) return 'Needs a river in the city area.';
  if (r.effects.includes('mustBeNearWater') && !area.some((t) => state.map.rivers[t] !== 0 || rules.terrains[state.map.terrain[t]!]!.water))
    return 'Needs water in the city area.';
  if (r.effects.includes('allowsCitySize3') && sizeClass(rules, city.size) === 'town') return `Needs a city larger than ${rules.set.general.maxTownSize}.`;
  if (r.effects.includes('requiresVictoriousArmy')) return 'Needs a victorious army (combat arrives in Phase 3).';
  if (r.effects.includes('buildLargerArmies')) return 'Needs armies (Phase 3).';
  if (b.id.startsWith('ss')) return 'The space race arrives in Phase 6.';
  if (b.id === 'palace' && 'palace' in city.buildings) return 'Already the capital.';
  return null;
}

export interface BuildOption {
  build: Build;
  cost: number;
  blocker: string | null;
}

/** Every unit and building with whether this city can build it now. */
export function buildOptions(rules: Rules, state: GameState, city: City): BuildOption[] {
  const out: BuildOption[] = [];
  for (const u of rules.set.units) {
    if (!isCommonUnit(rules, u.id)) continue;
    const build: Build = { kind: 'unit', id: u.id };
    out.push({ build, cost: u.shieldCost, blocker: buildBlocker(rules, state, city, build) });
  }
  for (const b of rules.set.buildings) {
    const build: Build = { kind: 'building', id: b.id };
    out.push({ build, cost: b.cost, blocker: buildBlocker(rules, state, city, build) });
  }
  return out;
}

export type HurryQuote =
  | { kind: 'gold'; gold: number; remaining: number }
  | { kind: 'forcedLabor'; citizens: number; remaining: number }
  | { kind: 'none'; reason: string };

/**
 * Cost to finish the current build now. Gold: shieldCostInGold per missing shield for
 * units, half that for buildings, doubled when nothing has been put in yet. Forced
 * labour: one citizen per citizenValueInShields missing shields.
 */
export function hurryQuote(rules: Rules, state: GameState, city: City): HurryQuote {
  const p = state.players[city.owner]!;
  const gov = rules.government(p.government);
  if (!city.build) return { kind: 'none', reason: 'Nothing is being built.' };
  if (city.hurried) return { kind: 'none', reason: 'Already hurried this turn.' };
  const cat = buildCategory(rules, city.build);
  if (cat === 'wonder') return { kind: 'none', reason: 'Wonders cannot be hurried.' };
  if (city.build.kind === 'building' && rules.building(city.build.id).kind === 'wealth') return { kind: 'none', reason: 'Wealth cannot be hurried.' };
  const report = cityReport(rules, state, city);
  if (report.disorder) return { kind: 'none', reason: 'Not while the city is in disorder.' };
  const remaining = Math.max(0, buildCost(rules, city.build) - city.shields);
  if (remaining === 0) return { kind: 'none', reason: 'It completes this turn anyway.' };
  const g = rules.set.general;
  if (gov.hurry === 'gold') {
    const perShield = cat === 'unit' ? g.shieldCostInGold : Math.max(1, g.shieldCostInGold / 2);
    const gold = remaining * perShield * (city.shields === 0 ? 2 : 1);
    return { kind: 'gold', gold, remaining };
  }
  if (gov.hurry === 'forcedLabor') {
    const citizens = Math.ceil(remaining / Math.max(1, g.citizenValueInShields));
    if (citizens >= city.size) return { kind: 'none', reason: `Needs ${citizens} citizens; the city has ${city.size}.` };
    return { kind: 'forcedLabor', citizens, remaining };
  }
  return { kind: 'none', reason: `${gov.name} cannot hurry production.` };
}
