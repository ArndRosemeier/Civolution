/**
 * New games, the command dispatcher and the turn pipeline.
 */
import type { Command, CommandError, GameEvent, HutOutcome } from './commands.ts';
import { tileCount, tilesInRadius } from './grid.ts';
import { generateMap } from './map/generate.ts';
import { checkMove, zocUnits } from './movement.ts';
import { findPath } from './pathfind.ts';
import { emptyBitset, invalidateTileOwners, maxMoves, tileOwners } from './queries.ts';
import { makeRng, seedRng } from './rng.ts';
import type { Rules } from './rules.ts';
import {
  FLAG_HUT,
  IMP_FORTRESS,
  type Barbarians,
  type Climate,
  type GameState,
  type LandForm,
  type MapSettings,
  type Player,
  type Temperature,
  type Unit,
} from './state.ts';
import { beginTx, type Tx } from './tx.ts';
import { reveal, unitSight } from './vision.ts';
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
  players: { name: string; color: string; human: boolean }[];
  /** Units every player starts with; defaults to the rule set's start units. */
  startUnits?: string[];
  /** Techs every player starts with (for tests and scenarios). */
  startTechs?: string[];
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
  const players: Player[] = options.players.map((p, id) => ({
    id,
    name: p.name,
    color: p.color,
    human: p.human,
    alive: true,
    gold: rules.set.general.startingGold,
    government: rules.set.general.defaultGovernment,
    techs: [...(options.startTechs ?? [])],
    resources: [],
    explored: emptyBitset(map),
    atWarWith: [],
    endedTurn: false,
  }));
  const base: GameState = {
    format: 'civolution-state',
    version: 1,
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
  };
  const tx = beginTx(base);
  players.forEach((p, i) => {
    const tile = map.starts[i]!;
    for (const type of startUnits) {
      const u = tx.addUnit(newUnit(rules, p.id, type, tile));
      reveal(tx, p.id, unitSight(rules, tx.state, u));
    }
  });
  return tx.state;
}

function newUnit(rules: Rules, owner: number, type: string, tile: number): Omit<Unit, 'id'> {
  return {
    owner,
    type,
    tile,
    movesLeft: rules.unit(type).movement * rules.moveScale,
    experience: 'regular',
    fortified: false,
    order: null,
    routine: null,
  };
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
  if (player.endedTurn) return err(state, 'turnEnded', 'This player has already ended the turn.');
  const tx = beginTx(state, cmd.reason);

  if (cmd.type === 'endTurn') {
    tx.player(cmd.player).endedTurn = true;
    tx.emit({ type: 'playerEndedTurn', player: cmd.player });
    if (tx.state.players.every((p) => !p.alive || p.endedTurn)) runEndOfTurn(rules, tx);
    return { state: tx.state, events: tx.events };
  }

  const existing = state.units[cmd.unit];
  if (!existing) return err(state, 'unknownUnit', `No unit ${cmd.unit}.`);
  if (existing.owner !== cmd.player) return err(state, 'notYourUnit', 'That unit belongs to another player.');

  switch (cmd.type) {
    case 'moveUnit': {
      const check = checkMove(rules, state, existing, cmd.to);
      if (!check.ok) return { state, events: [], error: check.error };
      const u = tx.unit(cmd.unit);
      u.order = null;
      doMove(rules, tx, u, cmd.to, check.cost);
      break;
    }
    case 'goto': {
      if (cmd.to === existing.tile) return err(state, 'invalid', 'The unit is already there.');
      if (!findPath(rules, state, existing, cmd.to)) return err(state, 'cannotEnter', 'No known route to that tile.');
      const u = tx.unit(cmd.unit);
      u.order = { type: 'goto', target: cmd.to };
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
      tx.removeUnit(cmd.unit);
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
  return { state: tx.state, events: tx.events };
}

function doMove(rules: Rules, tx: Tx, u: Unit, to: number, cost: number): void {
  const from = u.tile;
  const zoc = zocUnits(rules, tx.state, u, from, to, IMP_FORTRESS);
  u.tile = to;
  u.movesLeft = Math.max(0, u.movesLeft - cost);
  u.fortified = false;
  invalidateTileOwners(tx.state);
  tx.emit({ type: 'unitMoved', unit: u.id, player: u.owner, from, to, cost });
  if (zoc.length > 0) tx.emit({ type: 'zoneOfControl', unit: u.id, player: u.owner, from, to, by: zoc });
  reveal(tx, u.owner, unitSight(rules, tx.state, u));
  if (tx.state.map.flags[to]! & FLAG_HUT && rules.unit(u.type).domain === 'land') enterHut(rules, tx, u, to);
}

/**
 * Tribal villages. Phase 1 has gold, maps, a free unit or nothing; techs, barbarians and
 * settlers join when research and combat exist (docs/rules/huts.md).
 */
function enterHut(rules: Rules, tx: Tx, u: Unit, tile: number): void {
  const flags = tx.mapArray('flags');
  flags[tile] = flags[tile]! & ~FLAG_HUT;
  const roll = tx.random(100);
  let outcome: HutOutcome;
  if (roll < 35) {
    const amount = 25 * (1 + tx.random(3));
    tx.player(u.owner).gold += amount;
    outcome = { kind: 'gold', amount };
  } else if (roll < 55) {
    const tiles = reveal(tx, u.owner, tilesInRadius(tx.state.map, tile, 6), 'Map from a tribal village');
    outcome = { kind: 'map', tiles: tiles.length };
  } else if (roll < 75 && rules.hasUnit('warrior')) {
    const unit = tx.addUnit(newUnit(rules, u.owner, 'warrior', tile));
    tx.emit({ type: 'unitCreated', unit: unit.id, player: u.owner, unitType: 'warrior', tile });
    outcome = { kind: 'unit', unitType: 'warrior', unit: unit.id };
  } else {
    outcome = { kind: 'empty' };
  }
  tx.emit({ type: 'hutEntered', unit: u.id, player: u.owner, tile, outcome });
}

/** Moves a unit along its goto order as far as its movement allows. */
function continueGoto(rules: Rules, tx: Tx, unitId: number): void {
  for (let guard = 0; guard < 1000; guard++) {
    const u = tx.state.units[unitId];
    if (!u || u.order?.type !== 'goto') return;
    const target = u.order.target;
    if (u.tile === target) {
      tx.unit(unitId).order = null;
      tx.emit({ type: 'gotoFinished', unit: unitId, player: u.owner, arrived: true });
      return;
    }
    if (u.movesLeft <= 0) return;
    const path = findPath(rules, tx.state, u, target);
    const next = path?.tiles[0];
    const check = next === undefined ? null : checkMove(rules, tx.state, u, next);
    if (next === undefined || !check?.ok) {
      tx.unit(unitId).order = null;
      tx.emit({ type: 'gotoFinished', unit: unitId, player: u.owner, arrived: false });
      return;
    }
    doMove(rules, tx, tx.unit(unitId), next, check.cost);
  }
}

/** Runs once every player has ended the turn (docs/rules/turns.md). */
function runEndOfTurn(rules: Rules, tx: Tx): void {
  advanceWork(rules, tx);
  tx.state.turn = tx.state.turn + 1;
  for (const p of tx.state.players) if (p.alive) tx.player(p.id).endedTurn = false;
  const units = Object.values(tx.state.units).sort((a, b) => a.id - b.id);
  for (const u of units) {
    const full = maxMoves(rules, u);
    if (u.movesLeft !== full) tx.unit(u.id).movesLeft = full;
  }
  tx.emit({ type: 'turnStarted', turn: tx.state.turn });
  // Sentries wake when a foreign unit comes into view.
  const owners = tileOwners(tx.state);
  for (const u of units) {
    if (u.order?.type !== 'sentry') continue;
    const sees = unitSight(rules, tx.state, u).some((t) => (owners.get(t) ?? []).some((o) => o !== u.owner));
    if (sees) {
      tx.unit(u.id).order = null;
      tx.emit({ type: 'unitWoke', unit: u.id, player: u.owner, tile: u.tile });
    }
  }
  for (const u of units) if (u.order?.type === 'goto') continueGoto(rules, tx, u.id);
}

export function tileTotal(state: GameState): number {
  return tileCount(state.map);
}
