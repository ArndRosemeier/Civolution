/**
 * The game host: owns the authoritative state in a Web Worker so AI turns and
 * automation never block the UI thread (PLAN.md §4). The UI sends commands and gets
 * back the new state plus what the human player currently sees.
 */
import * as Comlink from 'comlink';
import { runRoutines } from '@civolution/automation';
import {
  apply,
  createGame,
  indexRules,
  levelHp,
  loadGame,
  neighbours,
  tilesInRadius,
  playerUnits,
  saveGame,
  tileCount,
  visibleTiles,
  type Command,
  type GameEvent,
  type GameState,
  type NewGameOptions,
  type Unit,
} from '@civolution/engine';
import { conquests } from '@civolution/rules';
import { conqueror } from '@civolution/sim';

const rules = indexRules(conquests);

export interface Snapshot {
  state: GameState;
  /** 1 where the human player sees the tile now. */
  visible: Uint8Array;
  human: number;
}

export interface CommandResult {
  snapshot: Snapshot;
  events: GameEvent[];
  error?: string;
}

let state: GameState | null = null;
let human = 0;

function snapshot(): Snapshot {
  if (!state) throw new Error('no game');
  return { state, visible: visibleTiles(rules, state, human), human };
}

function current(): GameState {
  if (!state) throw new Error('no game');
  return state;
}

/** Whether a player survived its own turn (a counter-attack can end a civilization). */
function stillAlive(s: GameState, i: number): boolean {
  return s.players[i]?.alive === true;
}

/**
 * Runs the AI players' turns and the human's routines for the new turn. Until the real
 * AI arrives (Phase 4) rivals are the scripted conqueror: they build, expand and, from
 * turn 40, go to war with their nearest neighbour.
 */
function finishRound(events: GameEvent[]): void {
  let s = current();
  s.players.forEach((p, i) => {
    if (i === human || !s.players[i]!.alive || p.endedTurn || p.barbarian) return;
    conqueror.takeTurn(rules, s, i, (cmd) => {
      const r = apply(rules, s, cmd);
      if (!r.error) {
        s = r.state;
        events.push(...r.events);
      }
      return s;
    });
    if (!stillAlive(s, i)) return;
    const r = apply(rules, s, { type: 'endTurn', player: i });
    if (!r.error) {
      s = r.state;
      events.push(...r.events);
    }
  });
  const run = runRoutines(rules, s, human);
  state = run.state;
  events.push(...run.events);
}

const host = {
  newGame(options: NewGameOptions, humanPlayer = 0): Snapshot {
    state = createGame(rules, options);
    human = humanPlayer;
    return snapshot();
  },

  command(cmd: Command): CommandResult {
    const r = apply(rules, current(), cmd);
    if (r.error) return { snapshot: snapshot(), events: [], error: r.error.message };
    state = r.state;
    const events = [...r.events];
    // Turning a routine on acts immediately rather than at the next turn.
    if (cmd.type === 'setRoutine' && cmd.routine) {
      const run = runRoutines(rules, state, human);
      state = run.state;
      events.push(...run.events);
    }
    return { snapshot: snapshot(), events };
  },

  endTurn(): CommandResult {
    const r = apply(rules, current(), { type: 'endTurn', player: human });
    if (r.error) return { snapshot: snapshot(), events: [], error: r.error.message };
    state = r.state;
    const events = [...r.events];
    finishRound(events);
    return { snapshot: snapshot(), events };
  },

  save(): string {
    return saveGame(current());
  },

  load(text: string): Snapshot {
    state = loadGame(rules, text);
    human = state.players.findIndex((p) => p.human);
    if (human < 0) human = 0;
    return snapshot();
  },

  /**
   * Benchmark setup (PLAN.md §10.1 go/no-go): reveals the map to the human and tops the
   * world up to `units` units on random land tiles.
   */
  benchSetup(units: number): Snapshot {
    let s = current();
    const n = tileCount(s.map);
    const players = s.players.map((p) => (p.id === human ? { ...p, explored: p.explored.map(() => 0xffffffff) } : p));
    const land: number[] = [];
    for (let i = 0; i < n; i++) if (!rules.terrains[s.map.terrain[i]!]!.water && !rules.terrains[s.map.terrain[i]!]!.impassable) land.push(i);
    const types = ['warrior', 'spearman', 'archer', 'settler', 'worker', 'scout', 'explorer'];
    const newUnits: Record<string, Unit> = { ...s.units };
    let next = s.nextUnitId;
    const taken = new Map<number, number>();
    for (const u of Object.values(s.units)) taken.set(u.tile, u.owner);
    for (let k = 0; Object.keys(newUnits).length < units && k < units * 20; k++) {
      const tile = land[(k * 7919 + 13) % land.length]!;
      const owner = (k * 31) % s.players.length;
      const holder = taken.get(tile);
      if (holder !== undefined && holder !== owner) continue;
      taken.set(tile, owner);
      const type = types[k % types.length]!;
      newUnits[next] = { id: next, owner, type, tile, movesLeft: rules.unit(type).movement * 3, experience: 'regular', hp: levelHp(rules, type, 'regular'), fortified: false, acted: false, attacked: false, carriedBy: null, order: null, routine: null };
      next++;
    }
    // A few galleys on coastal water so the ship model is part of the measurement.
    const coast = rules.terrainIndex('coast');
    let galleys = 0;
    for (let i = 0; i < n && galleys < Math.max(10, Math.floor(units / 20)); i += 37) {
      if (s.map.terrain[i] !== coast || taken.has(i)) continue;
      const owner = galleys % s.players.length;
      taken.set(i, owner);
      newUnits[next] = { id: next, owner, type: 'galley', tile: i, movesLeft: 9, experience: 'regular', hp: levelHp(rules, 'galley', 'regular'), fortified: false, acted: false, attacked: false, carriedBy: null, order: null, routine: null };
      next++;
      galleys++;
    }
    s = { ...s, players, units: newUnits, nextUnitId: next };
    state = s;
    return snapshot();
  },

  /**
   * Test scenario (`?scenario=skirmish`): the human's start gets an archer, a spearman and
   * a catapult, the next civilization a few units right next to them, and the two are at war.
   */
  skirmish(): Snapshot {
    let s = current();
    const other = s.players.findIndex((p, i) => i !== human && !p.barbarian);
    if (other < 0) return snapshot();
    const start = s.map.starts[human]!;
    const land = (t: number) => t >= 0 && !rules.terrains[s.map.terrain[t]!]!.water && !rules.terrains[s.map.terrain[t]!]!.impassable;
    const near = neighbours(s.map, start).filter(land);
    const ring2 = tilesInRadius(s.map, start, 2).filter((t) => land(t) && !near.includes(t) && t !== start);
    const units = { ...s.units };
    let next = s.nextUnitId;
    const put = (owner: number, type: string, tile: number, experience = 'regular') => {
      units[next] = { id: next, owner, type, tile, movesLeft: rules.unit(type).movement * rules.moveScale, experience, hp: levelHp(rules, type, experience), fortified: false, acted: false, attacked: false, carriedBy: null, order: null, routine: null };
      next++;
    };
    put(human, 'archer', start, 'veteran');
    put(human, 'spearman', start);
    put(human, 'catapult', start);
    // Two foes right next door (in sight), one a little further out.
    const spots = [...near.slice(0, 2), ...ring2.slice(0, 1)];
    for (const [i, t] of spots.entries()) put(other, i === 0 ? 'warrior' : i === 1 ? 'archer' : 'horseman', t);
    const players = s.players.map((p) => {
      if (p.id === human) return { ...p, atWarWith: [...p.atWarWith, other], explored: p.explored.map(() => 0xffffffff) };
      if (p.id === other) return { ...p, atWarWith: [...p.atWarWith, human] };
      return p;
    });
    s = { ...s, units, nextUnitId: next, players };
    state = s;
    return snapshot();
  },

  humanUnits(): number[] {
    return playerUnits(current(), human).map((u) => u.id);
  },
};

export type Host = typeof host;

Comlink.expose(host);
