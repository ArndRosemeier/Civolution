/**
 * City and empire commands, and the city part of the end of turn
 * (docs/rules/cities.md, production.md, science.md, governments.md, culture.md).
 */
import { cityReport, foodBox, sizeLimit, workableTiles } from './city.ts';
import type { Command, CommandError } from './commands.ts';
import { empireInfo } from './empire.ts';
import { distance, tileCount, tilesInRadius } from './grid.ts';
import { avoidDisorder, defaultSpecialist, placeCitizens } from './governor.ts';
import { checkWonderGoldenAge, hasTrait, nextCityName, SCIENTIFIC_LEADER_PERCENT } from './civs.ts';
import { maybeMeltdown, rollPollution } from './pollution.ts';
import { addSpaceshipPart } from './space.ts';
import { addVictoryPoints } from './victory.ts';
import { bearLeader } from './war.ts';
import { buildBlocker, buildCategory, buildCost, draftBlocker, draftedThisTurn, draftUnit, hurryQuote } from './production.ts';
import { knowsTech } from './queries.ts';
import type { Rules } from './rules.ts';
import { eraFor, researchableTechs, researchBlocker, techCost } from './science.ts';
import { IMP_ROAD, type Build, type City, type GameState, type Unit } from './state.ts';
import { borderRadius, cityAt, computeTerritory, playerCities } from './territory.ts';
import type { Tx } from './tx.ts';
import { newUnit } from './units.ts';
import { reveal } from './vision.ts';

type Fail = { error: CommandError };
const fail = (code: CommandError['code'], message: string): Fail => ({ error: { code, message } });

/** Why `u` cannot found a city where it stands, or null. */
export function foundBlocker(rules: Rules, state: GameState, u: Unit): string | null {
  const rule = rules.unit(u.type);
  if (!rule.specialActions.includes('buildCity')) return `${rule.name} cannot found cities.`;
  if (u.movesLeft <= 0) return 'No movement left this turn.';
  return siteBlocker(rules, state, u.owner, u.tile);
}

/** Why `owner` cannot have a city on `tile` (terrain, borders, spacing), or null. */
export function siteBlocker(rules: Rules, state: GameState, owner: number, tile: number): string | null {
  const t = rules.terrains[state.map.terrain[tile]!]!;
  if (!t.canFoundCity) return `Cities cannot be founded on ${t.name}.`;
  const holder = state.map.territory[tile]!;
  if (holder >= 0 && holder !== owner) return 'This land lies inside another civilization’s borders.';
  for (const c of Object.values(state.cities)) {
    if (distance(state.map, c.tile, tile) < 2) return `Too close to ${c.name}; cities need at least one tile between them.`;
  }
  return null;
}

export function newCity(rules: Rules, state: GameState, owner: number, tile: number, name: string): Omit<City, 'id'> {
  return {
    owner,
    name,
    tile,
    size: 1,
    food: 0,
    shields: 0,
    build: rules.hasUnit('warrior') ? { kind: 'unit', id: 'warrior' } : null,
    queue: [],
    shieldsFor: null,
    buildings: {},
    worked: [],
    specialists: {},
    manualTiles: false,
    culture: 0,
    founded: state.turn,
    disorder: 0,
    celebrating: false,
    forcedLabor: [],
    hurried: false,
    wonderUnitTimer: 0,
    capturedOn: null,
    airliftedOn: 0,
    nationality: owner,
    resisters: 0,
  };
}

/** Re-places a city's citizens (respecting manual placement as far as possible). */
export function replaceCitizens(rules: Rules, tx: Tx, cityId: number): void {
  const c = tx.state.cities[cityId]!;
  const manualSpecialists = c.manualTiles ? Object.values(c.specialists).reduce((a, n) => a + n, 0) : 0;
  const laborers = Math.max(0, c.size - Math.min(manualSpecialists, c.size));
  let placement = placeCitizens(rules, tx.state, c, c.manualTiles ? c.worked : [], laborers);
  if (!c.manualTiles) placement = avoidDisorder(rules, tx.state, c, placement);
  const city = tx.city(cityId);
  city.worked = placement.worked;
  if (c.manualTiles) {
    // Keep the player's specialists; trim them when the city shrank, top up with entertainers.
    const specialists: Record<string, number> = {};
    let left = c.size - placement.worked.length;
    for (const [s, n] of Object.entries(c.specialists).sort((a, b) => a[0].localeCompare(b[0]))) {
      const k = Math.min(n, left);
      if (k > 0) specialists[s] = k;
      left -= k;
    }
    if (left > 0) specialists[defaultSpecialist(rules)] = (specialists[defaultSpecialist(rules)] ?? 0) + left;
    city.specialists = specialists;
  } else {
    city.specialists = placement.specialists;
  }
}

/** Recomputes borders; re-places citizens of cities that lost tiles and reveals new territory. */
export function updateTerritory(rules: Rules, tx: Tx): void {
  const next = computeTerritory(rules, tx.state);
  const cur = tx.state.map.territory;
  let changed = false;
  for (let i = 0; i < next.length; i++) if (next[i] !== cur[i]) {
    changed = true;
    break;
  }
  if (!changed) return;
  const arr = tx.mapArray('territory');
  for (let i = 0; i < next.length; i++) arr[i] = next[i]!;
  for (const c of Object.values(tx.state.cities).sort((a, b) => a.id - b.id)) {
    if (c.worked.some((t) => tx.state.map.territory[t] !== c.owner)) replaceCitizens(rules, tx, c.id);
  }
  // Players always see their own territory.
  const byPlayer = new Map<number, number[]>();
  next.forEach((p, t) => {
    if (p < 0) return;
    const list = byPlayer.get(p);
    if (list) list.push(t);
    else byPlayer.set(p, [t]);
  });
  for (const [p, tiles] of [...byPlayer.entries()].sort((a, b) => a[0] - b[0])) reveal(tx, p, tiles);
}

function foundCity(rules: Rules, tx: Tx, u: Unit, name?: string): void {
  tx.removeUnit(u.id);
  foundCityAt(rules, tx, u.owner, u.tile, name);
}

/** A new city for `owner` on `tile` (already checked with siteBlocker); returns its id. */
export function foundCityAt(rules: Rules, tx: Tx, owner: number, tile: number, name?: string): number {
  const mine = playerCities(tx.state, owner);
  const cityName = name?.trim() || nextCityName(rules, tx.state, owner);
  const city = tx.addCity(newCity(rules, tx.state, owner, tile, cityName));
  // The first city becomes the capital.
  if (!mine.some((c) => 'palace' in c.buildings) && rules.hasBuilding('palace')) tx.city(city.id).buildings.palace = tx.state.turn;
  const imp = tx.mapArray('improvements');
  imp[tile] = imp[tile]! | IMP_ROAD;
  tx.emit({ type: 'cityFounded', city: city.id, player: owner, tile, name: cityName });
  updateTerritory(rules, tx);
  reveal(tx, owner, tilesInRadius(tx.state.map, tile, 2));
  replaceCitizens(rules, tx, city.id);
  return city.id;
}

function ownCity(state: GameState, cmd: { player: number; city: number }): City | Fail {
  const c = state.cities[cmd.city];
  if (!c) return fail('unknownCity', `No city ${cmd.city}.`);
  if (c.owner !== cmd.player) return fail('notYourCity', 'That city belongs to another player.');
  return c;
}

const isFail = (x: unknown): x is Fail => typeof x === 'object' && x !== null && 'error' in x;

/** Switches the build; the shields in the box are kept whatever the new build (docs/rules/production.md). */
function switchBuild(rules: Rules, tx: Tx, cityId: number, build: Build | null): void {
  const c = tx.city(cityId);
  c.build = build;
  if (!build) return;
  c.shieldsFor = c.shields > 0 ? buildCategory(rules, build) : null;
}

/** Handles the city and empire commands; returns an error, or null after applying. */
export function applyCityCommand(rules: Rules, tx: Tx, cmd: Command): CommandError | null {
  const state = tx.state;
  switch (cmd.type) {
    case 'foundCity': {
      const u = state.units[cmd.unit];
      if (!u) return { code: 'unknownUnit', message: `No unit ${cmd.unit}.` };
      if (u.owner !== cmd.player) return { code: 'notYourUnit', message: 'That unit belongs to another player.' };
      const why = foundBlocker(rules, state, u);
      if (why) return { code: 'cannotFound', message: why };
      foundCity(rules, tx, u, cmd.name);
      return null;
    }
    case 'joinCity': {
      const u = state.units[cmd.unit];
      if (!u) return { code: 'unknownUnit', message: `No unit ${cmd.unit}.` };
      if (u.owner !== cmd.player) return { code: 'notYourUnit', message: 'That unit belongs to another player.' };
      const rule = rules.unit(u.type);
      const c = cityAt(state, u.tile);
      if (!rule.specialActions.includes('joinCity') || rule.populationCost <= 0) return { code: 'invalid', message: `${rule.name} cannot join a city.` };
      if (!c || c.owner !== u.owner) return { code: 'invalid', message: 'Move into one of your cities first.' };
      if (c.size + rule.populationCost > sizeLimit(rules, state, c)) return { code: 'invalid', message: `${c.name} cannot grow beyond size ${sizeLimit(rules, state, c)} yet.` };
      tx.removeUnit(u.id);
      tx.city(c.id).size = c.size + rule.populationCost;
      replaceCitizens(rules, tx, c.id);
      tx.emit({ type: 'cityJoined', city: c.id, player: c.owner, tile: c.tile, size: c.size + rule.populationCost });
      return null;
    }
    case 'setBuild': {
      const c = ownCity(state, cmd);
      if (isFail(c)) return c.error;
      const why = buildBlocker(rules, state, c, cmd.build);
      if (why) return { code: 'cannotBuild', message: why };
      switchBuild(rules, tx, c.id, cmd.build);
      tx.emit({ type: 'cityChanged', city: c.id, player: c.owner, tile: c.tile });
      return null;
    }
    case 'setQueue': {
      const c = ownCity(state, cmd);
      if (isFail(c)) return c.error;
      if (cmd.queue.length > 12) return { code: 'invalid', message: 'A queue holds at most 12 builds.' };
      for (const b of cmd.queue) {
        if (b.kind === 'unit' ? !rules.hasUnit(b.id) : !rules.hasBuilding(b.id)) return { code: 'invalid', message: `Unknown build ${b.id}.` };
      }
      tx.city(c.id).queue = cmd.queue.map((b) => ({ ...b }));
      tx.emit({ type: 'cityChanged', city: c.id, player: c.owner, tile: c.tile });
      return null;
    }
    case 'setCitizens': {
      const c = ownCity(state, cmd);
      if (isFail(c)) return c.error;
      const workable = new Set(placeableTiles(rules, state, c));
      const unique = new Set(cmd.worked);
      if (unique.size !== cmd.worked.length) return { code: 'invalid', message: 'A tile is listed twice.' };
      for (const t of cmd.worked) if (!workable.has(t)) return { code: 'invalid', message: 'That tile cannot be worked by this city.' };
      let specialists = 0;
      for (const [s, n] of Object.entries(cmd.specialists)) {
        if (!Number.isInteger(n) || n < 0) return { code: 'invalid', message: 'Bad specialist count.' };
        const spec = rules.set.specialists.find((x) => x.id === s);
        if (!spec || spec.laborer) return { code: 'invalid', message: `Unknown specialist ${s}.` };
        if (spec.requiredTech && !knowsTech(state.players[c.owner]!, spec.requiredTech)) return { code: 'invalid', message: `${spec.pluralName} need ${rules.tech(spec.requiredTech).name}.` };
        specialists += n;
      }
      if (cmd.worked.length + specialists !== c.size) return { code: 'invalid', message: `The city has ${c.size} citizens to place.` };
      const city = tx.city(c.id);
      city.worked = [...cmd.worked];
      city.specialists = Object.fromEntries(Object.entries(cmd.specialists).filter(([, n]) => n > 0));
      city.manualTiles = true;
      tx.emit({ type: 'cityChanged', city: c.id, player: c.owner, tile: c.tile });
      return null;
    }
    case 'autoCitizens': {
      const c = ownCity(state, cmd);
      if (isFail(c)) return c.error;
      tx.city(c.id).manualTiles = false;
      replaceCitizens(rules, tx, c.id);
      tx.emit({ type: 'cityChanged', city: c.id, player: c.owner, tile: c.tile });
      return null;
    }
    case 'hurry': {
      const c = ownCity(state, cmd);
      if (isFail(c)) return c.error;
      const q = hurryQuote(rules, state, c);
      if (q.kind === 'none') return { code: 'invalid', message: q.reason };
      const p = state.players[c.owner]!;
      if (q.kind === 'gold') {
        if (p.gold < q.gold) return { code: 'invalid', message: `Needs ${q.gold} gold; the treasury has ${p.gold}.` };
        tx.player(c.owner).gold = p.gold - q.gold;
      }
      const city = tx.city(c.id);
      city.hurried = true;
      city.shields = buildCost(rules, c.build!, state, c.owner);
      city.shieldsFor = buildCategory(rules, c.build!);
      if (q.kind === 'forcedLabor') {
        city.size = c.size - q.citizens;
        const until = state.turn + rules.set.general.forcedLaborUnhappyTurns;
        for (let i = 0; i < q.citizens; i++) city.forcedLabor.push(until);
        replaceCitizens(rules, tx, c.id);
      }
      tx.emit({ type: 'cityHurried', city: c.id, player: c.owner, tile: c.tile, gold: q.kind === 'gold' ? q.gold : 0, citizens: q.kind === 'forcedLabor' ? q.citizens : 0 });
      return null;
    }
    case 'draft': {
      const c = ownCity(state, cmd);
      if (isFail(c)) return c.error;
      const why = draftBlocker(rules, state, c);
      if (why) return { code: 'invalid', message: why };
      const type = draftUnit(rules, state, c.owner, c)!;
      const already = draftedThisTurn(state, c);
      // Drafted units are conscripts (the lowest experience level) when the rule set has that level.
      const level = rules.set.experienceLevels.some((l) => l.id === 'conscript') ? 'conscript' : 'regular';
      const drafted = tx.addUnit(newUnit(rules, c.owner, type, c.tile, level));
      tx.emit({ type: 'unitCreated', unit: drafted.id, player: c.owner, unitType: type, tile: c.tile });
      const city = tx.city(c.id);
      city.size = c.size - 1;
      city.food = Math.min(c.food, foodBox(rules, city.size));
      city.draftedOn = state.turn;
      city.drafted = already + 1;
      // The drafted citizen's family stays unhappy as long as after forced labour (draftTurnPenalty is not curated).
      city.forcedLabor.push(state.turn + rules.set.general.forcedLaborUnhappyTurns);
      replaceCitizens(rules, tx, c.id);
      tx.emit({ type: 'cityChanged', city: c.id, player: c.owner, tile: c.tile });
      return null;
    }
    case 'renameCity': {
      const c = ownCity(state, cmd);
      if (isFail(c)) return c.error;
      const name = cmd.name.trim();
      if (!name || name.length > 40) return { code: 'invalid', message: 'City names have 1 to 40 characters.' };
      tx.city(c.id).name = name;
      tx.emit({ type: 'cityChanged', city: c.id, player: c.owner, tile: c.tile });
      return null;
    }
    case 'setRates': {
      const r = cmd.rates;
      const gov = rules.government(state.players[cmd.player]!.government);
      if (gov.transitional) return { code: 'invalid', message: `Rates are fixed during ${gov.name}.` };
      const vals = [r.tax, r.science, r.luxury];
      if (vals.some((v) => !Number.isInteger(v) || v < 0) || r.tax + r.science + r.luxury !== 10)
        return { code: 'invalid', message: 'Rates are whole tens of percent adding up to 100 %.' };
      const cap = Math.floor(gov.rateCap / 10);
      if (vals.some((v) => v > cap)) return { code: 'invalid', message: `${gov.name} allows at most ${gov.rateCap} % for any one rate.` };
      tx.player(cmd.player).rates = { tax: r.tax, science: r.science, luxury: r.luxury };
      tx.emit({ type: 'ratesChanged', player: cmd.player });
      return null;
    }
    case 'setResearch': {
      const p = state.players[cmd.player]!;
      if (!rules.set.techs.some((t) => t.id === cmd.tech)) return { code: 'invalid', message: `Unknown tech ${cmd.tech}.` };
      const why = researchBlocker(rules, p, cmd.tech);
      if (why) return { code: 'invalid', message: why };
      // A free advance owed to the player is spent on the choice (docs/rules/science.md).
      if ((p.freeAdvances ?? 0) > 0) {
        tx.player(cmd.player).freeAdvances = p.freeAdvances! - 1;
        if (p.research.tech === cmd.tech) tx.player(cmd.player).research = { tech: null, beakers: p.research.beakers, turns: 0 };
        learn(rules, tx, cmd.player, cmd.tech);
        return null;
      }
      if (p.research.tech !== cmd.tech) tx.player(cmd.player).research = { tech: cmd.tech, beakers: p.research.beakers, turns: 0 };
      tx.emit({ type: 'researchChanged', player: cmd.player, tech: cmd.tech });
      return null;
    }
    case 'revolution': {
      const p = state.players[cmd.player]!;
      const target = rules.set.governments.find((g) => g.id === cmd.government);
      if (!target || target.transitional) return { code: 'invalid', message: 'Pick a government to change to.' };
      if (target.requiredTech && !knowsTech(p, target.requiredTech)) return { code: 'invalid', message: `${target.name} requires ${rules.tech(target.requiredTech).name}.` };
      if (p.government === target.id) return { code: 'invalid', message: `Already a ${target.name}.` };
      if (p.revolution) {
        tx.player(cmd.player).revolution = { target: target.id, endsOnTurn: p.revolution.endsOnTurn };
        tx.emit({ type: 'anarchyStarted', player: cmd.player, target: target.id, turns: p.revolution.endsOnTurn - state.turn });
        return null;
      }
      const turns = anarchyTurns(rules, tx, cmd.player);
      const anarchy = rules.set.governments.find((g) => g.transitional);
      const pl = tx.player(cmd.player);
      if (!anarchy || turns <= 0) {
        pl.government = target.id;
        clampRates(rules, tx, cmd.player);
        tx.emit({ type: 'governmentChanged', player: cmd.player, government: target.id });
        return null;
      }
      pl.government = anarchy.id;
      pl.revolution = { target: target.id, endsOnTurn: state.turn + turns };
      tx.emit({ type: 'anarchyStarted', player: cmd.player, target: target.id, turns });
      return null;
    }
    default:
      return { code: 'invalid', message: `Not a city command: ${cmd.type}.` };
  }
}

/** Tiles a player may assign to a city by hand: its work area inside its borders, not used by another city. */
export function placeableTiles(rules: Rules, state: GameState, c: City): number[] {
  return workableTiles(rules, state, c);
}

/**
 * Anarchy lasts 2 to 5 turns, never more than the difficulty's limit
 * (docs/rules/governments.md); religious civilizations get through it in one.
 */
function anarchyTurns(rules: Rules, tx: Tx, player: number): number {
  if (hasTrait(rules, tx.state, player, 'religious')) return 1;
  const cap = rules.difficulty(tx.state.difficulty).maxAnarchyTurns;
  const turns = 2 + tx.random(4);
  return cap > 0 ? Math.min(cap, turns) : turns;
}

function clampRates(rules: Rules, tx: Tx, player: number): void {
  const p = tx.state.players[player]!;
  const cap = Math.floor(rules.government(p.government).rateCap / 10);
  let { tax, science, luxury } = p.rates;
  if (tax <= cap && science <= cap && luxury <= cap) return;
  science = Math.min(science, cap);
  luxury = Math.min(luxury, cap);
  tax = 10 - science - luxury;
  if (tax > cap) {
    luxury += tax - cap;
    tax = cap;
  }
  tx.player(player).rates = { tax, science, luxury };
}

// ---------------------------------------------------------------------------
// End of turn
// ---------------------------------------------------------------------------

/** Runs the city and empire steps of the end of turn for every player (docs/rules/turns.md). */
export function runCityTurn(rules: Rules, tx: Tx): void {
  let territoryDirty = false;
  // Cities that place their own citizens re-place them first (yields and moods may have changed).
  refreshAutoCities(rules, tx);
  for (const p of tx.state.players) {
    if (!p.alive || p.barbarian) continue;
    let income = 0;
    let upkeep = 0;
    let beakers = 0;
    for (const c of playerCities(tx.state, p.id)) {
      const r = processCity(rules, tx, c.id);
      income += r.tax;
      upkeep += r.upkeep;
      beakers += r.science;
      if (r.bordersGrew) territoryDirty = true;
    }
    const support = unitSupportCost(rules, tx.state, p.id);
    income += treasuryInterest(rules, tx.state, p.id);
    const pl = tx.player(p.id);
    pl.gold = p.gold + income - upkeep - support;
    tx.emit({ type: 'treasury', player: p.id, income, upkeep, unitSupport: support, gold: pl.gold });
    research(rules, tx, p.id, beakers);
    greatLibrary(rules, tx, p.id);
    if (tx.state.players[p.id]!.gold < 0) settleDebt(rules, tx, p.id);
    endRevolution(rules, tx, p.id);
  }
  if (territoryDirty) updateTerritory(rules, tx);
}

/** Wall Street pays this much interest on the treasury, in percent… */
export const INTEREST_PERCENT = 5;
/** …up to this much gold a turn. */
export const INTEREST_CAP = 50;

/** Interest a treasury earns with a treasuryEarnsInterest wonder (Wall Street; docs/rules/wonders.md). */
export function treasuryInterest(rules: Rules, state: GameState, player: number): number {
  const p = state.players[player]!;
  if (p.gold <= 0) return 0;
  const info = empireInfo(rules, state, player);
  if (![...info.activeWonders].some((w) => rules.building(w).effects.includes('treasuryEarnsInterest'))) return 0;
  return Math.min(INTEREST_CAP, Math.floor((p.gold * INTEREST_PERCENT) / 100));
}

/** The Great Library teaches every advance two civilizations it knows of have (docs/rules/wonders.md). */
function greatLibrary(rules: Rules, tx: Tx, player: number): void {
  const info = empireInfo(rules, tx.state, player);
  if (![...info.activeWonders].some((w) => rules.building(w).effects.includes('gainAdvancesKnownByTwoCivs'))) return;
  for (let guard = 0; guard < 10; guard++) {
    const p = tx.state.players[player]!;
    const others = tx.state.players.filter((o) => o.id !== player && o.alive && !o.barbarian && p.contacts.includes(o.id));
    const pick = rules.set.techs.find((t) => researchBlocker(rules, p, t.id) === null && others.filter((o) => o.techs.includes(t.id)).length >= 2);
    if (!pick) return;
    learn(rules, tx, player, pick.id);
    if (p.research.tech === pick.id) tx.player(player).research = { tech: null, beakers: tx.state.players[player]!.research.beakers, turns: 0 };
  }
}

/** Military units beyond what the government supports for free cost gold each turn. */
export function unitSupportCost(rules: Rules, state: GameState, player: number): number {
  const p = state.players[player]!;
  const gov = rules.government(p.government);
  let free = 0;
  for (const c of playerCities(state, player)) {
    const cls = c.size <= rules.set.general.maxTownSize ? 'town' : c.size <= rules.set.general.maxCitySize ? 'city' : 'metropolis';
    free += gov.freeUnits[cls];
  }
  // AI players get the difficulty's extra support (docs/rules/ai-handicaps.md).
  if (!p.human && !p.barbarian) {
    const diff = rules.difficulty(state.difficulty);
    free += diff.aiFreeUnitSupport + diff.aiBonusPerCity * playerCities(state, player).length;
  }
  let military = 0;
  for (const u of Object.values(state.units)) {
    if (u.owner !== player) continue;
    const rule = rules.unit(u.type);
    if (rule.requiresSupport && (rule.attack > 0 || rule.defence > 0)) military++;
  }
  return Math.max(0, military - free) * gov.unitCost;
}

interface CityTurnResult {
  tax: number;
  science: number;
  upkeep: number;
  bordersGrew: boolean;
}

function processCity(rules: Rules, tx: Tx, cityId: number): CityTurnResult {
  const before = tx.state.cities[cityId]!;
  const report = cityReport(rules, tx.state, before);
  const p = tx.state.players[before.owner]!;
  const where = { city: cityId, player: before.owner, tile: before.tile };

  // Mood state.
  let c = tx.city(cityId);
  if (report.disorder) {
    c.disorder = before.disorder + 1;
    tx.emit({ type: 'cityDisorder', ...where, turns: c.disorder });
  } else if (before.disorder > 0) {
    c.disorder = 0;
    tx.emit({ type: 'cityOrderRestored', ...where });
  }
  if (report.celebrating !== before.celebrating) {
    c.celebrating = report.celebrating;
    tx.emit({ type: 'cityCelebrating', ...where, started: report.celebrating });
  }
  c.forcedLabor = before.forcedLabor.filter((t) => t > tx.state.turn);
  c.hurried = false;

  // Food and growth.
  const box = foodBox(rules, before.size);
  let food = before.food + report.foodSurplus;
  let sizeChanged = false;
  if (food >= box) {
    if (before.size >= report.sizeLimit) {
      food = box;
      const needs = report.sizeLimit <= rules.set.general.maxTownSize ? 'an Aqueduct' : 'a Hospital';
      if (before.food < box) tx.emit({ type: 'cityCapped', ...where, needs });
    } else {
      const have = empireInfo(rules, tx.state, before.owner).effective.get(cityId)!;
      const granary = [...have].some((b) => rules.building(b).effects.includes('doublesCityGrowth'));
      const longevity = [...empireInfo(rules, tx.state, before.owner).activeWonders].some((w) => rules.building(w).effects.includes('cityGrowthTwoCitizens'));
      const grow = Math.min(longevity ? 2 : 1, report.sizeLimit - before.size);
      c = tx.city(cityId);
      c.size = before.size + grow;
      food = granary ? Math.floor(foodBox(rules, c.size) / 2) : 0;
      sizeChanged = true;
      tx.emit({ type: 'cityGrew', ...where, size: c.size });
    }
  } else if (food < 0) {
    c = tx.city(cityId);
    if (before.size > 1) {
      c.size = before.size - 1;
      sizeChanged = true;
    }
    food = 0;
    tx.emit({ type: 'cityStarved', ...where, size: c.size });
  }
  c = tx.city(cityId);
  c.food = food;
  if (sizeChanged) replaceCitizens(rules, tx, cityId);

  // Production.
  produce(rules, tx, cityId, report.shields.value);

  // Pollution and meltdowns (docs/rules/pollution.md).
  const have = empireInfo(rules, tx.state, before.owner).effective.get(cityId) ?? new Set(Object.keys(before.buildings));
  if (report.disorder) maybeMeltdown(rules, tx, cityId, have);
  rollPollution(rules, tx, tx.state.cities[cityId]!, report.pollution.value);

  // Wonder-made units (Statue of Zeus, Knights Templar).
  for (const b of Object.keys(tx.state.cities[cityId]!.buildings)) {
    const rule = rules.building(b);
    if (!rule.unitProduced || rule.unitEvery <= 0) continue;
    if (rule.obsoletedBy && knowsTech(p, rule.obsoletedBy)) continue;
    c = tx.city(cityId);
    c.wonderUnitTimer = before.wonderUnitTimer + 1;
    if (c.wonderUnitTimer >= rule.unitEvery) {
      c.wonderUnitTimer = 0;
      const unit = addUnit(rules, tx, before.owner, rule.unitProduced, before.tile, cityId);
      tx.emit({ type: 'cityBuilt', ...where, build: { kind: 'unit', id: rule.unitProduced }, unit: unit.id });
    }
    break;
  }

  // Culture.
  const cult = report.culture.value;
  let bordersGrew = false;
  if (cult > 0) {
    const r0 = borderRadius(rules, before.culture);
    c = tx.city(cityId);
    c.culture = before.culture + cult;
    tx.player(before.owner).culture = tx.state.players[before.owner]!.culture + cult;
    const r1 = borderRadius(rules, c.culture);
    if (r1 > r0) {
      bordersGrew = true;
      tx.emit({ type: 'bordersGrew', ...where, radius: r1 });
    }
  }

  return { tax: report.tax.value, science: report.science.value, upkeep: report.upkeep.value, bordersGrew };
}

function veteranFor(rules: Rules, tx: Tx, owner: number, cityId: number, type: string): boolean {
  const domain = rules.unit(type).domain;
  const effect = domain === 'land' ? 'veteranGroundUnits' : domain === 'sea' ? 'veteranSeaUnits' : 'veteranAirUnits';
  const have = empireInfo(rules, tx.state, owner).effective.get(cityId) ?? new Set<string>();
  return [...have].some((b) => rules.building(b).effects.includes(effect));
}

function addUnit(rules: Rules, tx: Tx, owner: number, type: string, tile: number, cityId: number): Unit {
  const veteran = veteranFor(rules, tx, owner, cityId, type);
  const u = tx.addUnit(newUnit(rules, owner, type, tile, veteran ? 'veteran' : 'regular'));
  tx.emit({ type: 'unitCreated', unit: u.id, player: owner, unitType: type, tile });
  return u;
}

function produce(rules: Rules, tx: Tx, cityId: number, shields: number): void {
  const before = tx.state.cities[cityId]!;
  const where = { city: cityId, player: before.owner, tile: before.tile };
  let c = tx.city(cityId);
  const build = before.build;
  if (!build) {
    c.shields = before.shields + shields;
    return;
  }
  if (build.kind === 'building' && rules.building(build.id).kind === 'wealth') return;
  const cat = buildCategory(rules, build);
  c.shields = before.shields + shields;
  if (c.shields > 0) c.shieldsFor = cat;
  const cost = buildCost(rules, build, tx.state, before.owner);
  if (c.shields < cost) return;

  const blocked = (why: string) => {
    tx.emit({ type: 'cityBuildBlocked', ...where, build, why });
  };
  // Re-check: things may have changed since the build was chosen.
  const why = buildBlocker(rules, tx.state, before, build);
  if (why) {
    blocked(why);
    c = tx.city(cityId);
    c.build = c.queue.shift() ?? null;
    return;
  }
  if (build.kind === 'unit') {
    const u = rules.unit(build.id);
    if (u.populationCost > 0 && before.size <= u.populationCost) {
      blocked(`Waiting for the city to reach size ${u.populationCost + 1}.`);
      c.shields = cost;
      return;
    }
    const unit = addUnit(rules, tx, before.owner, build.id, before.tile, cityId);
    c = tx.city(cityId);
    // Shields beyond the cost are lost (docs/rules/production.md).
    c.shields = 0;
    if (u.populationCost > 0) {
      c.size = before.size - u.populationCost;
      c.food = Math.min(c.food, foodBox(rules, c.size));
      replaceCitizens(rules, tx, cityId);
    }
    tx.emit({ type: 'cityBuilt', ...where, build, unit: unit.id });
  } else {
    const rule = rules.building(build.id);
    c.shields = 0;
    if (rule.spaceshipParts > 0) {
      // Spaceship parts join the ship at the capital rather than standing in the city.
      addSpaceshipPart(tx, before.owner, build.id);
      tx.emit({ type: 'cityBuilt', ...where, build });
      c = tx.city(cityId);
      c.build = c.queue.shift() ?? null;
      c.shieldsFor = null;
      return;
    }
    if (rule.effects.includes('replacesOtherBuildings')) {
      for (const b of Object.keys(c.buildings)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by building id
        if (rules.building(b).effects.includes('replacesOtherBuildings')) delete c.buildings[b];
      }
    }
    if (build.id === 'palace') {
      // Moving the palace: the old capital loses it.
      for (const other of playerCities(tx.state, before.owner)) {
        if (other.id !== cityId && 'palace' in other.buildings) delete tx.city(other.id).buildings.palace;
      }
    }
    c = tx.city(cityId);
    c.buildings[build.id] = tx.state.turn;
    if (rule.kind === 'wonder') {
      tx.setWonder(build.id, cityId);
      tx.emit({ type: 'wonderBuilt', ...where, building: build.id });
      addVictoryPoints(tx, before.owner, rules.set.general.victory.wonderPoints, `built ${rule.name}`);
      checkWonderGoldenAge(rules, tx, before.owner, build.id);
    }
    tx.emit({ type: 'cityBuilt', ...where, build });
    // The Theory of Evolution: the advance being researched, and a free pick (docs/rules/science.md).
    if (rule.effects.includes('twoFreeAdvances')) {
      grantFreeAdvance(rules, tx, before.owner);
      oweFreeAdvance(rules, tx, before.owner);
    }
  }
  // Next build: the queue, else repeat units, else nothing.
  c = tx.city(cityId);
  const next = c.queue.shift();
  if (next) c.build = next;
  else if (build.kind === 'building') c.build = null;
  // A repeated unit keeps its build; the next item starts from an empty box.
  c.shieldsFor = null;
}

/** Tech flag bits the importer has no name for (docs/rules/science.md): the free advance and the revealed map. */
export const TECH_BONUS_ADVANCE = 'bit21';
export const TECH_REVEALS_MAP = 'bit22';

export function learn(rules: Rules, tx: Tx, player: number, tech: string): void {
  if (tx.state.players[player]!.techs.includes(tech)) return;
  const first = !tx.state.players.some((o) => o.id !== player && !o.barbarian && o.techs.includes(tech));
  const p = tx.player(player);
  p.techs = [...p.techs, tech];
  tx.emit({ type: 'techDiscovered', player, tech });
  const flags = rules.tech(tech).flags;
  // Conquests' "reveal map" advance (bit 22 in the rule file: Satellites) shows its discoverer the whole world.
  if (flags.includes(TECH_REVEALS_MAP)) reveal(tx, player, Array.from({ length: tileCount(tx.state.map) }, (_, t) => t), rules.tech(tech).name);
  if (first) firstDiscovery(rules, tx, player, tech);
  // Conquests' "bonus tech" (bit 21: Philosophy) gives the first civilization to discover it a free advance.
  if (first && flags.includes(TECH_BONUS_ADVANCE)) grantFreeAdvance(rules, tx, player);
  const era = eraFor(rules, p.techs);
  if (era > p.era) {
    p.era = era;
    tx.emit({ type: 'eraEntered', player, era: rules.set.eras[era]!.id });
    // Scientific civilizations get a free advance with each new era (docs/rules/civilizations.md).
    if (hasTrait(rules, tx.state, player, 'scientific')) grantFreeAdvance(rules, tx, player);
  }
}

/** Being first in the world to an advance: victory points, and perhaps a scientific leader. */
function firstDiscovery(rules: Rules, tx: Tx, player: number, tech: string): void {
  addVictoryPoints(tx, player, rules.set.general.victory.advancePoints, `first to discover ${rules.tech(tech).name}`);
  if (!hasTrait(rules, tx.state, player, 'scientific')) return;
  const capital = empireInfo(rules, tx.state, player).capital;
  if (!capital || tx.random(100) >= SCIENTIFIC_LEADER_PERCENT) return;
  bearLeader(rules, tx, player, capital.tile, true);
}

/**
 * A free advance (docs/rules/science.md): the advance being researched, whose beakers carry
 * over to the next research; with nothing (researchable) being researched, a free pick.
 */
export function grantFreeAdvance(rules: Rules, tx: Tx, player: number): void {
  const p = tx.state.players[player]!;
  const tech = p.research.tech;
  if (!tech || researchBlocker(rules, p, tech) !== null) {
    oweFreeAdvance(rules, tx, player);
    return;
  }
  tx.player(player).research = { tech: null, beakers: p.research.beakers, turns: 0 };
  learn(rules, tx, player, tech);
}

/**
 * A free pick of any advance the player can research, owed until it chooses one
 * (setResearch spends it; computer players choose as they choose their research).
 */
export function oweFreeAdvance(rules: Rules, tx: Tx, player: number): void {
  const p = tx.state.players[player]!;
  if (researchableTechs(rules, p).length <= (p.freeAdvances ?? 0)) return;
  tx.player(player).freeAdvances = (p.freeAdvances ?? 0) + 1;
  tx.emit({ type: 'freeAdvanceOwed', player });
}

/** Adds this turn's beakers and completes the advance (docs/rules/science.md). */
function research(rules: Rules, tx: Tx, player: number, beakers: number): void {
  const p = tx.state.players[player]!;
  const g = rules.set.general;
  const r = { ...p.research };
  r.beakers += beakers;
  if (!r.tech || researchBlocker(rules, p, r.tech) !== null) {
    if (r.beakers !== p.research.beakers || r.tech !== p.research.tech) tx.player(player).research = { tech: null, beakers: r.beakers, turns: 0 };
    return;
  }
  r.turns += 1;
  const cost = techCost(rules, tx.state, r.tech, player);
  const done = (r.beakers >= cost && r.turns >= g.minimumResearchTime) || (g.maximumResearchTime > 0 && r.turns >= g.maximumResearchTime);
  if (!done) {
    tx.player(player).research = r;
    return;
  }
  // Extra beakers beyond the cost are lost, as in Civ3.
  tx.player(player).research = { tech: null, beakers: 0, turns: 0 };
  learn(rules, tx, player, r.tech);
}

/**
 * An empty treasury sells buildings, the costliest upkeep first, until upkeep is
 * covered; any remaining debt is written off (docs/rules/governments.md).
 */
function settleDebt(rules: Rules, tx: Tx, player: number): void {
  const owned: { city: number; building: string; upkeep: number }[] = [];
  for (const c of playerCities(tx.state, player)) {
    for (const b of Object.keys(c.buildings)) {
      const r = rules.building(b);
      if (r.kind === 'improvement' && r.upkeep > 0) owned.push({ city: c.id, building: b, upkeep: r.upkeep });
    }
  }
  owned.sort((a, b) => b.upkeep - a.upkeep || a.city - b.city || a.building.localeCompare(b.building));
  const sale = owned[0];
  if (sale) {
    const c = tx.city(sale.city);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by building id
    delete c.buildings[sale.building];
    tx.emit({ type: 'buildingSold', city: sale.city, player, tile: c.tile, building: sale.building, why: 'The treasury could not pay the upkeep.' });
  }
  tx.player(player).gold = 0;
}

function endRevolution(rules: Rules, tx: Tx, player: number): void {
  const p = tx.state.players[player]!;
  if (!p.revolution || tx.state.turn + 1 < p.revolution.endsOnTurn) return;
  const pl = tx.player(player);
  pl.government = p.revolution.target;
  pl.revolution = null;
  clampRates(rules, tx, player);
  tx.emit({ type: 'governmentChanged', player, government: pl.government });
}

/** Citizens the city places by itself on every turn when not set by hand (used after map changes). */
export function refreshAutoCities(rules: Rules, tx: Tx): void {
  for (const c of Object.values(tx.state.cities).sort((a, b) => a.id - b.id)) {
    if (!c.manualTiles) replaceCitizens(rules, tx, c.id);
  }
}
