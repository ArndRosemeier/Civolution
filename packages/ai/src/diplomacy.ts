/**
 * The AI at the negotiating table (PLAN.md §9): when to go to war and with whom, when to
 * make peace, embassies, technology swaps, alliances against a common enemy, and how to
 * answer offers. Decisions read the attitude model, relative strength and the
 * civilization's temper.
 */
import {
  atWar,
  attitude,
  canReceiveTech,
  dealBlocker,
  demandBlocker,
  hash3,
  hasTreaty,
  makeRng,
  missionBlocker,
  militaryPower,
  peaceBinding,
  playerCities,
  techCost,
  trespassThreat,
  distance,
  isCoastal,
  type Deal,
  type DealItem,
  type Demand,
  type GameState,
  type Proposal,
  type Rules,
} from '@civolution/engine';
import { accepts, dealGain, peaceValue } from './value.ts';
import type { Ctx } from './military.ts';
import type { View } from './view.ts';
import { canSail } from './naval.ts';
import { personality } from './view.ts';

const why = (text: string) => `AI: ${text}`;

/** Whether AI player `player` accepts an offer made to it. */
export function respond(rules: Rules, state: GameState, player: number, proposal: Proposal): boolean {
  if (proposal.demand) return yieldsTo(rules, state, player, proposal);
  return accepts(rules, state, player, proposal);
}

/**
 * Whether AI player `player` gives in to a demand (docs/ai.md, owner's ruling
 * 2026-10-11): troops are withdrawn when it is weaker than the demander or not warlike
 * (aggression 0 or less); tribute is paid when it is clearly weaker (a warlike leader
 * pays only below 70 % of the demander's strength).
 */
export function yieldsTo(rules: Rules, state: GameState, player: number, proposal: Proposal): boolean {
  if (!proposal.demand || dealBlocker(rules, state, proposal) !== null) return false;
  const aggression = personality(rules, state, player).aggression;
  const mine = militaryPower(rules, state, player);
  const theirs = militaryPower(rules, state, proposal.from);
  if (proposal.demand.kind === 'withdraw') return mine < theirs || aggression <= 0;
  return mine < theirs * (aggression <= 0 ? 1 : 0.7);
}

/**
 * Percent chance a turn that an AI demands tribute of one rival, by aggression (−2 … +2):
 * never for peaceful leaders, 1 % for an even temper up to 3 % for the most warlike;
 * doubled against a rival at most 40 % as strong.
 */
export const TRIBUTE_CHANCE = (aggression: number): number => Math.max(0, 1 + aggression);

/**
 * Demands (docs/ai.md, owner's ruling 2026-10-11): foreign troops seriously threatening
 * one of our cities must withdraw or it means war; now and then tribute (an advance or
 * gold) from a weaker civilization we dislike, with war threatened by a warlike leader.
 * The engine keeps demands of a kind to one per pair every few turns (DEMAND_COOLDOWN).
 */
export function makeDemands(ctx: Ctx): void {
  const { view } = ctx;
  const rules = view.rules;
  const me = view.player;
  for (const o of view.me.contacts) {
    const s = ctx.state();
    const other = s.players[o];
    if (!other?.alive || other.barbarian || atWar(s, me, o)) continue;
    if (s.diplomacy.proposals.some((p) => p.from === me && p.to === o)) continue;
    if (trespassThreat(rules, s, me, o, view.visible) === null) continue;
    const demand: Demand = { kind: 'withdraw', war: true };
    const take: DealItem[] = [{ kind: 'withdraw' }];
    if (demandBlocker(rules, s, { from: me, to: o, give: [], take, demand }) !== null) continue;
    ctx.act({ type: 'proposeDeal', player: me, target: o, give: [], take, demand, reason: why('foreign troops threaten our city') });
  }
  demandTribute(ctx);
}

/** Rarely, tribute from a weaker rival the AI dislikes: at most one demand a turn. */
function demandTribute(ctx: Ctx): void {
  const { view } = ctx;
  const rules = view.rules;
  const me = view.player;
  const s = ctx.state();
  const aggression = view.traits.aggression;
  if (TRIBUTE_CHANCE(aggression) <= 0 || s.turn < 20) return;
  // The AI's own stream, so its whims never disturb the game's dice.
  const rng = makeRng(hash3(s.seed, s.turn, me + 0x7417));
  for (const o of view.me.contacts) {
    const other = s.players[o];
    if (!other?.alive || other.barbarian || atWar(s, me, o)) continue;
    if (hasTreaty(s, me, o, 'alliance') || hasTreaty(s, me, o, 'mutualProtection')) continue;
    if (s.diplomacy.proposals.some((p) => p.from === me && p.to === o)) continue;
    if (attitude(rules, s, me, o).value > -15) continue;
    const ratio = view.power / Math.max(1, militaryPower(rules, s, o));
    if (ratio < 1.5) continue;
    if (!rng.chance(TRIBUTE_CHANCE(aggression) * (ratio >= 2.5 ? 2 : 1))) continue;
    const mine = s.players[me]!;
    const tech = other.techs
      .filter((t) => canReceiveTech(rules, mine, t))
      .sort((a, b) => techCost(rules, s, b, me) - techCost(rules, s, a, me) || a.localeCompare(b))[0];
    const gold = Math.floor(other.gold / 20) * 10;
    let take: DealItem[] = [];
    if (tech && (gold < 50 || rng.chance(50))) take = [{ kind: 'tech', tech }];
    else if (gold >= 50) take = [{ kind: 'gold', amount: gold }];
    if (take.length === 0) continue;
    // Warlike leaders mean it; a binding peace treaty holds back all but the most warlike.
    const war = (aggression >= 1 || (aggression === 0 && rng.chance(50))) && (!peaceBinding(s, me, o) || aggression >= 2);
    const demand: Demand = { kind: 'tribute', war };
    if (demandBlocker(rules, s, { from: me, to: o, give: [], take, demand }) !== null) continue;
    ctx.act({ type: 'proposeDeal', player: me, target: o, give: [], take, demand, reason: why('tribute from a weak neighbour') });
    return;
  }
}

/**
 * Rivals worth fighting: met, alive, with cities on a land mass the AI holds, nearest
 * first; across the water too (counted farther) once the AI can build transports.
 */
function rivalsInReach(view: View, state: GameState): { id: number; distance: number }[] {
  const mine = playerCities(state, view.player);
  const sail = canSail(view, state);
  const coastal = mine.filter((c) => isCoastal(view.rules, state, c.tile));
  const out: { id: number; distance: number }[] = [];
  for (const o of view.me.contacts) {
    const q = state.players[o];
    if (!q?.alive || q.barbarian) continue;
    let best = Infinity;
    for (const c of playerCities(state, o)) {
      for (const m of mine) if (view.masses[m.tile] === view.masses[c.tile]) best = Math.min(best, distance(state.map, m.tile, c.tile));
      if (sail && isCoastal(view.rules, state, c.tile)) for (const m of coastal) best = Math.min(best, distance(state.map, m.tile, c.tile) + 6);
    }
    if (best < Infinity) out.push({ id: o, distance: best });
  }
  return out.sort((a, b) => a.distance - b.distance || a.id - b.id);
}

export interface WarPlan {
  /** A rival the AI is arming against (it declares once strong enough). */
  preparing: number | null;
}

/**
 * War and peace: declare on a weak, disliked neighbour when the army is ready; offer
 * peace when a war goes badly or drags on.
 */
export function planWar(ctx: Ctx, fieldReady: boolean): WarPlan {
  const { view } = ctx;
  const rules = view.rules;
  const s = ctx.state();
  const me = s.players[view.player]!;
  // Peace offers to enemies (humans get a proposal to answer).
  for (const e of view.enemies) {
    const since = me.warSince[e] ?? s.turn;
    if (s.turn - since < 8) continue;
    if (peaceValue(rules, s, view.player, e) <= 0) continue;
    const deal: Deal = { from: view.player, to: e, give: [{ kind: 'peace' }], take: [] };
    if (dealBlocker(rules, s, deal) !== null) continue;
    if (s.diplomacy.proposals.some((p) => p.from === view.player && p.to === e)) continue;
    // Do not pester a human every turn.
    if (s.players[e]!.human && (s.turn + view.player) % 6 !== 0) continue;
    ctx.act({ type: 'proposeDeal', player: view.player, target: e, give: deal.give, take: deal.take, reason: why('the war is not worth going on') });
  }
  if (view.enemies.length > 0) return { preparing: null };
  // Too early, or by nature peaceful: no new wars.
  if (s.turn < 40 - view.traits.aggression * 8) return { preparing: null };
  const candidates = rivalsInReach(view, s).filter((n) => n.distance <= 20);
  let best: { id: number; score: number } | null = null;
  for (const n of candidates) {
    if (peaceBinding(s, view.player, n.id) && view.traits.aggression < 2) continue;
    if (hasTreaty(s, view.player, n.id, 'alliance') || hasTreaty(s, view.player, n.id, 'mutualProtection')) continue;
    const theirs = Math.max(1, militaryPower(rules, s, n.id));
    const ratio = view.power / theirs;
    const feel = attitude(rules, s, view.player, n.id).value;
    // Room to grow matters: a crowded civilization looks at its neighbours.
    const crowded = playerCities(s, view.player).length >= 3 ? 10 : -20;
    const score = ratio * 40 - feel * 0.6 + view.traits.aggression * 12 + crowded - n.distance;
    if (score > 55 && (!best || score > best.score)) best = { id: n.id, score };
  }
  if (!best) return { preparing: null };
  const theirs = Math.max(1, militaryPower(rules, s, best.id));
  if (fieldReady && view.power >= theirs * (1.4 - view.traits.aggression * 0.1)) {
    ctx.act({ type: 'declareWar', player: view.player, target: best.id, reason: why('a weak and unloved neighbour') });
    return { preparing: null };
  }
  return { preparing: best.id };
}

/** Embassies, technology swaps and alliances, a few per turn. */
export function runTrade(ctx: Ctx): void {
  const { view } = ctx;
  const rules = view.rules;
  let s = ctx.state();
  const me = s.players[view.player]!;
  // One embassy per turn when the treasury is comfortable.
  for (const o of me.contacts) {
    if (missionBlocker(rules, s, view.player, o, 'embassy') !== null) continue;
    if (s.players[view.player]!.gold < 100) break;
    ctx.act({ type: 'espionage', player: view.player, target: o, mission: 'embassy', reason: why('opening an embassy') });
    break;
  }
  // Technology swaps every few turns, staggered between civilizations.
  if ((s.turn + view.player) % 4 !== 0) return;
  s = ctx.state();
  for (const o of me.contacts) {
    const other = s.players[o]!;
    if (!other.alive || other.human || s.players[view.player]!.atWarWith.includes(o)) continue;
    if (attitude(rules, s, view.player, o).value < -15) continue;
    const mine = s.players[view.player]!;
    const want = other.techs
      .filter((t) => !mine.techs.includes(t) && rules.tech(t).prerequisites.every((x) => mine.techs.includes(x)))
      .sort((a, b) => techCost(rules, s, b, view.player) - techCost(rules, s, a, view.player) || a.localeCompare(b))[0];
    if (!want) continue;
    const offer: Deal = { from: view.player, to: o, give: [], take: [{ kind: 'tech', tech: want }] };
    // Offer our own advances they lack until they would agree.
    const mineToGive = mine.techs
      .filter((t) => !other.techs.includes(t) && rules.tech(t).prerequisites.every((x) => other.techs.includes(x)))
      .sort((a, b) => techCost(rules, s, a, o) - techCost(rules, s, b, o) || a.localeCompare(b));
    let deal: Deal | null = null;
    for (const t of mineToGive) {
      offer.give = [...offer.give, { kind: 'tech', tech: t }];
      if (accepts(rules, s, o, offer)) {
        deal = offer;
        break;
      }
      if (offer.give.length >= 3) break;
    }
    if (!deal) continue;
    // Only if the swap is fair to us as well.
    if (!accepts(rules, s, view.player, { from: o, to: view.player, give: deal.take, take: deal.give })) continue;
    ctx.act({ type: 'proposeDeal', player: view.player, target: o, give: deal.give, take: deal.take, reason: why('trading advances') });
    break;
  }
  // An ally against the enemy: a friend who also dislikes it.
  s = ctx.state();
  for (const e of view.enemies) {
    for (const o of s.players[view.player]!.contacts) {
      const other = s.players[o]!;
      if (!other.alive || other.human || o === e || other.atWarWith.includes(e) || !other.contacts.includes(e)) continue;
      if (hasTreaty(s, view.player, o, 'alliance')) continue;
      const deal: Deal = { from: view.player, to: o, give: [{ kind: 'alliance', against: e }], take: [] };
      if (dealBlocker(rules, s, deal) !== null || !accepts(rules, s, o, deal)) continue;
      ctx.act({ type: 'proposeDeal', player: view.player, target: o, give: deal.give, take: deal.take, reason: why('an alliance against a common enemy') });
      return;
    }
  }
}

/** Occasional offers to a human neighbour the AI likes: an even swap of advances. */
export function offerHumans(ctx: Ctx): void {
  const { view } = ctx;
  const rules = view.rules;
  const s = ctx.state();
  if ((s.turn + view.player * 3) % 12 !== 0) return;
  for (const o of s.players[view.player]!.contacts) {
    const human = s.players[o]!;
    if (!human.human || !human.alive || s.players[view.player]!.atWarWith.includes(o)) continue;
    if (attitude(rules, s, view.player, o).value < 15) continue;
    const mine = s.players[view.player]!;
    const want = human.techs.find((t) => !mine.techs.includes(t) && rules.tech(t).prerequisites.every((x) => mine.techs.includes(x)));
    if (!want) continue;
    const give = mine.techs.filter((t) => !human.techs.includes(t) && rules.tech(t).prerequisites.every((x) => human.techs.includes(x))).slice(0, 1);
    const deal: Deal = { from: view.player, to: o, give: give.map((t) => ({ kind: 'tech', tech: t })), take: [{ kind: 'tech', tech: want }] };
    if (deal.give.length === 0 || dealBlocker(rules, s, deal) !== null) continue;
    // Only swaps the AI itself thinks fair.
    if (dealGain(rules, s, view.player, deal) < 0) continue;
    ctx.act({ type: 'proposeDeal', player: view.player, target: o, give: deal.give, take: deal.take, reason: why('a swap of advances') });
    return;
  }
}
