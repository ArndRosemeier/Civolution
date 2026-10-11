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
  type Deal,
  type GameEvent,
  type GameState,
  type NewGameOptions,
  type Unit,
} from '@civolution/engine';
import { conquests } from '@civolution/rules';
import { balance, respond, takeTurn } from '@civolution/ai';

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
 * Applies a command; an offer to an AI player is answered on the spot by that player's
 * AI (offers to the human wait in the state for the UI). Returns the error, if any.
 */
function applyCommand(cmd: Command, events: GameEvent[]): string | undefined {
  const r = apply(rules, current(), cmd);
  if (r.error) return r.error.message;
  state = r.state;
  events.push(...r.events);
  for (const e of r.events) {
    if (e.type !== 'dealProposed') continue;
    const s = current();
    const proposal = s.diplomacy.proposals.find((p) => p.id === e.proposal);
    if (!proposal || s.players[proposal.to]!.human) continue;
    applyCommand({ type: 'answerDeal', player: proposal.to, proposal: proposal.id, accept: respond(rules, s, proposal.to, proposal) }, events);
  }
  return undefined;
}

/** Runs the AI players' turns (@civolution/ai), then the human's routines for the new turn. */
function finishRound(events: GameEvent[]): void {
  current().players.forEach((p, i) => {
    const s = current();
    if (i === human || !s.players[i]!.alive || s.players[i]!.endedTurn || p.barbarian) return;
    takeTurn(rules, s, i, (cmd) => {
      applyCommand(cmd, events);
      return current();
    });
    if (!stillAlive(current(), i)) return;
    applyCommand({ type: 'endTurn', player: i }, events);
  });
  const run = runRoutines(rules, current(), human);
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
    const events: GameEvent[] = [];
    const error = applyCommand(cmd, events);
    if (error) return { snapshot: snapshot(), events: [], error };
    // Turning a routine on acts immediately rather than at the next turn.
    if (cmd.type === 'setRoutine' && cmd.routine) {
      const run = runRoutines(rules, current(), human);
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

  /**
   * The AI's view of a deal the human is about to offer: whether it would agree, and the
   * deal topped up with what it would ask for ("What would you want for this?").
   */
  appraise(deal: Deal): { accepts: boolean; counter: Deal | null } {
    const s = current();
    const counter = balance(rules, s, deal.to, deal);
    return { accepts: counter === deal, counter };
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
      const met = (q: typeof p, o: number) => (q.contacts.includes(o) ? q.contacts : [...q.contacts, o].sort((a, b) => a - b));
      if (p.id === human) return { ...p, atWarWith: [...p.atWarWith, other], warSince: { ...p.warSince, [other]: s.turn }, contacts: met(p, other), explored: p.explored.map(() => 0xffffffff) };
      if (p.id === other) return { ...p, atWarWith: [...p.atWarWith, human], warSince: { ...p.warSince, [human]: s.turn }, contacts: met(p, human) };
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
