/**
 * Headless games (PLAN.md D6, §11): whole games in Node with scripted players,
 * invariant checks after every turn, a command log for replays and a machine-readable
 * report.
 */
import { planEmpire, runRoutines } from '@civolution/automation';
import {
  apply,
  checkInvariants,
  createGame,
  exploredCount,
  IMP_ROAD,
  PLAYER_COLORS,
  playerCities,
  playerUnits,
  yearOf,
  stateHash,
  tileCount,
  type Command,
  type GameState,
  type NewGameOptions,
  type Rules,
} from '@civolution/engine';

/** A scripted player: issues commands for its turn through `act`, never touching state directly. */
export interface Controller {
  id: string;
  takeTurn(rules: Rules, state: GameState, player: number, act: (cmd: Command) => GameState): void;
}

/** Does nothing but end its turn. */
export const idle: Controller = { id: 'idle', takeTurn: () => undefined };

/**
 * Explorer: every non-worker explores, workers improve the land around home. All
 * through the automation routines, the same ones the player gets.
 */
export const explorer: Controller = {
  id: 'explorer',
  takeTurn(rules, state, player, act) {
    for (const u of playerUnits(state, player)) {
      if (u.routine) continue;
      const routine = rules.unit(u.type).jobs.length > 0 ? 'autoWorker' : 'explore';
      state = act({ type: 'setRoutine', player, unit: u.id, routine, reason: 'Scripted explorer player' });
    }
    const run = runRoutines(rules, state, player);
    for (const cmd of run.commands) act(cmd);
  },
};

/**
 * Builder: a single empire-builder that settles, builds, researches and changes
 * government with the automation helpers (the same ones the player will get).
 */
export const builder: Controller = {
  id: 'builder',
  takeTurn(rules, state, player, act) {
    for (const cmd of planEmpire(rules, state, player)) state = act(cmd);
    const garrisoned = new Set<number>();
    for (const u of playerUnits(state, player)) if (u.order?.type === 'fortify') garrisoned.add(u.tile);
    for (const u of playerUnits(state, player)) {
      if (u.routine || u.order) continue;
      const rule = rules.unit(u.type);
      const military = rule.attack + rule.defence > 0;
      const inCity = playerCities(state, player).some((c) => c.tile === u.tile);
      let routine: string | null = null;
      if (rule.specialActions.includes('buildCity')) routine = 'autoSettle';
      else if (rule.jobs.length > 0) routine = 'autoWorker';
      else if (!military || !inCity || garrisoned.has(u.tile)) routine = u.fortified ? null : 'explore';
      if (routine) state = act({ type: 'setRoutine', player, unit: u.id, routine, reason: 'Scripted builder player' });
      else if (rule.domain === 'land' && military && inCity) {
        garrisoned.add(u.tile);
        state = act({ type: 'fortify', player, unit: u.id, reason: 'Scripted builder player: garrison' });
      }
    }
    const run = runRoutines(rules, state, player);
    for (const cmd of run.commands) act(cmd);
  },
};

export const CONTROLLERS: Record<string, Controller> = { idle, explorer, builder };

export interface SimOptions {
  rules: Rules;
  game: NewGameOptions;
  controllers: Controller[];
  turns: number;
  /** Check invariants after every turn (default true). */
  invariants?: boolean;
  /** Stops early once this returns true (checked after every turn). */
  until?: (state: GameState) => boolean;
}

export interface SimReport {
  seed: number;
  worldSize: string;
  turns: number;
  players: {
    name: string;
    controller: string;
    explored: number;
    exploredPercent: number;
    units: number;
    gold: number;
    cities: number;
    population: number;
    techs: number;
    era: string;
    government: string;
    culture: number;
  }[];
  /** Year at the end of the run. */
  year: number;
  roads: number;
  commands: number;
  invariantFailures: { turn: number; problems: string[] }[];
  finalHash: string;
  msPerTurn: number;
}

export interface SimResult {
  state: GameState;
  log: Command[];
  report: SimReport;
}

export function runGame(opts: SimOptions, clock: () => number = () => 0): SimResult {
  const { rules } = opts;
  let state = createGame(rules, opts.game);
  const log: Command[] = [];
  const failures: SimReport['invariantFailures'] = [];
  const act = (cmd: Command): GameState => {
    const r = apply(rules, state, cmd);
    if (r.error) throw new Error(`turn ${state.turn}: ${cmd.type} by player ${cmd.player} rejected: ${r.error.message}`);
    state = r.state;
    log.push(cmd);
    return state;
  };
  const started = clock();
  let played = 0;
  for (let t = 0; t < opts.turns; t++) {
    played++;
    state.players.forEach((p, i) => {
      // Barbarians are moved by the engine at the end of the turn.
      if (!state.players[i]!.alive || p.barbarian) return;
      const controller = opts.controllers[i] ?? idle;
      // Routines replay their commands through `act`; feed them the current state.
      controller.takeTurn(rules, state, i, (cmd) => act(cmd));
      act({ type: 'endTurn', player: i });
    });
    if (opts.invariants !== false) {
      const problems = checkInvariants(rules, state);
      if (problems.length > 0) failures.push({ turn: state.turn, problems: problems.slice(0, 20) });
    }
    if (opts.until?.(state)) break;
  }
  const n = tileCount(state.map);
  return {
    state,
    log,
    report: {
      seed: opts.game.seed,
      worldSize: opts.game.map.worldSize,
      turns: played,
      players: state.players.map((p, i) => ({
        name: p.name,
        controller: p.barbarian ? 'barbarians' : (opts.controllers[i] ?? idle).id,
        explored: exploredCount(p),
        exploredPercent: Math.round((exploredCount(p) * 1000) / n) / 10,
        units: playerUnits(state, i).length,
        gold: p.gold,
        cities: playerCities(state, i).length,
        population: playerCities(state, i).reduce((a, c) => a + c.size, 0),
        techs: p.techs.length,
        era: rules.set.eras[p.era]!.id,
        government: p.government,
        culture: p.culture,
      })),
      year: yearOf(rules, state.turn),
      roads: state.map.improvements.filter((x) => x & IMP_ROAD).length,
      commands: log.length,
      invariantFailures: failures,
      finalHash: stateHash(state),
      msPerTurn: played > 0 ? Math.round(((clock() - started) / played) * 10) / 10 : 0,
    },
  };
}

/** Replays a command log from the same new-game options; returns the final state. */
export function replay(rules: Rules, game: NewGameOptions, log: readonly Command[]): GameState {
  let state = createGame(rules, game);
  for (const cmd of log) {
    const r = apply(rules, state, cmd);
    if (r.error) throw new Error(`replay diverged at ${cmd.type}: ${r.error.message}`);
    state = r.state;
  }
  return state;
}

export function defaultPlayers(count: number): NewGameOptions['players'] {
  return Array.from({ length: count }, (_, i) => ({ name: `Player ${i + 1}`, color: PLAYER_COLORS[i % PLAYER_COLORS.length]!, human: false }));
}
