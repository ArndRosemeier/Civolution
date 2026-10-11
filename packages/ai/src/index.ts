/**
 * @civolution/ai: the computer players (PLAN.md §9). A layered planner: grand strategy
 * (expand, build, prepare for war, fight) → operations (settling, the campaign against
 * one city, garrisons) → tactics (attack odds from the engine's own preview) → city
 * management through @civolution/automation with AI weights. Diplomacy reads the
 * engine's attitude model. The AI issues ordinary commands only and sees only what its
 * fog of war shows.
 */
import { planGovernment, planRates, planResearch, proposeRoutine } from '@civolution/automation';
import {
  buildBlocker,
  cityAt,
  cityReport,
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
import { aiBuild, fieldCount, garrisonFor, wantedField, defendersIn, type BuildNeeds } from './build.ts';
import { offerHumans, planWar, respond, runTrade } from './diplomacy.ts';
import { chooseTarget, counterAttack, manageGarrisons, runAir, runCampaign, runLeaders, runUpgrades, type Ctx } from './military.ts';
import { buildView, roleOf, type View } from './view.ts';

export { accepts, balance, dealGain, peaceValue } from './value.ts';
export { personality, roleOf, buildView, type Personality, type View } from './view.ts';
export { respond } from './diplomacy.ts';

const why = (text: string) => `AI: ${text}`;

/** Research, government and rates, with the civilization's favourite government first. */
function runEmpire(ctx: Ctx): void {
  const { view } = ctx;
  const rules = view.rules;
  const s = ctx.state();
  const p = s.players[view.player]!;
  if (p.research.tech === null) {
    const tech = planResearch(rules, s, view.player);
    if (tech) ctx.act({ type: 'setResearch', player: view.player, tech, reason: why('next advance') });
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
  const rates = fiscalRates(rules, ctx.state(), view.player);
  const now = ctx.state().players[view.player]!.rates;
  if (rates.tax !== now.tax || rates.science !== now.science || rates.luxury !== now.luxury) ctx.act({ type: 'setRates', player: view.player, rates, reason: why('balancing the treasury') });
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

/** The automation's rates, with science traded for taxes until the treasury stops shrinking. */
function fiscalRates(rules: Rules, state: GameState, player: number): Rates {
  const base = planRates(rules, state, player);
  const p = state.players[player]!;
  if (p.gold > 60 + playerCities(state, player).length * 10) return base;
  const cap = Math.floor(rules.government(p.government).rateCap / 10);
  for (let k = 0; k <= base.science; k++) {
    const tax = Math.min(cap, base.tax + k);
    const r = { tax, science: 10 - base.luxury - tax, luxury: base.luxury };
    if (r.science < 0) break;
    if (netIncome(rules, state, player, r) >= 0) return r;
  }
  const tax = Math.min(cap, 10 - base.luxury);
  return { tax, science: 10 - base.luxury - tax, luxury: base.luxury };
}

/** City builds, keeping improvements in progress unless the city is in danger. */
function runCities(ctx: Ctx, needs: BuildNeeds): void {
  const { view } = ctx;
  const rules = view.rules;
  for (const c0 of playerCities(ctx.state(), view.player)) {
    const s = ctx.state();
    const c = s.cities[c0.id]!;
    const danger = defendersIn(view, s, c) === 0 || (view.threat.get(c.id) ?? 0) > 0;
    const keeping = c.build?.kind === 'building' && c.build.id !== 'wealth' && buildBlocker(rules, s, c, c.build) === null && !danger;
    if (keeping) continue;
    const plan = aiBuild(view, s, c, needs);
    if (!c.build || c.build.kind !== plan.build.kind || c.build.id !== plan.build.id) ctx.act({ type: 'setBuild', player: view.player, city: c.id, build: plan.build, reason: plan.reason });
    // Buy a defender for a threatened city.
    const after = ctx.state().cities[c.id]!;
    if (danger && after.build?.kind === 'unit' && roleOf(rules.unit(after.build.id)) === 'defender') {
      const q = hurryQuote(rules, ctx.state(), after);
      if (q.kind === 'gold' && ctx.state().players[view.player]!.gold >= q.gold + 20) ctx.act({ type: 'hurry', player: view.player, city: c.id, reason: why('buying a defender for a threatened city') });
    }
  }
}

/** Settlers settle, workers work, scouts explore, ships wait in port. */
function runCivilians(ctx: Ctx, garrison: Set<number>): void {
  const { view } = ctx;
  const rules = view.rules;
  const s = ctx.state();
  let explorers = playerUnits(s, view.player).filter((u) => u.routine === 'explore').length;
  for (const u of playerUnits(s, view.player)) {
    if (u.carriedBy !== null || u.routine) continue;
    const r = rules.unit(u.type);
    const role = roleOf(r);
    if (role === 'settler') ctx.act({ type: 'setRoutine', player: view.player, unit: u.id, routine: 'autoSettle', reason: why('settling') });
    else if (role === 'worker') ctx.act({ type: 'setRoutine', player: view.player, unit: u.id, routine: 'autoWorker', reason: why('improving the land') });
    else if (role === 'explorer' && s.turn < 150) ctx.act({ type: 'setRoutine', player: view.player, unit: u.id, routine: 'explore', reason: why('exploring') });
    else if (explorers < 2 && s.turn < 80 && (role === 'defender' || role === 'attacker') && !garrison.has(u.id) && r.domain === 'land' && u.order?.type !== 'goto') {
      explorers++;
      ctx.act({ type: 'setRoutine', player: view.player, unit: u.id, routine: 'explore', reason: why('exploring') });
    } else if (role === 'defender' && u.order === null && u.movesLeft > 0 && cityAt(s, u.tile)?.owner === view.player)
      ctx.act({ type: 'fortify', player: view.player, unit: u.id, reason: why('reserve') });
    else if (role === 'naval' && u.movesLeft > 0 && u.order === null) ctx.act({ type: 'sentry', player: view.player, unit: u.id, reason: why('in port') });
    else if (role === 'explorer' && u.order === null && cityAt(s, u.tile)) ctx.act({ type: 'sentry', player: view.player, unit: u.id, reason: why('resting') });
  }
}

/** Runs every unit routine to completion for the turn, through the given command channel. */
function runRoutines(ctx: Ctx): void {
  const rules = ctx.view.rules;
  for (const unit of playerUnits(ctx.state(), ctx.view.player)) {
    if (!unit.routine) continue;
    for (let step = 0; step < 8; step++) {
      const u = ctx.state().units[unit.id];
      if (!u?.routine) break;
      const proposal = proposeRoutine(rules, ctx.state(), u);
      if (!proposal || !ctx.act(proposal.command)) break;
      if (proposal.finished || proposal.command.type === 'skip' || proposal.command.type === 'work') break;
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
  const broke = current.players[player]!.gold < 20 && unitSupportCost(rules, current, player) > 0;
  const needs: BuildNeeds = {
    wantField: broke ? field : wantedField(view, plan.preparing !== null),
    haveField: field,
    settlersWanted: Math.max(0, Math.max(1, Math.floor(view.cities.length / 3)) - settlers),
    garrison: garrisonNeeds,
  };
  runCities(ctx, needs);
  runLeaders(ctx);
  const garrison = manageGarrisons(ctx, needs);
  counterAttack(ctx);
  const campaign = chooseTarget(view, current, current.players[player]!.atWarWith.filter((e) => !current.players[e]!.barbarian));
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
  runCampaign(ctx, campaign, garrison, gatherAt);
  runAir(ctx);
  runCivilians(ctx, garrison);
  runRoutines(ctx);
  runUpgrades(ctx);
}

/** The AI as a player controller (headless games, the browser host). */
export const ai = {
  id: 'ai',
  takeTurn,
  respond: (rules: Rules, state: GameState, player: number, proposal: Proposal) => respond(rules, state, player, proposal),
};
