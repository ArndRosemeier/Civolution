/**
 * Empire-level helpers shared by the scripted players, the coming governors (PLAN.md
 * §8.1, §8.5) and the AI (§9): where to settle, what to build, what to research, how to
 * set the rates. Every function only proposes ordinary commands with a reason.
 */
import {
  buildBlocker,
  cityRadiusTiles,
  cityReport,
  distance,
  hasFreshWater,
  isCoastal,
  playerCities,
  playerUnits,
  researchableTechs,
  resourceVisibleTo,
  tilesInRadius,
  unitSupportCost,
  techCost,
  tileYield,
  type Build,
  type City,
  type Command,
  type GameState,
  type Rules,
} from '@civolution/engine';

/** How good a city site `tile` is for `player` (0 when it cannot be settled). */
export function siteScore(rules: Rules, state: GameState, player: number, tile: number): number {
  const m = state.map;
  const t = rules.terrains[m.terrain[tile]!]!;
  if (!t.canFoundCity || t.water) return 0;
  const owner = m.territory[tile]!;
  if (owner >= 0 && owner !== player) return 0;
  for (const c of Object.values(state.cities)) if (distance(m, c.tile, tile) < 4) return 0;
  let score = 0;
  for (const x of cityRadiusTiles(m, tile)) {
    const o = m.territory[x]!;
    if (o >= 0 && o !== player) continue;
    const y = tileYield(rules, state, x, (r) => resourceVisibleTo(rules, state, player, r));
    const terrain = rules.terrains[m.terrain[x]!]!;
    score += y.food.value * 3 + y.shields.value * 2 + y.commerce.value + (terrain.irrigationFood > 0 ? 1 : 0);
  }
  if (hasFreshWater(state, tile)) score += 12;
  if (isCoastal(rules, state, tile)) score += 6;
  if (t.id === 'hills') score += 4;
  return score;
}

/** Best site within `range` tiles of `from`, weighing travel. */
export function bestSite(rules: Rules, state: GameState, player: number, from: number, range = 10): number {
  const p = state.players[player]!;
  let best = -1;
  let bestScore = 0;
  const own = playerCities(state, player);
  for (const tile of tilesInRadius(state.map, from, range)) {
    const d = distance(state.map, from, tile);
    if (!((p.explored[tile >> 5]! >>> (tile & 31)) & 1)) continue;
    const base = siteScore(rules, state, player, tile);
    if (base <= 0) continue;
    // Prefer compact empires: close to existing cities, but not overlapping too much.
    const near = own.length === 0 ? 0 : Math.min(...own.map((c) => distance(state.map, c.tile, tile)));
    const score = base * 4 - d * 6 - (near > 6 ? (near - 6) * 10 : 0);
    if (score > bestScore || (score === bestScore && tile < best)) {
      best = tile;
      bestScore = score;
    }
  }
  return best;
}

export interface PlannedBuild {
  build: Build;
  reason: string;
}

/** Cities the empire aims for: room permitting, up to the optimal number. */
function wantsMoreCities(rules: Rules, state: GameState, player: number): boolean {
  const ws = rules.set.worldSizes.find((w) => w.id === state.settings.worldSize);
  const target = ws ? ws.optimalCities : 16;
  const cities = playerCities(state, player).length;
  const settlers = playerUnits(state, player).filter((u) => rules.unit(u.type).specialActions.includes('buildCity')).length;
  return cities + settlers < target;
}

const BUILDING_PRIORITY: { id: string; when: (r: ReturnType<typeof cityReport>, c: City) => boolean; why: string }[] = [
  { id: 'temple', when: (r) => r.unhappy > 0 || r.disorder, why: 'unhappy citizens' },
  { id: 'granary', when: (_r, c) => c.size >= 3, why: 'faster growth' },
  { id: 'library', when: () => true, why: 'more research' },
  { id: 'marketplace', when: (r) => r.commerceBase.value >= 6 || r.unhappy > 1, why: 'more gold and luxury' },
  { id: 'harbor', when: (r) => r.foodSurplus < 3, why: 'more food from the sea' },
  { id: 'aqueduct', when: (r, c) => c.size >= r.sizeLimit - 1, why: 'room to grow' },
  { id: 'courthouse', when: (r) => r.corruptionRate.value >= 30, why: 'heavy corruption' },
  { id: 'colosseum', when: (r) => r.unhappy > 1, why: 'unhappy citizens' },
  { id: 'cathedral', when: (r) => r.unhappy > 1, why: 'unhappy citizens' },
  { id: 'university', when: () => true, why: 'more research' },
  { id: 'bank', when: (r) => r.commerceBase.value >= 10, why: 'more gold' },
  { id: 'hospital', when: (r, c) => c.size >= r.sizeLimit - 1, why: 'room to grow' },
  { id: 'factory', when: (r) => r.shieldsBase.value >= 8, why: 'more production' },
  { id: 'coalPlant', when: () => true, why: 'more factory output' },
  { id: 'researchLab', when: () => true, why: 'more research' },
  { id: 'stockExchange', when: (r) => r.commerceBase.value >= 15, why: 'more gold' },
  { id: 'policeStation', when: (r) => r.corruptionRate.value >= 30, why: 'corruption' },
];

export interface PlanBuildOptions {
  /** Leave settlers out (the caller has enough on the way). */
  noSettlers?: boolean;
  /** Leave great wonders out. */
  noWonders?: boolean;
}

/** What a city should build next (simple priorities; the full governors come in Phase 5). */
export function planBuild(rules: Rules, state: GameState, city: City, opts: PlanBuildOptions = {}): PlannedBuild {
  const ok = (b: Build) => buildBlocker(rules, state, city, b) === null;
  const report = cityReport(rules, state, city);
  const defenders = Object.values(state.units).filter((u) => u.tile === city.tile && u.owner === city.owner && rules.unit(u.type).defence > 0);
  if (defenders.length === 0) {
    const best = rules.set.units
      .filter((u) => u.domain === 'land' && u.defence > 0 && ok({ kind: 'unit', id: u.id }))
      .sort((a, b) => b.defence - a.defence || a.shieldCost - b.shieldCost)[0];
    if (best) return { build: { kind: 'unit', id: best.id }, reason: 'No defender in the city' };
  }
  const settler = rules.set.units.find((u) => u.specialActions.includes('buildCity'));
  // Shields wait in the box until the city is big enough to give up the settlers.
  if (settler && !opts.noSettlers && report.foodSurplus >= 1 && wantsMoreCities(rules, state, city.owner) && ok({ kind: 'unit', id: settler.id })) {
    const settling = bestSite(rules, state, city.owner, city.tile, 12);
    if (settling >= 0) return { build: { kind: 'unit', id: settler.id }, reason: 'Room for another city nearby' };
    // No known site: send someone to look, unless someone already is.
    const exploring = playerUnits(state, city.owner).some((u) => u.routine === 'explore');
    const scout = rules.set.units
      .filter((u) => u.domain === 'land' && u.attack + u.defence > 0 && ok({ kind: 'unit', id: u.id }))
      .sort((a, b) => a.shieldCost - b.shieldCost || b.movement - a.movement)[0];
    if (!exploring && scout) return { build: { kind: 'unit', id: scout.id }, reason: 'Exploring for city sites' };
  }
  const cities = playerCities(state, city.owner).length;
  const workers = playerUnits(state, city.owner).filter((u) => rules.unit(u.type).jobs.length > 0).length;
  const worker = rules.set.units.find((u) => u.jobs.includes('road') && u.shieldCost > 0 && ok({ kind: 'unit', id: u.id }));
  if (worker && workers < Math.ceil(cities * 1.5)) return { build: { kind: 'unit', id: worker.id }, reason: 'Fewer workers than cities need' };
  for (const b of BUILDING_PRIORITY) {
    if (!rules.hasBuilding(b.id) || !ok({ kind: 'building', id: b.id })) continue;
    if (!b.when(report, city)) continue;
    return { build: { kind: 'building', id: b.id }, reason: `${rules.building(b.id).name}: ${b.why}` };
  }
  // Wonders in the capital when nothing else is needed.
  if ('palace' in city.buildings && !opts.noWonders) {
    // Wonders that hand out units every few turns would bury a builder in upkeep.
    const wonder = rules.set.buildings
      .filter((b) => b.kind === 'wonder' && !b.unitProduced && ok({ kind: 'building', id: b.id }))
      .sort((a, b) => a.cost - b.cost)[0];
    if (wonder) return { build: { kind: 'building', id: wonder.id }, reason: `${wonder.name}: nothing more urgent` };
  }
  return { build: { kind: 'building', id: 'wealth' }, reason: 'Nothing useful left to build' };
}

/** Research: governments first, then the cheapest advance, so eras advance steadily. */
export function planResearch(rules: Rules, state: GameState, player: number): string | null {
  const p = state.players[player]!;
  const options = researchableTechs(rules, p);
  if (options.length === 0) return null;
  const govTechs = new Set(rules.set.governments.map((g) => g.requiredTech).filter((t): t is string => !!t));
  const required = (t: string) => !rules.tech(t).flags.includes('notRequiredForEraAdvance');
  const score = (t: string) => techCost(rules, state, t, player) * (govTechs.has(t) ? 0.5 : required(t) ? 1 : 1.6);
  return [...options].sort((a, b) => score(a) - score(b) || a.localeCompare(b))[0]!;
}

/** Government to aim for, the best one known (simple ranking). */
export function planGovernment(rules: Rules, state: GameState, player: number): string | null {
  const p = state.players[player]!;
  const rank = ['democracy', 'republic', 'monarchy'];
  for (const g of rank) {
    const gov = rules.set.governments.find((x) => x.id === g);
    if (!gov) continue;
    if (gov.requiredTech && !p.techs.includes(gov.requiredTech)) continue;
    return p.government === g || p.revolution?.target === g ? null : g;
  }
  return null;
}

/** Rates: as much science as the treasury allows, luxury only against disorder. */
export function planRates(rules: Rules, state: GameState, player: number): { tax: number; science: number; luxury: number } {
  const p = state.players[player]!;
  const cap = Math.floor(rules.government(p.government).rateCap / 10);
  const cities = playerCities(state, player);
  const disorder = cities.some((c) => cityReport(rules, state, c).disorder);
  const luxury = disorder ? Math.min(cap, p.rates.luxury + 1) : Math.max(0, p.rates.luxury - 1);
  let science = Math.min(cap, 10 - luxury);
  // Keep a small cushion of gold.
  if (p.gold < 30 + cities.length * 5) science = Math.max(0, science - 2);
  let tax = 10 - luxury - science;
  if (tax > cap) {
    science += tax - cap;
    tax = cap;
  }
  return { tax, science, luxury };
}

/** All empire-level commands a simple player issues at the start of its turn. */
export function planEmpire(rules: Rules, state: GameState, player: number): Command[] {
  const out: Command[] = [];
  const p = state.players[player]!;
  const tech = planResearch(rules, state, player);
  if (tech && p.research.tech === null) out.push({ type: 'setResearch', player, tech, reason: 'Steady progress toward the next era' });
  const gov = planGovernment(rules, state, player);
  const revolt = gov !== null && !p.revolution && !rules.government(p.government).transitional;
  if (revolt) out.push({ type: 'revolution', player, government: gov, reason: `A better government is known: ${rules.government(gov).name}` });
  const rates = planRates(rules, state, player);
  if (!revolt && !rules.government(p.government).transitional && (rates.tax !== p.rates.tax || rates.science !== p.rates.science || rates.luxury !== p.rates.luxury))
    out.push({ type: 'setRates', player, rates, reason: 'Most science the treasury allows' });
  // Units cost gold beyond the free ones: disband those that are not guarding a city.
  const support = unitSupportCost(rules, state, player);
  if (support > 0) {
    const cityTiles = new Set(playerCities(state, player).map((c) => c.tile));
    const guarded = new Set<number>();
    const spare = playerUnits(state, player).filter((u) => {
      const r = rules.unit(u.type);
      if (r.attack + r.defence === 0) return false;
      if (cityTiles.has(u.tile) && !guarded.has(u.tile)) {
        guarded.add(u.tile);
        return false;
      }
      return true;
    });
    const perUnit = Math.max(1, rules.government(p.government).unitCost);
    for (const u of spare.slice(0, Math.ceil(support / perUnit)))
      out.push({ type: 'disband', player, unit: u.id, reason: 'Unit upkeep: not needed to guard a city' });
  }
  for (const c of playerCities(state, player)) {
    // Buildings in progress are kept; units and Wealth are reconsidered every turn.
    if (c.build?.kind === 'building' && c.build.id !== 'wealth' && buildBlocker(rules, state, c, c.build) === null) continue;
    const plan = planBuild(rules, state, c);
    if (c.build && c.build.kind === plan.build.kind && c.build.id === plan.build.id) continue;
    out.push({ type: 'setBuild', player, city: c.id, build: plan.build, reason: plan.reason });
  }
  return out;
}

