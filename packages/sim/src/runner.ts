/**
 * Headless games (PLAN.md D6, §11): whole games in Node with scripted players,
 * invariant checks after every turn, a command log for replays and a machine-readable
 * report.
 */
import { planEmpire, runRoutines } from '@civolution/automation';
import {
  apply,
  attackBlocker,
  buildOptions,
  distance,
  findPath,
  neighbours,
  previewAttack,
  type City,
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

/** The strongest attacker a city can build now, or null. */
function bestAttacker(rules: Rules, state: GameState, city: City): string | null {
  const options = buildOptions(rules, state, city)
    .filter((o) => o.blocker === null && o.build.kind === 'unit')
    .map((o) => rules.unit(o.build.id))
    .filter((u) => u.domain === 'land' && u.attack > u.defence && u.populationCost === 0)
    .sort((a, b) => b.attack - a.attack || a.shieldCost - b.shieldCost || a.id.localeCompare(b.id));
  return options[0]?.id ?? null;
}

/**
 * Conqueror: the builder's economy, then an army of attackers sent against the nearest
 * civilization from turn 40 on. Exercises combat, capture and war weariness in
 * headless games; the real AI arrives in Phase 4.
 */
export const conqueror: Controller = {
  id: 'conqueror',
  takeTurn(rules, state, player, act) {
    const p = state.players[player]!;
    const atWarWith = p.atWarWith.filter((x) => state.players[x]?.alive);
    for (const cmd of planEmpire(rules, state, player)) {
      if (cmd.type === 'disband' && atWarWith.length > 0) continue;
      state = act(cmd);
    }
    const mine = playerCities(state, player);
    if (mine.length === 0) {
      manageUnits(rules, state, player, act);
      return;
    }
    const capital = mine.find((c) => 'palace' in c.buildings) ?? mine[0]!;
    // Pick a war once the empire stands.
    if (state.turn >= 40 && atWarWith.length === 0) {
      const rivals = state.players
        .filter((q) => q.alive && !q.barbarian && q.id !== player && playerCities(state, q.id).length > 0)
        .map((q) => ({ q, d: Math.min(...playerCities(state, q.id).map((c) => distance(state.map, c.tile, capital.tile))) }))
        .sort((a, b) => a.d - b.d || a.q.id - b.q.id);
      const target = rivals[0];
      if (target) state = act({ type: 'declareWar', player, target: target.q.id, reason: 'Scripted conqueror: nearest rival' });
    }
    // Cities beyond the capital train attackers once they hold a defender.
    if (state.turn >= 30) {
      for (const c of playerCities(state, player)) {
        if (c.id === capital.id || (c.build?.kind === 'building' && c.shields > 0)) continue;
        const defended = playerUnits(state, player).some((u) => u.tile === c.tile && rules.unit(u.type).defence >= rules.unit(u.type).attack && rules.unit(u.type).defence > 0);
        if (!defended) continue;
        const unit = bestAttacker(rules, state, c);
        if (unit && !(c.build?.kind === 'unit' && c.build.id === unit)) state = act({ type: 'setBuild', player, city: c.id, build: { kind: 'unit', id: unit }, reason: 'Scripted conqueror: attackers' });
      }
    }
    const enemies = state.players[player]!.atWarWith;
    const targets = Object.values(state.cities).filter((c) => enemies.includes(c.owner)).sort((a, b) => a.id - b.id);
    for (const u0 of playerUnits(state, player)) {
      const u = state.units[u0.id];
      if (!u || u.carriedBy !== null) continue;
      const r = rules.unit(u.type);
      if (r.domain !== 'land' || r.attack <= r.defence || targets.length === 0) continue;
      if (u.routine) state = act({ type: 'setRoutine', player, unit: u.id, routine: null, reason: 'Scripted conqueror: to war' });
      for (let step = 0; step < 4; step++) {
        const v = state.units[u.id];
        if (!v || v.movesLeft <= 0) break;
        // Attack a neighbouring enemy when the odds are good enough.
        const near = neighbours(state.map, v.tile)
          .filter((t) => Object.values(state.units).some((x) => x.tile === t && enemies.includes(x.owner)) || targets.some((c) => c.tile === t))
          .sort((a, b) => a - b);
        let acted = false;
        for (const t of near) {
          if (attackBlocker(rules, state, v, t)) continue;
          const preview = previewAttack(rules, state, v, t);
          if (preview && preview.odds.attackerWins < 0.45) continue;
          state = act({ type: 'moveUnit', player, unit: v.id, to: t, reason: 'Scripted conqueror: attack' });
          acted = true;
          break;
        }
        if (acted) continue;
        const goal = [...targets].sort((a, b) => distance(state.map, a.tile, v.tile) - distance(state.map, b.tile, v.tile) || a.id - b.id)[0]!;
        const approach = neighbours(state.map, goal.tile)
          .sort((a, b) => distance(state.map, a, v.tile) - distance(state.map, b, v.tile) || a - b)
          .slice(0, 3)
          .find((t) => t === v.tile || findPath(rules, state, v, t) !== null);
        if (approach === undefined || approach === v.tile) break;
        state = act({ type: 'goto', player, unit: v.id, to: approach, reason: `Scripted conqueror: marching on ${goal.name}` });
        break;
      }
    }
    manageUnits(rules, state, player, act);
  },
};

export const CONTROLLERS: Record<string, Controller> = { idle, explorer, builder, conqueror };

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
  war: { battles: number; attackerWins: number; citiesCaptured: number; citiesDestroyed: number; unitsLost: number; leaders: number; barbarianCamps: number };
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
  const war: SimReport['war'] = { battles: 0, attackerWins: 0, citiesCaptured: 0, citiesDestroyed: 0, unitsLost: 0, leaders: 0, barbarianCamps: 0 };
  const act = (cmd: Command): GameState => {
    const r = apply(rules, state, cmd);
    if (r.error) throw new Error(`turn ${state.turn}: ${cmd.type} by player ${cmd.player} rejected: ${r.error.message}`);
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
      war,
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
