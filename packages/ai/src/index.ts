/**
 * @civolution/ai: the computer players (PLAN.md §9). A layered planner: grand strategy
 * (expand, build, prepare for war, fight) → operations (settling, the campaign against
 * one city, garrisons) → tactics (attack odds from the engine's own preview) → city
 * management through @civolution/automation with AI weights. Diplomacy reads the
 * engine's attitude model. The AI issues ordinary commands only and sees only what its
 * fog of war shows.
 */
import { bestSite, governCity, jobBoard, planGovernment, planRates, planResearch, poolWorkers, proposeRoutine, samePlacement, type RoutineContext } from '@civolution/automation';
import {
  buildBlocker,
  cargoOf,
  cityAt,
  cityReport,
  draftBlocker,
  launchBlocker,
  unitAvailable,
  researchBlocker,
  isCoastal,
  distance,
  hurryQuote,
  playerCities,
  playerUnits,
  unitSupportCost,
  type Command,
  type GameState,
  type Proposal,
  type Rates,
  type Rules,
} from '@civolution/engine';
import { aiBuild, fieldCount, garrisonFor, unitChoices, wantedField, defendersIn, type AiBuild, type BuildNeeds } from './build.ts';
import { offerHumans, planWar, respond, runTrade } from './diplomacy.ts';
import { chooseTarget, counterAttack, fieldUnits, gather, manageGarrisons, runAir, runCampaign, runLeaders, runUpgrades, strikeExposed, type Ctx } from './military.ts';
import { canSail, chooseInvasion, colonySite, explorerShip, musterForInvasion, reach, runColonists, runTransports, transportCount, wantsSeaExplorer, type Invasion } from './naval.ts';
import { buildView, roleOf, type View } from './view.ts';

export { accepts, balance, dealGain, peaceValue } from './value.ts';
export { personality, roleOf, buildView, type Personality, type View } from './view.ts';
export { respond } from './diplomacy.ts';

const why = (text: string) => `AI: ${text}`;

/** Research, government and rates, with the civilization's favourite government first. */
function runEmpire(ctx: Ctx): void {
  const { view } = ctx;
  const rules = view.rules;
  // Free advances owed (docs/rules/science.md): each is the advance research would pick, learned at once.
  for (let guard = 0; guard < 10 && (ctx.state().players[view.player]!.freeAdvances ?? 0) > 0; guard++) {
    const tech = planResearch(rules, ctx.state(), view.player);
    if (!tech) break;
    ctx.act({ type: 'setResearch', player: view.player, tech, reason: why(`free advance: ${rules.tech(tech).name}`) });
  }
  const s = ctx.state();
  const p = s.players[view.player]!;
  if (p.research.tech === null) {
    const goal = seaGoal(view, s);
    const step = goal ? towards(rules, p, goal) : null;
    const tech = step ?? planResearch(rules, s, view.player);
    if (tech) ctx.act({ type: 'setResearch', player: view.player, tech, reason: why(step ? `ships to cross the sea (${rules.tech(goal!).name})` : 'next advance') });
  }
  const gov = rules.government(p.government);
  if (!p.revolution && !gov.transitional) {
    const fav = view.traits.favourite;
    const favRule = fav ? rules.set.governments.find((g) => g.id === fav) : undefined;
    let target: string | null = null;
    if (favRule && (!favRule.requiredTech || p.techs.includes(favRule.requiredTech)) && p.government !== fav) target = fav;
    else if (p.government !== fav) {
      const plan = planGovernment(rules, s, view.player);
      if (plan && plan !== view.traits.shunned) target = plan;
    }
    // Republics and democracies tire of war: a warlike civilization keeps a monarchy at war.
    if (target && view.enemies.length > 0 && rules.government(target).warWeariness === 'high' && view.traits.aggression > 0) target = null;
    if (target) {
      ctx.act({ type: 'revolution', player: view.player, government: target, reason: why(`${rules.government(target).name} suits us`) });
      return;
    }
  }
  if (gov.transitional) return;
  // A finished spaceship flies at once.
  if (launchBlocker(rules, ctx.state(), view.player) === null) ctx.act({ type: 'launchSpaceship', player: view.player, reason: why('the spaceship is ready') });
  const rates = fiscalRates(rules, ctx.state(), view.player);
  const now = ctx.state().players[view.player]!.rates;
  if (rates.tax !== now.tax || rates.science !== now.science || rates.luxury !== now.luxury) ctx.act({ type: 'setRates', player: view.player, rates, reason: why('balancing the treasury') });
}

/** Whether no own city has a free city site within reach (once per turn). */
function isLandFull(view: View, state: GameState): boolean {
  view.landFull ??= view.cities.every((c) => bestSite(view.rules, state, view.player, c.tile, 12) < 0);
  return view.landFull;
}

/** The first advance on the way to `goal` that can be researched now (the goal itself if it can), or null. */
function towards(rules: Rules, p: GameState['players'][number], goal: string): string | null {
  const seen = new Set<string>();
  const queue = [goal];
  const candidates: string[] = [];
  while (queue.length > 0) {
    const t = queue.shift()!;
    if (seen.has(t) || p.techs.includes(t)) continue;
    seen.add(t);
    if (researchBlocker(rules, p, t) === null) candidates.push(t);
    else queue.push(...rules.tech(t).prerequisites);
  }
  return candidates.sort((a, b) => rules.tech(a).costFactor - rules.tech(b).costFactor || a.localeCompare(b))[0] ?? null;
}

/**
 * An island civilization that has met no one, or has filled its land, aims its research
 * at a ship that sails farther than any it can build now.
 */
function seaGoal(view: View, state: GameState): string | null {
  const rules = view.rules;
  const p = state.players[view.player]!;
  if (state.turn < 30 || !view.cities.some((c) => isCoastal(rules, state, c.tile))) return null;
  const landFull = isLandFull(view, state);
  if (view.me.contacts.length > 0 && !landFull) return null;
  const known = rules.set.units.filter((u) => u.domain === 'sea' && u.capacity > 0 && unitAvailable(rules, state, view.player, u.id) && (!u.requiredTech || p.techs.includes(u.requiredTech)));
  const have = Math.max(-1, ...known.map(reach));
  const next = rules.set.units
    .filter((u) => u.domain === 'sea' && u.capacity > 0 && unitAvailable(rules, state, view.player, u.id) && u.requiredTech && !p.techs.includes(u.requiredTech) && reach(u) > have)
    .sort((a, b) => reach(a) - reach(b) || rules.tech(a.requiredTech!).costFactor - rules.tech(b.requiredTech!).costFactor || a.id.localeCompare(b.id))[0];
  return next?.requiredTech ?? null;
}

/** Gold per turn at the given rates: taxes less building upkeep and unit support. */
function netIncome(rules: Rules, state: GameState, player: number, rates: Rates): number {
  const p = state.players[player]!;
  const s: GameState = { ...state, players: state.players.map((x) => (x.id === player ? { ...p, rates } : x)) };
  let net = -unitSupportCost(rules, s, player);
  for (const c of playerCities(s, player)) {
    const r = cityReport(rules, s, c);
    net += r.tax.value - r.upkeep.value;
  }
  return net;
}

/**
 * The automation's rates, with science traded for taxes until the treasury stops
 * shrinking: income is measured at the planned rates and at full taxes, and the tax
 * share set in between (two city sweeps instead of one per step).
 */
function fiscalRates(rules: Rules, state: GameState, player: number): Rates {
  const base = planRates(rules, state, player);
  const p = state.players[player]!;
  if (p.gold > 60 + playerCities(state, player).length * 10) return base;
  const cap = Math.floor(rules.government(p.government).rateCap / 10);
  const at = (tax: number): Rates => ({ tax, science: 10 - base.luxury - tax, luxury: base.luxury });
  const low = netIncome(rules, state, player, base);
  if (low >= 0) return base;
  const top = Math.min(cap, 10 - base.luxury);
  const high = netIncome(rules, state, player, at(top));
  if (high <= low || top <= base.tax) return at(top);
  const steps = Math.ceil((-low * (top - base.tax)) / (high - low));
  return at(Math.min(top, base.tax + Math.max(1, steps)));
}

/** City builds, keeping improvements in progress unless the city is in danger. All planned on one state. */
function runCities(ctx: Ctx, needs: BuildNeeds): void {
  const { view } = ctx;
  const rules = view.rules;
  const s = ctx.state();
  const plans: { city: number; build: AiBuild; danger: boolean }[] = [];
  for (const c of playerCities(s, view.player)) {
    const danger = defendersIn(view, s, c) === 0 || (view.threat.get(c.id) ?? 0) > 0;
    const keeping = c.build?.kind === 'building' && c.build.id !== 'wealth' && buildBlocker(rules, s, c, c.build) === null && !danger;
    if (keeping) continue;
    plans.push({ city: c.id, build: aiBuild(view, s, c, needs), danger });
  }
  for (const { city, build, danger } of plans) {
    const c = ctx.state().cities[city];
    if (!c) continue;
    if (!c.build || c.build.kind !== build.build.kind || c.build.id !== build.build.id) ctx.act({ type: 'setBuild', player: view.player, city, build: build.build, reason: build.reason });
    // Buy a defender for a threatened city.
    const after = ctx.state().cities[city]!;
    if (danger && after.build?.kind === 'unit' && roleOf(rules.unit(after.build.id)) === 'defender') {
      const q = hurryQuote(rules, ctx.state(), after);
      if (q.kind === 'gold' && ctx.state().players[view.player]!.gold >= q.gold + 20) ctx.act({ type: 'hurry', player: view.player, city, reason: why('buying a defender for a threatened city') });
    }
    // Draft a defender where enemies are close, the garrison is thin and the city can spare a citizen.
    const now = ctx.state().cities[city]!;
    if ((view.threat.get(city) ?? 0) > 0 && now.size >= 4 && defendersIn(view, ctx.state(), now) < 2 && draftBlocker(rules, ctx.state(), now) === null)
      ctx.act({ type: 'draft', player: view.player, city, reason: why('drafting a defender for a threatened city') });
  }
}

/**
 * Citizens: the automation's Balanced governor, or Production while the city is in
 * danger. Only cities whose placement would change get a command.
 */
function runGovernors(ctx: Ctx): void {
  const { view } = ctx;
  for (const c of playerCities(ctx.state(), view.player)) {
    const s = ctx.state();
    const city = s.cities[c.id]!;
    const danger = (view.threat.get(city.id) ?? 0) > 0;
    // A city raising settlers or workers wants food above all (the citizens they take regrow).
    const raising = city.build?.kind === 'unit' && view.rules.unit(city.build.id).populationCost > 0;
    const plan = governCity(view.rules, s, city, { preset: danger ? 'production' : raising ? 'growth' : 'balanced', hurry: false });
    if (samePlacement(city, plan)) continue;
    ctx.act({ type: 'setCitizens', player: view.player, city: city.id, worked: plan.worked, specialists: plan.specialists, reason: why(plan.reason) });
  }
}

/** Settlers settle, workers work, scouts explore, ships wait in port. */
function runCivilians(ctx: Ctx, garrison: Set<number>): void {
  const { view } = ctx;
  const rules = view.rules;
  const s = ctx.state();
  let explorers = playerUnits(s, view.player).filter((u) => u.routine === 'explore').length;
  // The farthest-sailing idle ship explores the seas.
  const scoutShip = playerUnits(s, view.player)
    .filter((u) => roleOf(rules.unit(u.type)) === 'naval' && !u.routine && u.carriedBy === null && cargoOf(s, u.id).length === 0)
    .sort((a, b) => reach(rules.unit(b.type)) - reach(rules.unit(a.type)) || a.id - b.id)[0]?.id;
  for (const u of playerUnits(s, view.player)) {
    if (u.carriedBy !== null || u.routine) continue;
    const r = rules.unit(u.type);
    const role = roleOf(r);
    if (role === 'settler') {
      // Settle on this land if there is room; otherwise wait for a ship (runColonists).
      if (bestSite(rules, s, view.player, u.tile, 12) >= 0) ctx.act({ type: 'setRoutine', player: view.player, unit: u.id, routine: 'autoSettle', reason: why('settling') });
    }
    else if (role === 'worker') ctx.act({ type: 'setRoutine', player: view.player, unit: u.id, routine: 'autoWorker', reason: why('improving the land') });
    else if (role === 'explorer' && s.turn < 150) ctx.act({ type: 'setRoutine', player: view.player, unit: u.id, routine: 'explore', reason: why('exploring') });
    else if (explorers < 2 && s.turn < 80 && (role === 'defender' || role === 'attacker') && !garrison.has(u.id) && r.domain === 'land' && u.order?.type !== 'goto') {
      explorers++;
      ctx.act({ type: 'setRoutine', player: view.player, unit: u.id, routine: 'explore', reason: why('exploring') });
    } else if (role === 'defender' && u.order === null && u.movesLeft > 0 && cityAt(s, u.tile)?.owner === view.player)
      ctx.act({ type: 'fortify', player: view.player, unit: u.id, reason: why('reserve') });
    else if (role === 'naval' && u.id === scoutShip && wantsSeaExplorer(view, ctx.state())) ctx.act({ type: 'setRoutine', player: view.player, unit: u.id, routine: 'explore', reason: why('exploring the seas') });
    else if (role === 'explorer' && u.order === null && cityAt(s, u.tile)) ctx.act({ type: 'sentry', player: view.player, unit: u.id, reason: why('resting') });
  }
}

/**
 * Units cost gold beyond the government's free support: when that drains the treasury,
 * the weakest defenders beyond what the garrisons need are disbanded.
 */
function trimUnits(ctx: Ctx, garrison: Set<number>): void {
  const { view } = ctx;
  const rules = view.rules;
  const s = ctx.state();
  const support = unitSupportCost(rules, s, view.player);
  if (support <= 0) return;
  const taxes = view.cities.reduce((a, c) => a + cityReport(rules, s, c).tax.value, 0);
  if (s.players[view.player]!.gold > 40 + view.cities.length * 10 && support * 3 <= taxes) return;
  const per = Math.max(1, rules.government(s.players[view.player]!.government).unitCost);
  const spare = playerUnits(s, view.player)
    .filter((u) => !garrison.has(u.id) && u.carriedBy === null && roleOf(rules.unit(u.type)) === 'defender' && cityAt(s, u.tile)?.owner === view.player)
    .sort((a, b) => rules.unit(a.type).defence - rules.unit(b.type).defence || a.id - b.id);
  for (const u of spare.slice(0, Math.ceil(support / per))) ctx.act({ type: 'disband', player: view.player, unit: u.id, reason: why('unit upkeep: not needed in the garrison') });
}

/**
 * Runs every unit routine to completion for the turn, through the given command channel.
 * Workers share the automation's worker pool (one job board per turn).
 */
function runRoutines(ctx: Ctx): void {
  const rules = ctx.view.rules;
  const player = ctx.view.player;
  const routineCtx: RoutineContext = poolWorkers(ctx.state(), player).length > 0 ? { board: jobBoard(rules, ctx.state(), player) } : {};
  for (const unit of playerUnits(ctx.state(), player)) {
    if (!unit.routine) continue;
    for (let step = 0; step < 8; step++) {
      const u = ctx.state().units[unit.id];
      if (!u?.routine) break;
      const proposal = proposeRoutine(rules, ctx.state(), u, routineCtx);
      if (!proposal || !ctx.act(proposal.command)) break;
      if (proposal.finished || proposal.command.type === 'skip' || proposal.command.type === 'work' || proposal.command.type === 'fortify') break;
      const after = ctx.state().units[unit.id];
      if (!after || after.movesLeft <= 0 || after.order?.type === 'goto') break;
    }
  }
}

/** One AI turn. `act` applies a command and returns the new state (the same state when it was refused). */
export function takeTurn(rules: Rules, state: GameState, player: number, act: (cmd: Command) => GameState): void {
  let current = state;
  const ctx: Ctx = {
    view: null as unknown as View,
    state: () => current,
    act: (cmd) => {
      const next = act(cmd);
      const ok = next !== current;
      current = next;
      return ok;
    },
  };
  ctx.view = buildView(rules, current, player);
  if (ctx.view.cities.length === 0 && playerUnits(current, player).every((u) => !rules.unit(u.type).specialActions.includes('buildCity'))) return;
  runEmpire(ctx);
  const field = fieldCount(ctx.view, current);
  const plan = planWar(ctx, field >= wantedField(ctx.view, true) * 0.8);
  // A declaration changes who the enemies are.
  if (current.players[player]!.atWarWith.length !== ctx.view.me.atWarWith.length) ctx.view = buildView(rules, current, player);
  runTrade(ctx);
  offerHumans(ctx);

  const view = ctx.view;
  const settlers = playerUnits(current, player).filter((u) => roleOf(rules.unit(u.type)) === 'settler').length;
  const garrisonNeeds = new Map<number, number>();
  for (const c of view.cities) garrisonNeeds.set(c.id, garrisonFor(view, c));
  // Broke: the treasury is empty, or unit upkeep eats more than a third of the taxes.
  const support = unitSupportCost(rules, current, player);
  const taxes = support > 0 ? view.cities.reduce((a, c) => a + cityReport(rules, current, c).tax.value, 0) : 0;
  const broke = support > 0 && (current.players[player]!.gold < 20 || support * 3 > taxes);
  const needs: BuildNeeds = {
    wantField: broke ? field : wantedField(view, plan.preparing !== null),
    haveField: field,
    settlersWanted: Math.max(0, Math.max(2, Math.ceil(view.cities.length / 2)) - settlers),
    garrison: garrisonNeeds,
  };
  const enemies = current.players[player]!.atWarWith.filter((e) => !current.players[e]!.barbarian);
  // Invasions across water from every land where field units stand with no enemy to reach on foot.
  const invadeOf = enemies.length > 0 ? enemies : plan.preparing !== null ? [plan.preparing] : [];
  const massCounts = new Map<number, number>();
  for (const u of playerUnits(current, player)) {
    const r = roleOf(rules.unit(u.type));
    if ((r === 'attacker' || r === 'siege') && u.carriedBy === null) massCounts.set(view.masses[u.tile]!, (massCounts.get(view.masses[u.tile]!) ?? 0) + 1);
  }
  const invasions = new Map<number, Invasion>();
  if (invadeOf.length > 0) {
    for (const [mass, count] of [...massCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
      if (count < 2 || chooseTarget(view, current, invadeOf, mass, view.capital?.tile ?? 0) !== null) continue;
      const inv = chooseInvasion(view, current, invadeOf, mass);
      if (inv) invasions.set(mass, inv);
    }
  }
  const firstInvasion = [...invasions.values()][0];
  if (firstInvasion && transportCount(view, current) < invasions.size) needs.transportAt = firstInvasion.staging.id;
  // A ship to explore: none yet, or only ones that cannot sail as far as a ship we could build now.
  const port = view.cities.find((c) => isCoastal(rules, current, c.tile));
  const best = port ? explorerShip(unitChoices(view, current, port)) : null;
  const farthest = Math.max(-1, ...playerUnits(current, player).filter((u) => roleOf(rules.unit(u.type)) === 'naval').map((u) => reach(rules.unit(u.type))));
  needs.seaExplorer = wantsSeaExplorer(view, current) && (farthest < 0 || (best !== null && reach(best) > farthest));
  // Colonies over the water once the home land is full.
  const optimal = rules.set.worldSizes.find((w) => w.id === current.settings.worldSize)?.optimalCities ?? 16;
  const homeFull = view.cities.length < optimal && isLandFull(view, current);
  const colony = homeFull && canSail(view, current) ? colonySite(view, current) : -1;
  if (colony >= 0) {
    const settlers = playerUnits(current, player).filter((u) => roleOf(rules.unit(u.type)) === 'settler').length;
    needs.colonize = settlers === 0;
    if (transportCount(view, current) === 0 && !needs.transportAt) {
      const port = view.cities.filter((c) => isCoastal(rules, current, c.tile)).sort((a, b) => distance(current.map, a.tile, colony) - distance(current.map, b.tile, colony) || a.id - b.id)[0];
      if (port) needs.transportAt = port.id;
    }
  }
  runCities(ctx, needs);
  runGovernors(ctx);
  runLeaders(ctx);
  const garrison = manageGarrisons(ctx, needs);
  counterAttack(ctx);
  let gatherAt = view.capital;
  if (plan.preparing !== null) {
    const enemyCities = playerCities(current, plan.preparing);
    let best = Infinity;
    for (const c of view.cities)
      for (const e of enemyCities) {
        const d = view.masses[c.tile] === view.masses[e.tile] ? distance(current.map, c.tile, e.tile) : Infinity;
        if (d < best) {
          best = d;
          gatherAt = c;
        }
      }
  }
  // The field army, force by force on each land mass.
  const forces = fieldUnits(ctx, garrison);
  strikeExposed(ctx, forces);
  const byMass = new Map<number, typeof forces>();
  for (const u of forces) {
    const live = current.units[u.id];
    if (!live) continue;
    const m = view.masses[live.tile]!;
    byMass.set(m, [...(byMass.get(m) ?? []), live]);
  }
  for (const [mass, force] of [...byMass.entries()].sort((a, b) => a[0] - b[0])) {
    const campaign = enemies.length > 0 ? chooseTarget(view, current, enemies, mass, force[0]!.tile) : null;
    const invasion = invasions.get(mass);
    if (campaign) runCampaign(ctx, force, campaign);
    else if (invasion) musterForInvasion(ctx, force, invasion);
    else gather(ctx, force, gatherAt);
  }
  runTransports(ctx, enemies.length > 0 ? [...invasions.values()] : []);
  runAir(ctx);
  runCivilians(ctx, garrison);
  runColonists(ctx, colony);
  runRoutines(ctx);
  runUpgrades(ctx);
  if (broke || current.players[player]!.atWarWith.filter((e) => !current.players[e]!.barbarian).length === 0) trimUnits(ctx, garrison);
}

/** The AI as a player controller (headless games, the browser host). */
export const ai = {
  id: 'ai',
  takeTurn,
  respond: (rules: Rules, state: GameState, player: number, proposal: Proposal) => respond(rules, state, player, proposal),
};
