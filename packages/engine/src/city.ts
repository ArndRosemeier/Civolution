/**
 * Everything a city produces, with the reasons (PLAN.md §10.2: every number explains
 * itself). One pure function, `cityReport`, feeds both the end of turn and the city
 * screen, so what the player is shown is exactly what happens.
 *
 * Rules: docs/rules/cities.md (tiles, growth), production.md, corruption.md,
 * happiness.md, science.md, culture.md.
 */
import { registerCache } from './caches.ts';
import { yearsBetween } from './calendar.ts';
import { connectedToCapital, empireInfo, cityResources, type EmpireInfo } from './empire.ts';
import { neighbours } from './grid.ts';
import { hasFreshWaterAccess, unitsAt } from './queries.ts';
import type { Rules } from './rules.ts';
import { FLAG_LAKE, IMP_IRRIGATION, IMP_MINE, type City, type GameState } from './state.ts';
import { cityAt, cityRadiusTiles } from './territory.ts';
import { tileYield, resourceVisibleTo, type Explained, type Part } from './yields.ts';
import { wearinessFaces } from './war.ts';
import { civOf, inGoldenAge, INDUSTRIOUS_CITY_SIZE } from './civs.ts';
import { pollutionPoints } from './pollution.ts';

export type SizeClass = 'town' | 'city' | 'metropolis';

export function sizeClass(rules: Rules, size: number): SizeClass {
  const g = rules.set.general;
  return size <= g.maxTownSize ? 'town' : size <= g.maxCitySize ? 'city' : 'metropolis';
}

/** Food needed to grow from `size` to `size + 1` (docs/rules/cities.md). */
export function foodBox(_rules: Rules, size: number): number {
  return 10 * (size + 1);
}

function explained(parts: Part[], floorAtZero = true): Explained {
  const raw = parts.reduce((a, p) => a + p.amount, 0);
  return { value: floorAtZero ? Math.max(0, raw) : raw, parts: parts.filter((p) => p.amount !== 0) };
}

/** Buildings the city effectively has: its own plus those wonders grant it. */
export function effectiveBuildings(rules: Rules, state: GameState, city: City): Set<string> {
  return empireInfo(rules, state, city.owner).effective.get(city.id) ?? new Set(Object.keys(city.buildings));
}

function countEffect(rules: Rules, have: Set<string>, effect: string): number {
  let n = 0;
  for (const b of have) if (rules.building(b).effects.includes(effect)) n++;
  return n;
}

export function isCoastal(rules: Rules, state: GameState, tile: number): boolean {
  return neighbours(state.map, tile).some((t) => rules.terrains[state.map.terrain[t]!]!.water);
}

/** Fresh water next to the city: a river on its tile or an adjacent lake. */
export function hasFreshWater(state: GameState, tile: number): boolean {
  if (state.map.rivers[tile] !== 0) return true;
  return neighbours(state.map, tile).some((t) => (state.map.flags[t]! & FLAG_LAKE) !== 0);
}

/** Largest size the city can reach with what it has. */
export function sizeLimit(rules: Rules, state: GameState, city: City, have = effectiveBuildings(rules, state, city)): number {
  const g = rules.set.general;
  if (countEffect(rules, have, 'allowsCitySize3') > 0) return Infinity;
  if (countEffect(rules, have, 'allowsCitySize2') > 0 || hasFreshWater(state, city.tile)) return g.maxCitySize;
  return g.maxTownSize;
}

/** Tiles this city may work: its work area inside its owner's borders, not taken by another city or foreign units. */
export function workableTiles(_rules: Rules, state: GameState, city: City): number[] {
  const out: number[] = [];
  const takenBy = workedByOthers(state, city);
  for (const t of cityRadiusTiles(state.map, city.tile)) {
    if (t === city.tile) continue;
    if (state.map.territory[t] !== city.owner) continue;
    if (takenBy.has(t)) continue;
    if (cityAt(state, t)) continue;
    if (unitsAt(state, t).some((u) => u.owner !== city.owner)) continue;
    out.push(t);
  }
  return out;
}

const workedCache = new WeakMap<GameState['cities'], Map<number, number>>();
registerCache((s) => workedCache.delete(s.cities));

/** Tile → city working it, across all cities. */
export function workedTiles(state: GameState): Map<number, number> {
  let m = workedCache.get(state.cities);
  if (!m) {
    m = new Map();
    for (const c of Object.values(state.cities)) {
      m.set(c.tile, c.id);
      for (const t of c.worked) m.set(t, c.id);
    }
    workedCache.set(state.cities, m);
  }
  return m;
}

function workedByOthers(state: GameState, city: City): Set<number> {
  const out = new Set<number>();
  for (const [t, id] of workedTiles(state)) if (id !== city.id) out.add(t);
  return out;
}

export interface TileOutput {
  food: Explained;
  shields: Explained;
  commerce: Explained;
}

/** What a tile yields when this city works it: terrain, improvements, government and buildings. */
export function cityTileYield(rules: Rules, state: GameState, city: City, tile: number, have = effectiveBuildings(rules, state, city)): TileOutput {
  const base = tileYield(rules, state, tile, (r) => resourceVisibleTo(rules, state, city.owner, r));
  const food = [...base.food.parts];
  const shields = [...base.shields.parts];
  const commerce = [...base.commerce.parts];
  const t = rules.terrains[state.map.terrain[tile]!]!;
  const water = t.water;
  const sum = (ps: Part[]) => ps.reduce((a, p) => a + p.amount, 0);

  if (tile === city.tile) {
    const imp = state.map.improvements[tile]!;
    // The city tile counts as irrigated where the terrain allows it, and has a road.
    if (t.irrigationFood > 0 && !(imp & IMP_IRRIGATION) && !(imp & IMP_MINE)) food.push({ label: 'City (irrigated)', amount: t.irrigationFood });
    if (!(imp & 1) && t.roadCommerce > 0) commerce.push({ label: 'City (road)', amount: t.roadCommerce });
    if (sum(shields) < 1) shields.push({ label: 'City (at least 1 shield)', amount: 1 - sum(shields) });
  }
  if (water) {
    if (countEffect(rules, have, 'increasesFoodInWater') > 0) food.push({ label: 'Harbor', amount: 1 });
    if (countEffect(rules, have, 'increasesShieldsInWater') > 0) shields.push({ label: 'Offshore Platform', amount: 1 });
    if (countEffect(rules, have, 'increasesCommerceInWater') > 0 && sum(commerce) >= 1) commerce.push({ label: 'Commercial Dock', amount: 1 });
  }
  if (countEffect(rules, have, 'plusOneTradePerTile') > 0 && sum(commerce) >= 1) commerce.push({ label: 'Colossus', amount: 1 });

  const owner = state.players[city.owner]!;
  const gov = rules.government(owner.government);
  if (gov.commerceBonus && sum(commerce) >= 1) commerce.push({ label: gov.name, amount: 1 });
  if (gov.tilePenalty && !city.celebrating) {
    for (const ps of [food, shields, commerce]) if (sum(ps) > 2) ps.push({ label: `${gov.name} penalty`, amount: -1 });
  }
  // Civilization traits and golden ages (docs/rules/civilizations.md, golden-ages.md).
  const traits = civOf(rules, owner)?.traits ?? [];
  if (traits.includes('commercial') && sum(commerce) >= 2) commerce.push({ label: 'Commercial', amount: 1 });
  if (tile === city.tile) {
    if (traits.includes('agricultural') && !water) food.push({ label: 'Agricultural', amount: 1 });
    if (traits.includes('industrious') && city.size >= INDUSTRIOUS_CITY_SIZE) shields.push({ label: 'Industrious', amount: 1 });
  }
  if (inGoldenAge(state, city.owner)) {
    if (sum(shields) >= 1) shields.push({ label: 'Golden age', amount: 1 });
    if (sum(commerce) >= 1) commerce.push({ label: 'Golden age', amount: 1 });
  }
  return { food: explained(food), shields: explained(shields), commerce: explained(commerce) };
}

export interface MoodStep {
  label: string;
  happy: number;
  content: number;
  unhappy: number;
}

export interface CityReport {
  sizeClass: SizeClass;
  sizeLimit: number;
  tiles: { tile: number; food: number; shields: number; commerce: number }[];
  laborers: number;
  specialists: number;
  food: Explained;
  foodEaten: number;
  foodSurplus: number;
  foodBox: number;
  /** Turns to grow (positive), to starve (negative), or null when stalled. */
  growth: number | null;
  /** Shields before waste and bonuses. */
  shieldsBase: Explained;
  waste: Explained;
  /** Shields added to the build this turn. */
  shields: Explained;
  commerceBase: Explained;
  corruption: Explained;
  /** Corruption and waste rate, in percent. */
  corruptionRate: Explained;
  tax: Explained;
  science: Explained;
  luxury: Explained;
  culture: Explained;
  upkeep: Explained;
  /** Pollution points: the chance of a polluted tile this turn is a few percent per point (docs/rules/pollution.md). */
  pollution: Explained;
  /** Citizens resisting a conqueror; the city produces nothing while any resist. */
  resisters: number;
  moods: MoodStep[];
  happy: number;
  content: number;
  unhappy: number;
  disorder: boolean;
  celebrating: boolean;
  /** Resources the city can use. */
  resources: string[];
}

/** Corruption and waste rate of a city in percent, with its parts (docs/rules/corruption.md). */
export function corruptionRate(rules: Rules, state: GameState, city: City, info: EmpireInfo = empireInfo(rules, state, city.owner), have = effectiveBuildings(rules, state, city)): Explained {
  const p = state.players[city.owner]!;
  const gov = rules.government(p.government);
  if (info.capital?.id === city.id) return { value: 0, parts: [{ label: 'Palace: no corruption in the capital', amount: 0 }] };
  const parts: Part[] = [];
  const level = gov.corruption;
  if (level === 'off') return { value: 0, parts: [{ label: `${gov.name}: no corruption`, amount: 0 }] };
  if (level === 'catastrophic') parts.push({ label: `${gov.name}: catastrophic corruption`, amount: 90 });
  else if (level === 'communal') parts.push({ label: `${gov.name}: the same everywhere`, amount: 30 });
  else {
    const maxDist = Math.max(1, (state.map.width + state.map.height) >> 2);
    const connected = connectedToCapital(info, city);
    const rawDist = info.seatDistance.get(city.id) ?? Infinity;
    const dist = !connected || !Number.isFinite(rawDist) ? maxDist : Math.min(maxDist, rawDist);
    const rank = info.rank.get(city.id) ?? 0;
    const distPart = level === 'minimal' ? 0 : Math.floor((50 * dist) / maxDist);
    const rankPart = Math.floor((50 * Math.min(rank, info.ocn)) / info.ocn) + (rank > info.ocn ? Math.floor((50 * (rank - info.ocn)) / info.ocn) : 0);
    const base = Math.min(100, distPart + rankPart);
    const scale = { minimal: 40, nuisance: 60, problematic: 75, rampant: 90 }[level];
    const distLabel = connected ? `Distance ${Number.isFinite(rawDist) ? rawDist : '—'} to the seat of government` : 'Not connected to the capital';
    if (distPart > 0) parts.push({ label: distLabel, amount: Math.floor((distPart * scale) / 100) });
    if (rankPart > 0) parts.push({ label: `Rank ${rank} of ${info.ocn} optimal cities`, amount: Math.floor((rankPart * scale) / 100) });
    if (base === 0) parts.push({ label: 'Close to the seat of government', amount: 0 });
  }
  const diff = rules.difficulty(state.difficulty);
  let total = parts.reduce((a, x) => a + x.amount, 0);
  if (diff.corruptionPercent !== 100) {
    const adj = Math.floor((total * diff.corruptionPercent) / 100) - total;
    parts.push({ label: `${diff.name} difficulty`, amount: adj });
    total += adj;
  }
  for (const b of have) {
    const rule = rules.building(b);
    if (!rule.effects.includes('reducesCorruption') || rule.kind !== 'improvement') continue;
    const cut = Math.floor((total * (b === 'courthouse' ? 50 : 25)) / 100);
    parts.push({ label: rule.name, amount: -cut });
    total -= cut;
  }
  for (const [s, n] of Object.entries(city.specialists)) {
    const spec = rules.specialist(s);
    if (spec.corruption <= 0 || n <= 0) continue;
    const cut = Math.min(total, Math.floor((total * 10 * spec.corruption * n) / 100));
    parts.push({ label: `${n} ${n === 1 ? spec.name : spec.pluralName}`, amount: -cut });
    total -= cut;
  }
  return explained(parts);
}

/** Years a tourist-attraction wonder must stand before it earns gold (docs/rules/wonders.md). */
export const TOURIST_YEARS = 2000;

/** Luxury-resource happy faces with and without a Marketplace (Civilopedia table). */
const MARKET_LUXURY = [0, 1, 2, 4, 6, 9, 12, 16, 20];

/** Reports already worked out for a state, per city object (a changed city is a new object). */
const reportCache = new WeakMap<GameState, WeakMap<City, CityReport>>();
registerCache((s) => reportCache.delete(s));

/** Everything about a city this turn, explained; cached per state and city object, so treat it as read-only. */
export function cityReport(rules: Rules, state: GameState, city: City): CityReport {
  let reports = reportCache.get(state);
  if (!reports) reportCache.set(state, (reports = new WeakMap()));
  let report = reports.get(city);
  if (!report) reports.set(city, (report = computeCityReport(rules, state, city)));
  return report;
}

function computeCityReport(rules: Rules, state: GameState, city: City): CityReport {
  const p = state.players[city.owner]!;
  const gov = rules.government(p.government);
  const g = rules.set.general;
  const info = empireInfo(rules, state, city.owner);
  const have = info.effective.get(city.id) ?? new Set(Object.keys(city.buildings));
  const has = (effect: string) => countEffect(rules, have, effect);

  // Tiles.
  const tiles = [city.tile, ...city.worked].map((t) => {
    const y = cityTileYield(rules, state, city, t, have);
    return { tile: t, food: y.food.value, shields: y.shields.value, commerce: y.commerce.value };
  });
  const tileSum = (k: 'food' | 'shields' | 'commerce') => tiles.reduce((a, t) => a + t[k], 0);
  const specialistCount = Object.values(city.specialists).reduce((a, n) => a + n, 0);
  const specialistSum = (k: 'luxury' | 'science' | 'gold' | 'shields') =>
    Object.entries(city.specialists).reduce((a, [s, n]) => a + rules.specialist(s)[k] * n, 0);

  // Food.
  const food = explained([{ label: 'City tile', amount: tiles[0]!.food }, { label: `${city.worked.length} worked tiles`, amount: tileSum('food') - tiles[0]!.food }]);
  const eaten = city.size * g.foodPerCitizen;
  const box = foodBox(rules, city.size);
  const limit = sizeLimit(rules, state, city, have);

  // Corruption and waste.
  const rate = corruptionRate(rules, state, city, info, have);
  const shieldsBase = explained([{ label: 'Worked tiles', amount: tileSum('shields') }]);
  const commerceBase = explained([{ label: 'Worked tiles', amount: tileSum('commerce') }]);
  let wasteRate = rate.value;
  const wasteParts: Part[] = [];
  const corruptionParts: Part[] = [];
  if (city.celebrating && wasteRate > 0) wasteRate = Math.floor(wasteRate / 2);
  const waste = Math.floor((shieldsBase.value * wasteRate) / 100);
  wasteParts.push({ label: `${wasteRate} % waste`, amount: waste });
  const corrupt = Math.floor((commerceBase.value * rate.value) / 100);
  corruptionParts.push({ label: `${rate.value} % corruption`, amount: corrupt });

  // Production.
  const prodParts: Part[] = [{ label: 'Worked tiles', amount: shieldsBase.value }];
  if (waste > 0) prodParts.push({ label: 'Waste', amount: -waste });
  const afterWaste = shieldsBase.value - waste;
  const building = city.build?.kind === 'building' ? rules.building(city.build.id) : null;
  const engineers = specialistSum('shields');
  if (engineers > 0 && building) prodParts.push({ label: 'Civil engineers', amount: engineers });
  const factoryChain = [...have].filter((b) => {
    const r = rules.building(b);
    return r.kind === 'improvement' && r.productionPercent > 0 && !r.effects.includes('replacesOtherBuildings');
  });
  const factoryPct = factoryChain.reduce((a, b) => a + rules.building(b).productionPercent, 0);
  const prodBase = afterWaste + (building ? engineers : 0);
  for (const b of factoryChain) prodParts.push({ label: rules.building(b).name, amount: Math.floor((prodBase * rules.building(b).productionPercent) / 100) });
  if (factoryChain.includes('factory')) {
    const plant = [...have]
      .filter((b) => rules.building(b).effects.includes('replacesOtherBuildings'))
      .sort((a, b) => rules.building(b).productionPercent - rules.building(a).productionPercent)[0];
    if (plant) prodParts.push({ label: rules.building(plant).name, amount: Math.floor((Math.floor((prodBase * factoryPct) / 100) * rules.building(plant).productionPercent) / 100) });
  }
  for (const b of have) {
    const r = rules.building(b);
    if (r.kind === 'smallWonder' && r.productionPercent > 0) prodParts.push({ label: r.name, amount: Math.floor((prodBase * r.productionPercent) / 100) });
  }

  // Commerce split.
  const netCommerce = commerceBase.value - corrupt;
  const rates = gov.transitional ? { tax: 0, science: 0, luxury: 10 } : p.rates;
  const luxBase = Math.floor((netCommerce * rates.luxury) / 10);
  const sciBase = Math.floor((netCommerce * rates.science) / 10);
  const taxBase = netCommerce - luxBase - sciBase;
  const taxParts: Part[] = [{ label: `${rates.tax * 10} % of ${netCommerce} commerce`, amount: taxBase }];
  const sciParts: Part[] = [{ label: `${rates.science * 10} % of ${netCommerce} commerce`, amount: sciBase }];
  const luxParts: Part[] = [{ label: `${rates.luxury * 10} % of ${netCommerce} commerce`, amount: luxBase }];
  const specGold = specialistSum('gold');
  const specSci = specialistSum('science');
  const specLux = specialistSum('luxury');
  if (specGold) taxParts.push({ label: 'Tax collectors', amount: specGold });
  if (specSci) sciParts.push({ label: 'Scientists', amount: specSci });
  if (specLux) luxParts.push({ label: 'Entertainers', amount: specLux });
  const addPercent = (parts: Part[], label: string, pct: number) => {
    const base = parts.reduce((a, x) => a + x.amount, 0);
    const amount = Math.floor((base * pct) / 100);
    if (amount !== 0) parts.push({ label, amount });
  };
  for (const b of have) {
    const r = rules.building(b);
    if (r.effects.includes('tax50')) addPercent(taxParts, r.name, 50);
  }
  {
    const base = sciParts.reduce((a, x) => a + x.amount, 0);
    for (const b of have) {
      const r = rules.building(b);
      if (r.effects.includes('research50')) sciParts.push({ label: r.name, amount: Math.floor((base * 50) / 100) });
      if (r.effects.includes('doublesResearch') && b in city.buildings) sciParts.push({ label: r.name, amount: base });
    }
  }
  for (const b of have) {
    const r = rules.building(b);
    if (r.effects.includes('increasesLuxuryTrade')) addPercent(luxParts, r.name, 50);
  }
  let tax = explained(taxParts);
  let science = explained(sciParts);
  let luxury = explained(luxParts);
  if (gov.transitional) science = { value: 0, parts: [{ label: `${gov.name}: no research`, amount: 0 }] };

  // Moods (docs/rules/happiness.md).
  const moods: MoodStep[] = [];
  const laborers = city.size - specialistCount;
  const diff = rules.difficulty(state.difficulty);
  const sizePenalty = Math.floor(info.cities.length / Math.max(1, info.ocn));
  const contentBase = Math.max(0, diff.contentCitizens - sizePenalty);
  let content = Math.min(laborers, contentBase);
  let unhappy = laborers - content;
  let happy = 0;
  moods.push({ label: sizePenalty > 0 ? `Born content (${diff.name}, ${sizePenalty} fewer for empire size)` : `Born content (${diff.name})`, happy, content, unhappy });
  const weary = Math.min(content, wearinessFaces(rules, state, city, have));
  if (weary > 0) {
    content -= weary;
    unhappy += weary;
    moods.push({ label: 'War weariness', happy, content, unhappy });
  }
  if (city.forcedLabor.length > 0) {
    const n = Math.min(content, city.forcedLabor.length);
    content -= n;
    unhappy += n;
    moods.push({ label: 'Forced labour', happy, content, unhappy });
  }
  const applyHappy = (faces: number, label: string) => {
    if (faces <= 0) return;
    let f = faces;
    const toHappy = Math.min(f, content);
    content -= toHappy;
    happy += toHappy;
    f -= toHappy;
    // Left-over faces work on unhappy citizens: two faces make an unhappy citizen happy, one makes it content.
    while (f > 0 && unhappy > 0) {
      unhappy--;
      if (f >= 2) {
        happy++;
        f -= 2;
      } else {
        content++;
        f -= 1;
      }
    }
    moods.push({ label, happy, content, unhappy });
  };
  const applyContent = (faces: number, label: string) => {
    if (faces <= 0) return;
    const n = Math.min(faces, unhappy);
    if (n === 0) return;
    unhappy -= n;
    content += n;
    moods.push({ label, happy, content, unhappy });
  };
  const resources = cityResources(info, city);
  const luxuryTypes = [...resources].filter((r) => rules.resources[rules.resourceIndex(r)]!.kind === 'luxury').length;
  const market = has('increasesLuxuryTrade') > 0;
  const luxuryFaces = market ? (MARKET_LUXURY[Math.min(luxuryTypes, 8)] ?? 0) + Math.max(0, luxuryTypes - 8) * 4 : luxuryTypes;
  applyHappy(luxuryFaces, `${luxuryTypes} luxury resource${luxuryTypes === 1 ? '' : 's'}${market ? ' (Marketplace)' : ''}`);
  applyHappy(luxury.value, `${luxury.value} luxury`);
  // Buildings and wonders.
  let buildingFaces = 0;
  for (const b of have) {
    const r = rules.building(b);
    if (r.contentFaces <= 0) continue;
    if (r.kind === 'wonder' && !(b in city.buildings)) continue;
    const doubled = [...info.activeWonders].some((w) => rules.building(w).doublesContentOf === b);
    buildingFaces += r.contentFaces * (doubled ? 2 : 1);
  }
  applyContent(buildingFaces, 'Buildings');
  let wonderFaces = 0;
  for (const w of info.activeWonders) {
    const r = rules.building(w);
    if (r.contentFacesElsewhere <= 0 || w in city.buildings) continue;
    if (r.continental) {
      const holder = info.cities.find((c) => w in c.buildings);
      if (!holder || info.continent.get(holder.id) !== info.continent.get(city.id)) continue;
    }
    wonderFaces += r.contentFacesElsewhere;
  }
  applyContent(wonderFaces, 'Wonders elsewhere');
  if (gov.militaryPoliceLimit > 0) {
    const police = unitsAt(state, city.tile).filter((u) => u.owner === city.owner && rules.unit(u.type).attack > 0).length;
    applyContent(Math.min(police, gov.militaryPoliceLimit), 'Military police');
  }

  const disorder = unhappy > happy;
  const surplus = food.value - eaten;
  const celebrating = !disorder && unhappy === 0 && happy > content && city.size >= g.celebrationMinimumSize && surplus >= 0;

  // Disorder, and resistance in a conquered city, stop production, income and growth.
  let shields = explained(prodParts);
  let foodSurplus = surplus;
  const halted = disorder ? 'Civil disorder' : city.resisters > 0 ? `${city.resisters} resisting` : null;
  if (halted) {
    shields = { value: 0, parts: [...shields.parts, { label: halted, amount: -shields.value }] };
    tax = { value: 0, parts: [...tax.parts, { label: halted, amount: -tax.value }] };
    science = { value: 0, parts: [...science.parts, { label: halted, amount: -science.value }] };
    luxury = { value: 0, parts: [...luxury.parts, { label: halted, amount: -luxury.value }] };
    foodSurplus = Math.min(0, surplus);
  }
  if (city.build?.kind === 'building' && rules.building(city.build.id).kind === 'wealth') {
    // Wealth turns the shields into gold instead.
    const perGold = rules.set.general.shieldValueInGold / (p.techs.some((t) => rules.tech(t).flags.includes('doublesWealth')) ? 2 : 1);
    const gold = Math.floor(shields.value / Math.max(1, perGold));
    tax = explained([...tax.parts, { label: 'Wealth', amount: gold }]);
  }

  // Culture per turn: doubled for buildings standing 1000 years or more.
  const cultureParts: Part[] = [];
  for (const [b, built] of Object.entries(city.buildings)) {
    const r = rules.building(b);
    if (r.culture <= 0) continue;
    const age = yearsBetween(rules, built, state.turn);
    const old = age >= 1000;
    cultureParts.push({ label: old ? `${r.name} (over 1000 years)` : r.name, amount: r.culture * (old ? 2 : 1) });
    // A wonder that draws visitors earns its culture again as gold once it is 2000 years old.
    if (r.effects.includes('touristAttraction') && age >= TOURIST_YEARS && !halted) tax = explained([...tax.parts, { label: `${r.name} visitors`, amount: r.culture * 2 }]);
  }

  // Building upkeep.
  const upkeepParts: Part[] = [];
  if (gov.buildingUpkeep) {
    const smith = [...info.activeWonders].some((w) => rules.building(w).effects.includes('paysTradeMaintenance'));
    for (const b of Object.keys(city.buildings)) {
      const r = rules.building(b);
      if (r.upkeep <= 0) continue;
      if (smith && r.tags.includes('tradeInstallation') && r.upkeep === 1) continue;
      upkeepParts.push({ label: r.name, amount: r.upkeep });
    }
  }

  let growth: number | null = null;
  if (foodSurplus > 0 && city.size < limit) growth = Math.max(1, Math.ceil((box - city.food) / foodSurplus));
  else if (foodSurplus < 0) growth = -Math.max(1, Math.floor(city.food / -foodSurplus) + 1);

  return {
    sizeClass: sizeClass(rules, city.size),
    sizeLimit: limit,
    tiles,
    laborers,
    specialists: specialistCount,
    food,
    foodEaten: eaten,
    foodSurplus,
    foodBox: box,
    growth,
    shieldsBase,
    waste: explained(wasteParts),
    shields,
    commerceBase,
    corruption: explained(corruptionParts),
    corruptionRate: rate,
    tax,
    science,
    luxury,
    culture: explained(cultureParts),
    upkeep: explained(upkeepParts),
    pollution: pollutionPoints(rules, state, city, have, shields.value),
    resisters: city.resisters,
    moods,
    happy,
    content,
    unhappy,
    disorder,
    celebrating,
    resources: [...resources].sort(),
  };
}

/** Whether the city's tile has fresh water access for irrigation purposes (re-exported for the UI). */
export function cityHasFreshWaterAccess(state: GameState, city: City): boolean {
  return hasFreshWaterAccess(state, city.tile, IMP_IRRIGATION);
}
