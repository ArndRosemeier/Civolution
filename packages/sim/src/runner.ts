/**
 * Headless games (PLAN.md D6, §11): whole games in Node with scripted players,
 * invariant checks after every turn, a command log for replays and a machine-readable
 * report.
 */
import { takeTurn as aiTakeTurn, respond as aiRespond } from '@civolution/ai';
import { delegateEverything, planEmpire, runAutomation, runRoutines } from '@civolution/automation';
import {
  apply,
  checkInvariants,
  score,
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
  type Proposal,
  type Rules,
} from '@civolution/engine';

/** A scripted player: issues commands for its turn through `act`, never touching state directly. */
export interface Controller {
  id: string;
  takeTurn(rules: Rules, state: GameState, player: number, act: (cmd: Command) => GameState): void;
  /** Answers an offer made to this player; players without it decline everything. */
  respond?(rules: Rules, state: GameState, player: number, proposal: Proposal): boolean;
  /**
   * Refused commands are counted rather than fatal (the AI tries things the engine may
   * turn down, such as a route that just closed); `act` then returns the unchanged state.
   */
  lenient?: boolean;
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
    manageUnits(rules, state, player, act);
  },
};

/** The builder's unit handling: settlers settle, workers work, one defender per city, the rest explore. */
function manageUnits(rules: Rules, state: GameState, player: number, act: (cmd: Command) => GameState): void {
  const garrisoned = new Set<number>();
  for (const u of playerUnits(state, player)) if (u.order?.type === 'fortify') garrisoned.add(u.tile);
  for (const u of playerUnits(state, player)) {
    if (u.routine || u.order || u.carriedBy !== null) continue;
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
}

/**
 * Automated: hands everything to the player automation (PLAN.md §8) and does nothing
 * else, the way a player who delegates every aspect would play.
 */
export const automated: Controller = {
  id: 'automated',
  takeTurn(rules, state, player, act) {
    if (!state.players[player]!.automation.delegate.cities)
      state = act({ type: 'setAutomation', player, settings: delegateEverything(state.players[player]!.automation), reason: 'Scripted automated player: everything delegated' });
    const run = runAutomation(rules, state, player, { adopt: true, noDigest: true });
    for (const cmd of run.commands) state = act(cmd);
  },
};

/** The computer player (@civolution/ai). */
export const ai: Controller = { id: 'ai', lenient: true, takeTurn: aiTakeTurn, respond: aiRespond };

export const CONTROLLERS: Record<string, Controller> = { idle, explorer, builder, automated, ai };

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
    score: number;
    alive: boolean;
    reputation: number;
    contacts: number;
    civ: string | null;
  }[];
  /** Year at the end of the run. */
  year: number;
  roads: number;
  commands: number;
  invariantFailures: { turn: number; problems: string[] }[];
  war: { battles: number; attackerWins: number; citiesCaptured: number; citiesDestroyed: number; unitsLost: number; leaders: number; barbarianCamps: number };
  diplomacy: { wars: number; peaces: number; ceasefires: number; deals: number; proposals: number; rejected: number; treatiesBroken: number; contacts: number; missions: number; eliminated: number };
  /** Commands lenient controllers sent that the engine refused. */
  refused: number;
  finalHash: string;
  msPerTurn: number;
  /** Slowest turn, in milliseconds (a stall shows here). */
  maxMsPerTurn: number;
  /** How the game was won, if it was. */
  victory: GameState['victory'];
  /** Golden ages that began. */
  goldenAges: number;
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
  const war: SimReport['war'] = { battles: 0, attackerWins: 0, citiesCaptured: 0, citiesDestroyed: 0, unitsLost: 0, leaders: 0, barbarianCamps: 0 };
  const diplomacy: SimReport['diplomacy'] = { wars: 0, peaces: 0, ceasefires: 0, deals: 0, proposals: 0, rejected: 0, treatiesBroken: 0, contacts: 0, missions: 0, eliminated: 0 };
  let refused = 0;
  const act = (cmd: Command, lenient = false): GameState => {
    const r = apply(rules, state, cmd);
    if (r.error) {
      if (lenient) {
        refused++;
        return state;
      }
      throw new Error(`turn ${state.turn}: ${cmd.type} by player ${cmd.player} rejected: ${r.error.message}`);
    }
    for (const e of r.events) {
      if (e.type === 'warDeclared') diplomacy.wars++;
      else if (e.type === 'peaceMade') diplomacy.peaces++;
      else if (e.type === 'ceasefireAgreed') diplomacy.ceasefires++;
      else if (e.type === 'dealMade') diplomacy.deals++;
      else if (e.type === 'dealProposed') diplomacy.proposals++;
      else if (e.type === 'dealRejected') diplomacy.rejected++;
      else if (e.type === 'treatyBroken') diplomacy.treatiesBroken++;
      else if (e.type === 'contactMade') diplomacy.contacts++;
      else if (e.type === 'espionage') diplomacy.missions++;
      else if (e.type === 'playerEliminated') diplomacy.eliminated++;
    }
    for (const e of r.events) {
      if (e.type === 'combat') {
        war.battles++;
        if (e.result === 'attackerWon') war.attackerWins++;
      } else if (e.type === 'cityCaptured') war.citiesCaptured++;
      else if (e.type === 'cityDestroyed') war.citiesDestroyed++;
      else if (e.type === 'unitLost') war.unitsLost++;
      else if (e.type === 'leaderBorn') war.leaders++;
      else if (e.type === 'campAppeared') war.barbarianCamps++;
    }
    state = r.state;
    log.push(cmd);
    // Offers are answered on the spot by the recipient's controller (humans and scripts decline).
    for (const e of r.events) {
      if (e.type !== 'dealProposed') continue;
      const proposal = state.diplomacy.proposals.find((p) => p.id === e.proposal);
      if (!proposal) continue;
      const responder = opts.controllers[proposal.to] ?? idle;
      if (state.players[proposal.to]!.human) continue;
      const accept = responder.respond?.(rules, state, proposal.to, proposal) ?? false;
      act({ type: 'answerDeal', player: proposal.to, proposal: proposal.id, accept }, true);
    }
    return state;
  };
  const started = clock();
  let played = 0;
  let slowest = 0;
  for (let t = 0; t < opts.turns; t++) {
    played++;
    const turnStart = clock();
    state.players.forEach((p, i) => {
      // Barbarians are moved by the engine at the end of the turn.
      if (!state.players[i]!.alive || p.barbarian) return;
      const controller = opts.controllers[i] ?? idle;
      // Routines replay their commands through `act`; feed them the current state.
      controller.takeTurn(rules, state, i, (cmd) => act(cmd, controller.lenient === true));
      // A counter-attack during its own turn can end a civilization (takeTurn replaced `state`).
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (state.players[i]!.alive && !state.players[i]!.endedTurn) act({ type: 'endTurn', player: i });
    });
    slowest = Math.max(slowest, clock() - turnStart);
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
        score: score(rules, state, i),
        alive: p.alive,
        reputation: p.reputation,
        contacts: p.contacts.length,
        civ: p.civ,
      })),
      year: yearOf(rules, state.turn),
      roads: state.map.improvements.filter((x) => x & IMP_ROAD).length,
      commands: log.length,
      invariantFailures: failures,
      war,
      diplomacy,
      refused,
      finalHash: stateHash(state),
      msPerTurn: played > 0 ? Math.round(((clock() - started) / played) * 10) / 10 : 0,
      maxMsPerTurn: Math.round(slowest * 10) / 10,
      victory: state.victory,
      goldenAges: state.players.filter((p) => p.hadGoldenAge).length,
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

/** Unnamed players, or with `civs` the civilizations to play (one per player, in order). */
export function defaultPlayers(count: number, civs?: readonly string[]): NewGameOptions['players'] {
  return Array.from({ length: count }, (_, i) => ({
    name: civs?.[i] ? civs[i] : `Player ${i + 1}`,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
    human: false,
    ...(civs?.[i] ? { civ: civs[i] } : {}),
  }));
}

/** A different set of civilizations for each seed, the same set for the same seed. */
export function civsForSeed(rules: Rules, seed: number, count: number): string[] {
  const ids = rules.set.civs.map((c) => c.id);
  const out: string[] = [];
  for (let i = 0; out.length < count && i < ids.length * 2; i++) {
    const id = ids[(seed * 7 + i * 11) % ids.length]!;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
