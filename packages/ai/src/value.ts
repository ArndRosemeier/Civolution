/**
 * What deal items are worth to an AI civilization, in gold (PLAN.md §9): the basis for
 * accepting, refusing and balancing offers. Trading between two AI players is cheaper by
 * the difficulty's AI-to-AI trade rate; trading with a human is priced with a margin that
 * grows with the difficulty, so the classic "sell a tech to everyone" loop does not pay.
 */
import {
  atWar,
  attitude,
  dealBlocker,
  DEAL_TURNS,
  militaryPower,
  playerCities,
  techCost,
  type Deal,
  type DealItem,
  type GameState,
  type Rules,
} from '@civolution/engine';
import { personality } from './view.ts';

const TREATY = new Set(['peace', 'ceasefire', 'rightOfPassage', 'mutualProtection', 'alliance', 'embargo']);

/** How much `player` wants peace with `other` now, in gold (negative: wants the war to go on). */
export function peaceValue(rules: Rules, state: GameState, player: number, other: number): number {
  const p = state.players[player]!;
  const mine = militaryPower(rules, state, player);
  const theirs = Math.max(1, militaryPower(rules, state, other));
  const since = p.warSince[other] ?? state.turn;
  const length = state.turn - since;
  const weariness = p.weariness[other] ?? 0;
  const ratio = mine / theirs;
  const traits = personality(rules, state, player);
  let v = 0;
  // Losing wars are ended, long ones tire, aggressive leaders hold on.
  v += ratio < 0.7 ? 150 : ratio < 1 ? 60 : ratio > 2 ? -150 : ratio > 1.4 ? -60 : 0;
  v += Math.min(120, length * 3) - 30;
  v += Math.min(100, weariness * 2);
  v -= traits.aggression * 25;
  // Cities lost to them make a ruler want them back first.
  return v;
}

function itemValue(rules: Rules, state: GameState, me: number, other: number, item: DealItem, receiving: boolean): number {
  switch (item.kind) {
    case 'gold':
      return item.amount;
    case 'goldPerTurn':
      // Promises are worth what the payer's word is worth.
      return receiving ? Math.floor(item.amount * DEAL_TURNS * 0.6 * (state.players[other]!.reputation / 100)) : item.amount * DEAL_TURNS;
    case 'tech': {
      const cost = techCost(rules, state, item.tech, receiving ? me : other);
      if (receiving) return cost;
      // Handing a rival an edge costs more than the beakers when relations are cool.
      const a = attitude(rules, state, me, other).value;
      return Math.floor(cost * (a >= 15 ? 1 : a >= -15 ? 1.3 : 2));
    }
    case 'worldMap':
      return receiving ? 30 : 15 + Math.floor(militaryPower(rules, state, other) > militaryPower(rules, state, me) ? 40 : 0);
    case 'contact':
      return receiving ? 60 : 20;
    case 'embassy':
      return receiving ? 30 : 10;
    case 'resource': {
      const r = rules.resources[rules.resourceIndex(item.resource)]!;
      return r.kind === 'strategic' ? (receiving ? 150 : 120) : receiving ? 90 : 40;
    }
    case 'city': {
      const c = state.cities[item.city];
      if (!c) return 0;
      const v = c.size * 60 + Object.keys(c.buildings).reduce((s, b) => s + Math.floor(rules.building(b).cost / 2), 0);
      return receiving ? v : v * 3 + (playerCities(state, me).length <= 3 ? 10_000 : 0);
    }
    case 'peace':
    case 'ceasefire': {
      const v = peaceValue(rules, state, me, other);
      return item.kind === 'ceasefire' ? Math.floor(v * 0.6) : v;
    }
    case 'rightOfPassage': {
      const a = attitude(rules, state, me, other).value;
      return a >= 15 ? 10 : a >= -15 ? -40 : -200;
    }
    case 'mutualProtection': {
      const a = attitude(rules, state, me, other).value;
      return a >= 50 ? 80 : a >= 25 ? 20 : -300;
    }
    case 'alliance': {
      const a = attitude(rules, state, me, other).value;
      const hate = attitude(rules, state, me, item.against).value;
      const already = atWar(state, me, item.against);
      if (a < 0) return -500;
      if (already) return 120;
      const mine = militaryPower(rules, state, me) + militaryPower(rules, state, other);
      const theirs = Math.max(1, militaryPower(rules, state, item.against));
      return hate <= -15 && mine > theirs * 1.3 ? 60 + personality(rules, state, me).aggression * 10 : -400;
    }
    case 'embargo': {
      const hate = attitude(rules, state, me, item.against).value;
      return hate <= -15 ? 30 : -100;
    }
  }
}

/** Net value of a deal to `me` (positive: gains more than it gives). */
export function dealGain(rules: Rules, state: GameState, me: number, deal: Deal): number {
  const other = deal.from === me ? deal.to : deal.from;
  const gets = deal.from === me ? deal.take : deal.give;
  const gives = deal.from === me ? deal.give : deal.take;
  const treaty = (i: DealItem) => TREATY.has(i.kind);
  let gain = 0;
  for (const i of gets) gain += itemValue(rules, state, me, other, i, true);
  for (const i of gives) gain += treaty(i) ? itemValue(rules, state, me, other, i, true) : -itemValue(rules, state, me, other, i, false);
  return gain;
}

/** The margin `me` asks of `other` beyond an even trade, as a fraction of what it gives. */
function margin(rules: Rules, state: GameState, me: number, other: number): number {
  const o = state.players[other]!;
  const a = attitude(rules, state, me, other).value;
  const diff = rules.difficulty(state.difficulty);
  // AI-to-AI deals are cheaper by the trade rate; humans pay more at higher levels.
  let m = o.human ? (rules.set.difficulties.indexOf(diff) - 2) * 0.05 : -(diff.aiTradeRate - 100) / 400;
  m += a >= 50 ? -0.1 : a >= 15 ? 0 : a >= -15 ? 0.1 : a >= -50 ? 0.3 : 1;
  return m;
}

/** How far short of acceptable `deal` is for AI player `me`, in gold (0 or less: acceptable). */
function shortfall(rules: Rules, state: GameState, me: number, deal: Deal): number {
  const other = deal.from === me ? deal.to : deal.from;
  const gives = deal.from === me ? deal.give : deal.take;
  const cost = gives.reduce((s, i) => s + (TREATY.has(i.kind) ? 0 : itemValue(rules, state, me, other, i, false)), 0);
  const gain = dealGain(rules, state, me, deal);
  return Math.max(0, Math.floor(cost * margin(rules, state, me, other))) - gain;
}

/** Whether AI player `me` accepts `deal` (as its recipient). */
export function accepts(rules: Rules, state: GameState, me: number, deal: Deal): boolean {
  if (dealBlocker(rules, state, deal) !== null) return false;
  return shortfall(rules, state, me, deal) <= 0;
}

/**
 * Makes `deal` acceptable to AI player `me` by asking for more from the other side
 * (gold first, then its techs); null when nothing the other side has would do.
 */
export function balance(rules: Rules, state: GameState, me: number, deal: Deal): Deal | null {
  if (accepts(rules, state, me, deal)) return deal;
  const other = deal.from === me ? deal.to : deal.from;
  const o = state.players[other]!;
  const p = state.players[me]!;
  const theirsKey: 'give' | 'take' = deal.from === me ? 'take' : 'give';
  let d: Deal = { ...deal, give: [...deal.give], take: [...deal.take] };
  const techs = o.techs
    .filter((t) => !p.techs.includes(t) && rules.tech(t).prerequisites.every((x) => p.techs.includes(x)) && !d[theirsKey].some((i) => i.kind === 'tech' && i.tech === t))
    .sort((a, b) => techCost(rules, state, a, me) - techCost(rules, state, b, me) || a.localeCompare(b));
  for (const t of techs) {
    if (accepts(rules, state, me, d)) return d;
    const next = { ...d, [theirsKey]: [...d[theirsKey], { kind: 'tech', tech: t } as DealItem] };
    if (dealBlocker(rules, state, next) === null) d = next;
  }
  if (accepts(rules, state, me, d)) return d;
  // Top up with gold: a gold piece is worth one to the receiver, so the shortfall is the price.
  const existing = d[theirsKey].find((i) => i.kind === 'gold');
  const have = existing?.kind === 'gold' ? existing.amount : 0;
  const missing = Math.ceil(shortfall(rules, state, me, d) / 10) * 10;
  if (missing <= 0 || have + missing > o.gold) return null;
  const next: Deal = { ...d, [theirsKey]: [...d[theirsKey].filter((i) => i.kind !== 'gold'), { kind: 'gold', amount: have + missing } as DealItem] };
  return accepts(rules, state, me, next) ? next : null;
}
