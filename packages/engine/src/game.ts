/**
 * New games, the command dispatcher and the turn pipeline.
 */
import { runBarbarians } from './barbarians.ts';
import { applyCityCommand, runCityTurn } from './cities.ts';
import type { Command, CommandError, GameEvent } from './commands.ts';
import { tileCount } from './grid.ts';
import { cityAt } from './territory.ts';
import { generateMap } from './map/generate.ts';
import { continueGoto } from './move.ts';
import { findPath } from './pathfind.ts';
import { emptyBitset, tileOwners } from './queries.ts';
import { makeRng, seedRng } from './rng.ts';
import type { Rules } from './rules.ts';
import {
  type Barbarians,
  type Climate,
  type GameOptions,
  type GameState,
  type LandForm,
  type MapSettings,
  type Player,
  type Temperature,
} from './state.ts';
import { beginTx, type Tx } from './tx.ts';
import { answerDeal, dropProposalsTo, proposeDeal, runDiplomacyTurn } from './diplomacy.ts';
import { runMission } from './espionage.ts';
import { buildCategory, isCommonUnit } from './production.ts';
import { civVersionOf, endGoldenAges } from './civs.ts';
import { runCultureFlips, runResistance } from './culture.ts';
import { runGlobalWarming } from './pollution.ts';
import { emptySpaceship, launchSpaceship } from './space.ts';
import { checkRegicide, defaultOptions, runVictory } from './victory.ts';
import { invalidateCaches } from './caches.ts';
import { automationBlocker, defaultAutomation } from './automation.ts';
import { eraFor } from './science.ts';
import { cargoOf, isArmy, newUnit, removeUnitDeep, unitMaxMoves } from './units.ts';
import { reveal, unitSight } from './vision.ts';
import { applyWarCommand, checkElimination, decayWeariness, healUnits, moveOrAttack } from './war.ts';
import { advanceWork, checkJob, turnsLeft } from './workers.ts';

type OrRandom<T> = T | 'random';

export interface NewGameOptions {
  seed: number;
  map: {
    worldSize: string;
    landForm?: OrRandom<LandForm>;
    waterPercent?: OrRandom<60 | 70 | 80>;
    climate?: OrRandom<Climate>;
    temperature?: OrRandom<Temperature>;
    age?: OrRandom<3 | 4 | 5>;
    barbarians?: Barbarians;
  };
  /** `civ` names the civilization played (rules.set.civs); it shapes the AI's character. */
  players: { name: string; color: string; human: boolean; civ?: string }[];
  /** Units every player starts with; defaults to the rule set's start units. */
  startUnits?: string[];
  /** Techs every player starts with (for tests and scenarios). */
  startTechs?: string[];
  /** Difficulty level id; defaults to the rule set's default. */
  difficulty?: string;
  /** Game mode, victory conditions and culture flips (docs/rules/victory.md); defaults to the standard game. */
  options?: Partial<GameOptions>;
}

export const PLAYER_COLORS = [
  '#e0453a', '#3a7be0', '#e0c23a', '#3ab86a', '#a35ae0', '#e0803a', '#3ad0d6', '#e05aa8',
  '#8a6a3a', '#9ab83a', '#5a6ae0', '#e0a0a0', '#6ad0a0', '#c0c0c0', '#b03a60', '#3a8a8a',
];

export function resolveSettings(options: NewGameOptions['map'], seed: number): MapSettings {
  const rng = makeRng(seed ^ 0x73657474);
  const pick = <T>(v: OrRandom<T> | undefined, def: T, all: readonly T[]): T => (v === 'random' ? rng.pick(all) : (v ?? def));
  return {
    worldSize: options.worldSize,
    landForm: pick(options.landForm, 'continents', ['archipelago', 'continents', 'pangaea'] as const),
    waterPercent: pick(options.waterPercent, 70, [60, 70, 80] as const),
    climate: pick(options.climate, 'normal', ['arid', 'normal', 'wet'] as const),
    temperature: pick(options.temperature, 'temperate', ['cool', 'temperate', 'warm'] as const),
    age: pick(options.age, 4, [3, 4, 5] as const),
    barbarians: options.barbarians ?? 'roaming',
  };
}

export function createGame(rules: Rules, options: NewGameOptions): GameState {
  const settings = resolveSettings(options.map, options.seed);
  const map = generateMap(rules, settings, options.players.length, options.seed);
  const startUnits = options.startUnits ?? rules.set.general.startUnits;
  for (const t of startUnits) rules.unit(t);
  const difficulty = options.difficulty ?? rules.set.general.defaultDifficulty;
  rules.difficulty(difficulty);
  const startTechs = [...(options.startTechs ?? [])];
  for (const p of options.players) if (p.civ !== undefined) rules.civ(p.civ);
  const players: Player[] = options.players.map((p, id) => ({
    id,
    name: p.name,
    civ: p.civ ?? null,
    contacts: [],
    embassies: [],
    spies: [],
    reputation: 100,
    memory: {},
    color: p.color,
    human: p.human,
    barbarian: false,
    alive: true,
    gold: rules.set.general.startingGold,
    government: rules.set.general.defaultGovernment,
    techs: [...startTechs],
    resources: [],
    explored: emptyBitset(map),
    atWarWith: [],
    warSince: {},
    weariness: {},
    armyVictory: false,
    endedTurn: false,
    rates: { tax: 4, science: 6, luxury: 0 },
    research: { tech: null, beakers: 0, turns: 0 },
    era: eraFor(rules, startTechs),
    revolution: null,
    culture: 0,
    automation: defaultAutomation(),
    ...phase6Fields(),
  }));
  // Civilizations start with their free advances (docs/rules/civilizations.md).
  for (const p of players) {
    if (!p.civ) continue;
    p.techs = [...new Set([...p.techs, ...rules.civ(p.civ).freeTechs])];
    p.era = eraFor(rules, p.techs);
  }
  if (settings.barbarians !== 'none') {
    players.push({
      id: players.length,
      name: 'Barbarians',
      color: '#6b2a22',
      civ: null,
      contacts: [],
      embassies: [],
      spies: [],
      reputation: 100,
      memory: {},
      human: false,
      barbarian: true,
      alive: true,
      gold: 0,
      government: rules.set.general.defaultGovernment,
      techs: [],
      resources: [],
      // Barbarians know the whole map.
      explored: emptyBitset(map).map(() => 0xffffffff),
      atWarWith: [],
      warSince: {},
      weariness: {},
      armyVictory: false,
      endedTurn: true,
      rates: { tax: 4, science: 6, luxury: 0 },
      research: { tech: null, beakers: 0, turns: 0 },
      era: eraFor(rules, []),
      revolution: null,
      culture: 0,
      automation: defaultAutomation(),
      ...phase6Fields(),
    });
  }
  const base: GameState = {
    format: 'civolution-state',
    version: 6,
    rulesHash: rules.hash,
    seed: options.seed >>> 0,
    rng: seedRng(options.seed ^ 0x67616d65),
    turn: 1,
    settings,
    map,
    players,
    units: {},
    nextUnitId: 1,
    work: {},
    difficulty,
    cities: {},
    nextCityId: 1,
    wonders: {},
    diplomacy: { treaties: [], ongoing: [], proposals: [], nextId: 1 },
    options: { ...defaultOptions(), ...options.options, victories: { ...defaultOptions().victories, ...options.options?.victories } },
    victory: null,
    climate: { warming: 0, strikes: 0 },
    un: null,
  };
  const tx = beginTx(base);
  const diff = rules.difficulty(difficulty);
  players.forEach((p, i) => {
    if (p.barbarian) return;
    const tile = map.starts[i]!;
    const units = [...startUnits];
    // Expansionist civilizations bring a scout; regicide games bring the king (two in mass regicide).
    if (p.civ && rules.civ(p.civ).traits.includes('expansionist') && rules.hasUnit(rules.set.general.scoutUnit)) units.push(rules.set.general.scoutUnit);
    const king = p.civ ? rules.civ(p.civ).kingUnit : undefined;
    const mode = base.options.mode;
    if (king && (mode === 'regicide' || mode === 'massRegicide')) for (let k = 0; k < (mode === 'massRegicide' ? 2 : 1); k++) units.push(king);
    // AI players get the difficulty's extra start units (docs/rules/ai-handicaps.md).
    if (!p.human) {
      diff.aiExtraStartUnits.forEach((n, k) => {
        const type = rules.set.general.startUnits[k];
        if (type) for (let j = 0; j < n; j++) units.push(type);
      });
      const guard = startingUnit(rules, startTechs, 'defence');
      const raider = startingUnit(rules, startTechs, 'attack');
      for (let j = 0; j < diff.aiDefensiveStartUnits && guard; j++) units.push(guard);
      for (let j = 0; j < diff.aiOffensiveStartUnits && raider; j++) units.push(raider);
    }
    for (const common of units) {
      // A unique unit takes the place of its common counterpart (the Inca start with a Chasqui Scout).
      const type = common === king ? common : civVersionOf(rules, tx.state, p.id, common);
      const u = tx.addUnit(newUnit(rules, p.id, type, tile));
      reveal(tx, p.id, unitSight(rules, tx.state, u));
    }
  });
  return tx.state;
}

/** Player fields added in format 6 (Phase 6), at their starting values. */
export function phase6Fields(): Pick<Player, 'goldenAge' | 'hadGoldenAge' | 'leadersBorn' | 'spaceship' | 'victoryPoints' | 'scores'> {
  return { goldenAge: null, hadGoldenAge: false, leadersBorn: 0, spaceship: emptySpaceship(), victoryPoints: 0, scores: [] };
}

/** The best land unit for `role` buildable with no advances beyond `techs` (AI start units). */
function startingUnit(rules: Rules, techs: readonly string[], role: 'attack' | 'defence'): string | null {
  const known = new Set(techs);
  const options = rules.set.units.filter(
    (u) => u.domain === 'land' && u.shieldCost > 0 && u.populationCost === 0 && (!u.requiredTech || known.has(u.requiredTech)) && u.requiredResources.length === 0 && isCommonUnit(rules, u.id) && u[role] > 0,
  );
  options.sort((a, b) => b[role] - a[role] || a.shieldCost - b.shieldCost || a.id.localeCompare(b.id));
  return options[0]?.id ?? null;
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  error?: CommandError;
}

const err = (state: GameState, code: CommandError['code'], message: string): ApplyResult => ({
  state,
  events: [],
  error: { code, message },
});

export function apply(rules: Rules, state: GameState, cmd: Command): ApplyResult {
  const player = state.players[cmd.player];
  if (!player?.alive) return err(state, 'invalid', `No active player ${cmd.player}.`);
  // Offers are answered whenever they arrive, also between turns.
  if (player.endedTurn && cmd.type !== 'answerDeal') return err(state, 'turnEnded', 'This player has already ended the turn.');
  const tx = beginTx(state, cmd.reason);

  if (cmd.type === 'endTurn') {
    tx.player(cmd.player).endedTurn = true;
    dropProposalsTo(tx, cmd.player);
    tx.emit({ type: 'playerEndedTurn', player: cmd.player });
    if (tx.state.players.every((p) => !p.alive || p.endedTurn || p.barbarian)) runEndOfTurn(rules, tx);
    return done(rules, tx);
  }

  if (cmd.type === 'setAutomation') {
    const why = automationBlocker(cmd.settings);
    if (why) return err(state, 'invalid', why);
    tx.player(cmd.player).automation = structuredClone(cmd.settings);
    return done(rules, tx);
  }

  if (cmd.type === 'launchSpaceship') {
    const error = launchSpaceship(rules, tx, cmd.player);
    if (error) return { state, events: [], error };
    return done(rules, tx);
  }

  if (cmd.type === 'declareWar' || cmd.type === 'razeCity') {
    const error = applyWarCommand(rules, tx, cmd);
    if (error) return { state, events: [], error };
    return done(rules, tx);
  }
  if (cmd.type === 'proposeDeal' || cmd.type === 'answerDeal' || cmd.type === 'espionage') {
    const error =
      cmd.type === 'proposeDeal'
        ? proposeDeal(rules, tx, { from: cmd.player, to: cmd.target, give: cmd.give, take: cmd.take }, cmd.reason)
        : cmd.type === 'answerDeal'
          ? answerDeal(rules, tx, cmd.player, cmd.proposal, cmd.accept)
          : runMission(rules, tx, cmd.player, cmd.target, cmd.mission, cmd.city);
    if (error) return { state, events: [], error };
    return done(rules, tx);
  }

  if (!('unit' in cmd) || cmd.type === 'foundCity' || cmd.type === 'joinCity') {
    const error = applyCityCommand(rules, tx, cmd);
    if (error) return { state, events: [], error };
    return done(rules, tx);
  }

  const existing = state.units[cmd.unit];
  if (!existing) return err(state, 'unknownUnit', `No unit ${cmd.unit}.`);
  if (existing.owner !== cmd.player) return err(state, 'notYourUnit', 'That unit belongs to another player.');
  const holder = existing.carriedBy === null ? undefined : state.units[existing.carriedBy];
  if (holder && isArmy(rules, holder)) return err(state, 'invalid', 'This unit fights inside an army; give orders to the army.');

  switch (cmd.type) {
    case 'moveUnit': {
      const error = moveOrAttack(rules, tx, cmd.unit, cmd.to, cmd.raze ?? false, cmd.defender);
      if (error) return { state, events: [], error };
      break;
    }
    case 'bombard':
    case 'airMission':
    case 'nuke':
    case 'pillage':
    case 'upgrade':
    case 'load':
    case 'unload':
    case 'buildArmy':
    case 'joinArmy':
    case 'airdrop':
    case 'airlift':
    case 'leaderHurry': {
      const error = applyWarCommand(rules, tx, cmd);
      if (error) return { state, events: [], error };
      break;
    }
    case 'goto': {
      if (cmd.to === existing.tile) return err(state, 'invalid', 'The unit is already there.');
      const path = findPath(rules, state, existing, cmd.to);
      if (!path) return err(state, 'cannotEnter', 'No known route to that tile.');
      const u = tx.unit(cmd.unit);
      u.order = { type: 'goto', target: cmd.to, route: path.tiles };
      u.fortified = false;
      continueGoto(rules, tx, u.id);
      break;
    }
    case 'fortify': {
      if (rules.unit(existing.type).domain !== 'land') return err(state, 'invalid', 'Only land units fortify.');
      const u = tx.unit(cmd.unit);
      u.order = { type: 'fortify' };
      u.fortified = true;
      u.movesLeft = 0;
      tx.emit({ type: 'orderChanged', unit: u.id, player: u.owner });
      break;
    }
    case 'sentry': {
      const u = tx.unit(cmd.unit);
      u.order = { type: 'sentry' };
      u.movesLeft = 0;
      tx.emit({ type: 'orderChanged', unit: u.id, player: u.owner });
      break;
    }
    case 'wake': {
      const u = tx.unit(cmd.unit);
      u.order = null;
      u.fortified = false;
      tx.emit({ type: 'orderChanged', unit: u.id, player: u.owner });
      break;
    }
    case 'skip': {
      const u = tx.unit(cmd.unit);
      u.movesLeft = 0;
      tx.emit({ type: 'orderChanged', unit: u.id, player: u.owner });
      break;
    }
    case 'disband': {
      // Cargo in port and army members are set down; cargo at sea goes down with the ship.
      const onLand = !rules.terrains[state.map.terrain[existing.tile]!]!.water;
      for (const c of cargoOf(state, cmd.unit)) {
        if (onLand) tx.unit(c.id).carriedBy = null;
        else removeUnitDeep(tx, c.id, false, 'sunk');
      }
      tx.removeUnit(cmd.unit);
      // Disbanded in one of the player's cities, half the unit's cost goes to the city's
      // current build (docs/rules/production.md); never toward Wealth.
      const home = cityAt(state, existing.tile);
      const salvage = Math.floor(rules.unit(existing.type).shieldCost / 2);
      if (home && home.owner === cmd.player && home.build && salvage > 0 && !(home.build.kind === 'building' && rules.building(home.build.id).kind === 'wealth')) {
        const c = tx.city(home.id);
        c.shields = home.shields + salvage;
        if (c.shieldsFor === null) c.shieldsFor = buildCategory(rules, home.build);
      }
      tx.emit({ type: 'unitDisbanded', unit: cmd.unit, player: cmd.player });
      break;
    }
    case 'work': {
      const check = checkJob(rules, state, existing, cmd.job);
      if (!check.ok) return err(state, 'cannotWork', check.reason);
      const tile = existing.tile;
      const current = state.work[tile];
      if (current && current.job !== cmd.job) {
        // Switching the tile to another job abandons the old one for everyone on it.
        tx.setWork(tile, null);
        for (const other of Object.values(state.units)) {
          if (other.tile === tile && other.id !== existing.id && other.order?.type === 'work') {
            tx.unit(other.id).order = null;
            tx.emit({ type: 'orderChanged', unit: other.id, player: other.owner });
          }
        }
      }
      const u = tx.unit(cmd.unit);
      u.order = { type: 'work', job: cmd.job };
      u.fortified = false;
      u.movesLeft = 0;
      tx.emit({ type: 'workStarted', unit: u.id, player: u.owner, tile, job: cmd.job, turns: turnsLeft(rules, tx.state, tile, cmd.job) });
      break;
    }
    case 'setRoutine': {
      const u = tx.unit(cmd.unit);
      u.routine = cmd.routine;
      if (cmd.routine === null && u.order?.type === 'goto') u.order = null;
      tx.emit({ type: 'orderChanged', unit: u.id, player: u.owner });
      break;
    }
  }
  return done(rules, tx);
}

/** Finishes a command: regicide is checked, and derived-data caches built during it are dropped. */
function done(rules: Rules, tx: Tx): ApplyResult {
  checkRegicide(rules, tx);
  invalidateCaches(tx.state);
  return { state: tx.state, events: tx.events };
}

/** Runs once every player has ended the turn (docs/rules/turns.md). */
function runEndOfTurn(rules: Rules, tx: Tx): void {
  runBarbarians(rules, tx);
  advanceWork(rules, tx);
  runCityTurn(rules, tx);
  runResistance(rules, tx);
  runCultureFlips(rules, tx, new Set(Object.values(tx.state.cities).filter((c) => c.disorder > 0).map((c) => c.id)));
  // A culture flip can take a civilization's last city.
  for (const e of tx.events) if (e.type === 'cityRevolted' && e.cause === 'culture') checkElimination(rules, tx, e.from, e.player);
  runGlobalWarming(rules, tx);
  healUnits(rules, tx);
  decayWeariness(tx);
  runDiplomacyTurn(rules, tx);
  checkRegicide(rules, tx);
  runVictory(rules, tx);
  tx.state.turn = tx.state.turn + 1;
  endGoldenAges(tx);
  for (const p of tx.state.players) if (p.alive && !p.barbarian) tx.player(p.id).endedTurn = false;
  const units = Object.values(tx.state.units).sort((a, b) => a.id - b.id);
  for (const u of units) {
    const full = unitMaxMoves(rules, tx.state, u);
    if (u.movesLeft !== full || u.acted || u.attacked) {
      const w = tx.unit(u.id);
      w.movesLeft = full;
      w.acted = false;
      w.attacked = false;
    }
  }
  tx.emit({ type: 'turnStarted', turn: tx.state.turn });
  // Sentries wake when a foreign unit comes into view.
  const owners = tileOwners(tx.state);
  for (const u of units) {
    if (u.order?.type !== 'sentry' || !tx.state.units[u.id] || u.carriedBy !== null) continue;
    const sees = unitSight(rules, tx.state, u).some((t) => (owners.get(t) ?? []).some((o) => o !== u.owner));
    if (sees) {
      tx.unit(u.id).order = null;
      tx.emit({ type: 'unitWoke', unit: u.id, player: u.owner, tile: u.tile });
    }
  }
  for (const u of units) if (u.order?.type === 'goto' && tx.state.units[u.id]) continueGoto(rules, tx, u.id);
}

export function tileTotal(state: GameState): number {
  return tileCount(state.map);
}
