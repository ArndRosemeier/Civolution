/**
 * One automation pass for a player at the start of its turn (PLAN.md §8): answers
 * offers, research, rates, templates and builds, governors, hurries, the player's own
 * rules, new units for the delegated aspects, unit routines with the worker pool, and
 * upgrades; then the turn digest. Every step is an ordinary command with a reason, and
 * a refused command is skipped (and noted), never forced.
 */
import {
  apply,
  buildBlocker,
  cityAt,
  playerCities,
  playerUnits,
  type Command,
  type GameEvent,
  type GameState,
  type Rules,
  type Unit,
} from '@civolution/engine';
import { buildsAutomated, governorFor, templateFor } from './assignments.ts';
import { defenders, unitRole } from './conditions.ts';
import { runCustomRules } from './custom.ts';
import { turnDigest, type DigestItem } from './digest.ts';
import { governCity, samePlacement } from './governors.ts';
import { dealAnswer, policyHurries, policyRates, policyResearch, policyUpgrades, sameRates } from './policies.ts';
import { proposeRoutine, type RoutineContext } from './routines.ts';
import { planGovernment } from './empire.ts';
import { buildNeeds, chooseBuild, findTemplate, templateForNewCity } from './templates.ts';
import { jobBoard, poolWorkers, type JobBoard } from './workers.ts';

export interface AutomationOptions {
  /** Events since the player's previous turn (new units, finished builds, captured cities…). */
  events?: readonly GameEvent[];
  /** The state at the start of the player's previous turn (trade-route keeper). */
  prev?: GameState;
  /** Also take idle units already on the map into the delegated aspects (when switching one on). */
  adopt?: boolean;
  /** Skip the digest (the AI and quick re-runs). */
  noDigest?: boolean;
}

export interface AutomationRun {
  state: GameState;
  events: GameEvent[];
  /** Commands applied, each with its reason. */
  commands: Command[];
  /** Commands the engine refused, with its message (a routine that went stale, say). */
  refused: { command: Command; error: string }[];
  digest: DigestItem[];
  board: JobBoard | null;
}

export function runAutomation(rules: Rules, state: GameState, player: number, opts: AutomationOptions = {}): AutomationRun {
  const events: GameEvent[] = [];
  const commands: Command[] = [];
  const refused: { command: Command; error: string }[] = [];
  const act = (cmd: Command): boolean => {
    const r = apply(rules, state, cmd);
    if (r.error) {
      refused.push({ command: cmd, error: r.error.message });
      return false;
    }
    state = r.state;
    events.push(...r.events);
    commands.push(cmd);
    return true;
  };
  const p0 = state.players[player];
  if (!p0?.alive || p0.endedTurn) return { state, events, commands, refused, digest: [], board: null };
  const before = opts.events ?? [];
  const a = () => state.players[player]!.automation;

  // Offers.
  if (a().delegate.diplomacy)
    for (const pr of state.diplomacy.proposals.filter((x) => x.to === player)) {
      const answer = dealAnswer(state, player, pr);
      if (answer) act({ type: 'answerDeal', player, proposal: pr.id, accept: answer.accept, reason: answer.reason });
    }
  // Research and rates.
  if (a().delegate.research || a().researchGoal) {
    const cmd = policyResearch(rules, state, player);
    if (cmd) act(cmd);
  }
  if (a().delegate.rates) {
    const p = state.players[player]!;
    const gov = planGovernment(rules, state, player);
    if (gov && !p.revolution && !rules.government(p.government).transitional)
      act({ type: 'revolution', player, government: gov, reason: `Empire policy: ${rules.government(gov).name} is the best government known` });
    const plan = policyRates(rules, state, player);
    if (plan && !sameRates(plan.rates, state.players[player]!.rates)) act({ type: 'setRates', player, rates: plan.rates, reason: plan.reason });
  }
  // Templates for new cities when builds are delegated.
  if (a().delegate.builds) {
    const captured = new Set(before.filter((e) => e.type === 'cityCaptured' && e.player === player).map((e) => (e as { city: number }).city));
    const missing = playerCities(state, player).filter((c) => !a().cityTemplates[c.id] && findTemplate(state, player, templateForNewCity(rules, state, c, captured.has(c.id))));
    if (missing.length > 0) {
      const settings = structuredClone(a());
      for (const c of missing) settings.cityTemplates[c.id] = { template: templateForNewCity(rules, state, c, captured.has(c.id)) };
      // Forget cities that are gone or changed hands.
      settings.cityTemplates = Object.fromEntries(Object.entries(settings.cityTemplates).filter(([id]) => state.cities[id]?.owner === player));
      settings.governors = Object.fromEntries(Object.entries(settings.governors).filter(([id]) => state.cities[id]?.owner === player));
      act({ type: 'setAutomation', player, settings, reason: `Templates for ${missing.length} new ${missing.length === 1 ? 'city' : 'cities'}` });
    }
  }
  // Builds: improvements in progress are kept; units and Wealth are reconsidered.
  const finished = new Set(before.filter((e) => e.type === 'cityBuilt' && e.player === player).map((e) => (e as { city: number }).city));
  const needs = buildNeeds(rules, state, player);
  for (const c of playerCities(state, player)) {
    if (!buildsAutomated(state, c)) continue;
    const city = state.cities[c.id]!;
    const keeping = city.build?.kind === 'building' && rules.building(city.build.id).kind !== 'wealth' && buildBlocker(rules, state, city, city.build) === null && !finished.has(city.id);
    if (keeping) continue;
    // A unit in production counts toward the needs it fills; it is chosen afresh.
    if (city.build?.kind === 'unit') {
      const r = unitRole(rules.unit(city.build.id));
      if (r === 'settler') needs.settlers++;
      if (r === 'worker') needs.workers++;
    }
    const pick = chooseBuild(rules, state, city, templateFor(state, city), needs);
    if (city.build && city.build.kind === pick.build.kind && city.build.id === pick.build.id) continue;
    act({ type: 'setBuild', player, city: city.id, build: pick.build, reason: pick.reason });
  }
  // Governors.
  const hurryCities: number[] = [];
  for (const c of playerCities(state, player)) {
    const g = governorFor(state, c);
    if (!g) continue;
    if (g.hurry) hurryCities.push(c.id);
    const city = state.cities[c.id]!;
    const plan = governCity(rules, state, city, g);
    if (samePlacement(city, plan)) continue;
    act({ type: 'setCitizens', player, city: city.id, worked: plan.worked, specialists: plan.specialists, reason: plan.reason });
  }
  for (const cmd of policyHurries(rules, state, player, hurryCities)) act(cmd);
  // The player's own rules.
  const custom = runCustomRules(rules, state, player, before);
  for (const cmd of custom.commands) act(cmd);
  // New units (and, when adopting, idle ones) join the delegated aspects.
  const fresh = new Set<number>();
  for (const e of before) if (e.type === 'cityBuilt' && e.player === player && e.unit !== undefined) fresh.add(e.unit);
  for (const e of before) if (e.type === 'unitCreated' && e.player === player) fresh.add(e.unit);
  for (const u of playerUnits(state, player)) {
    if (u.routine || u.carriedBy !== null || u.order !== null) continue;
    if (!fresh.has(u.id) && !opts.adopt) continue;
    const cmd = delegateUnit(rules, state, u);
    if (cmd) act(cmd);
  }
  // Routines, with one job board for the worker pool.
  const board = poolWorkers(state, player).length > 0 ? jobBoard(rules, state, player) : null;
  const run = runRoutines(rules, state, player, { ...(board ? { board } : {}) });
  state = run.state;
  events.push(...run.events);
  commands.push(...run.commands);
  refused.push(...run.refused);
  if (a().delegate.military) for (const cmd of policyUpgrades(rules, state, player)) act(cmd);
  const digest = opts.noDigest
    ? []
    : turnDigest(rules, state, player, { events: [...before, ...events], commands, ...(opts.prev ? { prev: opts.prev } : {}), notices: custom.notices, idleWorkers: board?.idle.length ?? 0 });
  return { state, events, commands, refused, digest, board };
}

/** The routine or order a new unit gets from the delegated aspects, or null. */
function delegateUnit(rules: Rules, state: GameState, u: Unit): Command | null {
  const a = state.players[u.owner]!.automation;
  const role = unitRole(rules.unit(u.type));
  const player = u.owner;
  if (role === 'worker' && a.delegate.workers) return { type: 'setRoutine', player, unit: u.id, routine: 'autoWorker', reason: 'Delegated: joins the worker pool' };
  if (role === 'settler' && a.delegate.builds) return { type: 'setRoutine', player, unit: u.id, routine: 'autoSettle', reason: 'Delegated: settles the best site nearby' };
  if (!a.delegate.military) return null;
  if (role === 'explorer') return { type: 'setRoutine', player, unit: u.id, routine: 'explore', reason: 'Delegated: explores' };
  if (role === 'siege') return { type: 'setRoutine', player, unit: u.id, routine: 'bombard', reason: 'Delegated: bombards enemies in range' };
  if (role !== 'defender' && role !== 'attacker') return null;
  const home = cityAt(state, u.tile);
  // One unit looks for land while the cities are guarded.
  const exploring = playerUnits(state, player).some((x) => x.routine === 'explore');
  if (!exploring && state.turn < 200 && (!home || home.owner !== player || defenders(rules, state, home) > a.garrison))
    return { type: 'setRoutine', player, unit: u.id, routine: 'explore', reason: 'Delegated: explores while the cities are guarded' };
  const rally = home && home.owner === player ? a.rally[home.id] : undefined;
  if (rally !== undefined && rally !== u.tile && role === 'attacker')
    return { type: 'setRoutine', player, unit: u.id, routine: `rally:${rally}`, reason: `Delegated: to ${home!.name}'s rally point` };
  return { type: 'setRoutine', player, unit: u.id, routine: 'garrison', reason: 'Delegated: garrisons the cities' };
}

export interface RoutineRun {
  state: GameState;
  events: GameEvent[];
  commands: Command[];
  refused: { command: Command; error: string }[];
}

/**
 * Runs every routine of one player until none has anything more to do this turn.
 * Each unit gets a bounded number of steps so a routine can never loop forever.
 */
export function runRoutines(rules: Rules, state: GameState, player: number, ctx: RoutineContext = {}): RoutineRun {
  const events: GameEvent[] = [];
  const commands: Command[] = [];
  const refused: { command: Command; error: string }[] = [];
  for (const unit of playerUnits(state, player)) {
    if (!unit.routine) continue;
    for (let step = 0; step < 8; step++) {
      const u = state.units[unit.id];
      if (!u?.routine) break;
      const proposal = proposeRoutine(rules, state, u, ctx);
      if (!proposal) break;
      const r = apply(rules, state, proposal.command);
      if (r.error) {
        // A routine proposed something the engine refused; stop it for this turn.
        refused.push({ command: proposal.command, error: r.error.message });
        break;
      }
      state = r.state;
      events.push(...r.events);
      commands.push(proposal.command);
      if (proposal.finished || proposal.command.type === 'skip' || proposal.command.type === 'work' || proposal.command.type === 'fortify') break;
      const after = state.units[unit.id];
      if (!after || after.movesLeft <= 0 || after.order?.type === 'goto') break;
    }
  }
  return { state, events, commands, refused };
}
