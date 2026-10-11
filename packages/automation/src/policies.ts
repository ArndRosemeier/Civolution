/**
 * Empire policies (PLAN.md §8.5): rates by target ("most science that keeps +X gold a
 * turn", "most gold", "celebrate"), research toward a goal, standing answers to trade
 * offers, rushing builds within a budget and upgrading units. Each proposes ordinary
 * commands with a reason.
 */
import {
  cityReport,
  hurryQuote,
  isTreatyItem,
  playerCities,
  playerUnits,
  researchBlocker,
  unitSupportCost,
  upgradeQuote,
  type Command,
  type DealItem,
  type GameState,
  type Player,
  type Proposal,
  type Rates,
  type Rules,
} from '@civolution/engine';
import { planResearch } from './empire.ts';

/** Gold per turn at the given rates: taxes less building upkeep and unit support. */
export function netIncome(rules: Rules, state: GameState, player: number, rates: Rates): number {
  const p = state.players[player]!;
  const s: GameState = { ...state, players: state.players.map((x) => (x.id === player ? { ...p, rates } : x)) };
  let net = -unitSupportCost(rules, s, player);
  for (const c of playerCities(s, player)) {
    const r = cityReport(rules, s, c);
    net += r.tax.value - r.upkeep.value;
  }
  return net;
}

function celebrating(rules: Rules, state: GameState, player: number, rates: Rates): number {
  const p = state.players[player]!;
  const s: GameState = { ...state, players: state.players.map((x) => (x.id === player ? { ...p, rates } : x)) };
  return playerCities(s, player).filter((c) => cityReport(rules, s, c).celebrating).length;
}

const same = (a: Rates, b: Rates) => a.tax === b.tax && a.science === b.science && a.luxury === b.luxury;

/** The rates the player's policy asks for, with the reason, or null for manual rates. */
export function policyRates(rules: Rules, state: GameState, player: number): { rates: Rates; reason: string } | null {
  const p = state.players[player]!;
  const policy = p.automation.policies;
  const gov = rules.government(p.government);
  if (policy.rates === 'manual' || gov.transitional) return null;
  const cap = Math.floor(gov.rateCap / 10);
  if (policy.rates === 'maxGold') {
    const tax = Math.min(cap, 10);
    const science = Math.min(cap, 10 - tax);
    return { rates: { tax, science, luxury: 10 - tax - science }, reason: 'Policy: most gold' };
  }
  if (policy.rates === 'celebrate') {
    // Luxury up a step at a time while it adds celebrating cities; the rest to science.
    let best: Rates = { tax: Math.min(cap, 10), science: 0, luxury: 0 };
    best = { ...best, science: 10 - best.tax };
    let bestCount = celebrating(rules, state, player, best);
    for (let lux = 1; lux <= cap; lux++) {
      const tax = Math.min(cap, 10 - lux);
      const r: Rates = { tax, science: 10 - lux - tax, luxury: lux };
      if (r.science > cap) continue;
      const n = celebrating(rules, state, player, r);
      if (n > bestCount && netIncome(rules, state, player, r) >= policy.minIncome) {
        best = r;
        bestCount = n;
      }
    }
    return { rates: best, reason: `Policy: celebrate (${bestCount} cities celebrating)` };
  }
  // Most science that keeps the income target: income is close to linear in the tax
  // share, so it is measured at the two ends and the share interpolated, then checked.
  const at = (tax: number): Rates => {
    const science = Math.min(cap, 10 - tax);
    return { tax, science, luxury: 10 - tax - science };
  };
  const lowTax = Math.max(0, 10 - cap);
  const low = netIncome(rules, state, player, at(lowTax));
  const target = policy.minIncome;
  if (low >= target) return { rates: at(lowTax), reason: `Policy: most science (${low >= 0 ? '+' : ''}${low} gold a turn)` };
  const highTax = cap;
  const high = netIncome(rules, state, player, at(highTax));
  if (high <= target) return { rates: at(highTax), reason: `Policy: taxes at the limit to cover costs (${high >= 0 ? '+' : ''}${high} gold a turn)` };
  let tax = Math.min(highTax, lowTax + Math.ceil(((target - low) * (highTax - lowTax)) / (high - low)));
  let income = netIncome(rules, state, player, at(tax));
  while (income < target && tax < highTax) income = netIncome(rules, state, player, at(++tax));
  return { rates: at(tax), reason: `Policy: most science that keeps ${target >= 0 ? '+' : ''}${target} gold a turn (${income >= 0 ? '+' : ''}${income})` };
}

/** The first advance on the way to `goal` that can be researched now, or null. */
export function stepToward(rules: Rules, p: Player, goal: string): string | null {
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

/** Research: toward the player's goal when one is set, else steady progress. */
export function policyResearch(rules: Rules, state: GameState, player: number): Command | null {
  const p = state.players[player]!;
  const goal = p.automation.researchGoal;
  const step = goal && rules.set.techs.some((t) => t.id === goal) && !p.techs.includes(goal) ? stepToward(rules, p, goal) : null;
  if (step) {
    if (p.research.tech === step || (p.research.tech !== null && stepOnPath(rules, p, goal!, p.research.tech))) return null;
    return { type: 'setResearch', player, tech: step, reason: `Research goal ${rules.tech(goal!).name}: ${rules.tech(step).name} is on the way` };
  }
  if (p.research.tech !== null) return null;
  const tech = planResearch(rules, state, player);
  return tech ? { type: 'setResearch', player, tech, reason: 'Research: the cheapest advance toward the next era' } : null;
}

function stepOnPath(rules: Rules, p: Player, goal: string, tech: string): boolean {
  const seen = new Set<string>();
  const queue = [goal];
  while (queue.length > 0) {
    const t = queue.shift()!;
    if (t === tech) return true;
    if (seen.has(t) || p.techs.includes(t)) continue;
    seen.add(t);
    queue.push(...rules.tech(t).prerequisites);
  }
  return false;
}

const onlyPeace = (items: DealItem[]) => items.every((i) => i.kind === 'peace' || i.kind === 'ceasefire');

/** The deal policy's answer to an offer, with the reason, or null to leave it to the player. */
export function dealAnswer(state: GameState, player: number, proposal: Proposal): { accept: boolean; reason: string } | null {
  const policy = state.players[player]!.automation.policies.deals;
  // A demand backed by a threat (refusing may mean war) is always left to the player.
  if (proposal.demand) return null;
  // `give` comes to us, `take` is what we would hand over.
  const gets = proposal.give;
  const pays = proposal.take;
  const binds = [...gets, ...pays].some(isTreatyItem);
  if (policy.acceptPeace && gets.length + pays.length > 0 && onlyPeace(gets) && onlyPeace(pays)) return { accept: true, reason: 'Deal policy: peace is always welcome' };
  if (policy.acceptGifts && pays.length === 0 && gets.length > 0 && !binds) return { accept: true, reason: 'Deal policy: accepting a gift' };
  if (policy.declineDemands && gets.length === 0 && pays.length > 0) return { accept: false, reason: 'Deal policy: declining a demand that offers nothing back' };
  return null;
}

/** Hurries within the empire's budget: cheapest first, never below the reserve. */
export function policyHurries(rules: Rules, state: GameState, player: number, cities: number[]): Command[] {
  const p = state.players[player]!;
  const { hurryBudget, reserve } = p.automation.policies;
  if (hurryBudget <= 0) return [];
  const quotes: { city: number; gold: number; name: string }[] = [];
  for (const id of cities) {
    const c = state.cities[id];
    if (!c || c.owner !== player) continue;
    const q = hurryQuote(rules, state, c);
    if (q.kind === 'gold') quotes.push({ city: id, gold: q.gold, name: c.name });
  }
  quotes.sort((a, b) => a.gold - b.gold || a.city - b.city);
  const out: Command[] = [];
  let left = Math.min(hurryBudget, p.gold - reserve);
  for (const q of quotes) {
    if (q.gold > left) break;
    left -= q.gold;
    out.push({ type: 'hurry', player, city: q.city, reason: `Governor: rushing ${q.name}'s build for ${q.gold} gold (budget ${hurryBudget} a turn)` });
  }
  return out;
}

/** Upgrades in cities, cheapest first, never below the reserve. */
export function policyUpgrades(rules: Rules, state: GameState, player: number): Command[] {
  const p = state.players[player]!;
  if (!p.automation.policies.autoUpgrade) return [];
  const quotes: { unit: number; gold: number; to: string }[] = [];
  for (const u of playerUnits(state, player)) {
    if (u.carriedBy !== null) continue;
    const q = upgradeQuote(rules, state, u);
    if ('to' in q) quotes.push({ unit: u.id, gold: q.gold, to: q.to });
  }
  quotes.sort((a, b) => a.gold - b.gold || a.unit - b.unit);
  const out: Command[] = [];
  let gold = p.gold;
  for (const q of quotes) {
    if (gold - q.gold < p.automation.policies.reserve) break;
    gold -= q.gold;
    out.push({ type: 'upgrade', player, unit: q.unit, reason: `Upgrade policy: to ${rules.unit(q.to).name} for ${q.gold} gold` });
  }
  return out;
}

export { same as sameRates };
