/**
 * The turn digest (PLAN.md §8.7): instead of a popup per event, the turn opens with a
 * short list, most urgent first: what automation already handled, and the few things
 * that need the player, each with its reason and a place to jump to.
 */
import {
  atWar,
  availableResources,
  cityReport,
  distance,
  playerCities,
  playerUnits,
  researchableTechs,
  visibleTiles,
  type Command,
  type GameEvent,
  type GameState,
  type Rules,
} from '@civolution/engine';
import { governorFor } from './assignments.ts';

export type DigestKind =
  | 'threat'
  | 'disorder'
  | 'offer'
  | 'research'
  | 'idleCity'
  | 'idleUnits'
  | 'starving'
  | 'resourceLost'
  | 'resourceGained'
  | 'notice'
  | 'handled'
  | 'workers';

export interface DigestItem {
  kind: DigestKind;
  /** 1 urgent, 2 worth a look, 3 for the record. */
  priority: 1 | 2 | 3;
  text: string;
  /** Why it happened or why automation could not deal with it. */
  why?: string;
  /** The player has to decide something. */
  needsInput: boolean;
  /** How many decisions it stands for (idle units, idle cities). */
  count?: number;
  city?: number;
  unit?: number;
  tile?: number;
}

export interface DigestInput {
  events: readonly GameEvent[];
  /** Commands automation issued this turn (with reasons). */
  commands: readonly Command[];
  /** The state at the start of the player's previous turn, for what changed since. */
  prev?: GameState;
  notices?: readonly { text: string; city: number }[];
  /** Workers of the pool with nothing to do. */
  idleWorkers?: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function turnDigest(rules: Rules, state: GameState, player: number, input: DigestInput): DigestItem[] {
  const items: DigestItem[] = [];
  const p = state.players[player]!;
  const cities = playerCities(state, player);
  // Enemies in sight near a city.
  const seen = visibleTiles(rules, state, player);
  for (const c of cities) {
    const near = Object.values(state.units).filter(
      (u) => u.owner !== player && seen[u.tile] && atWar(state, player, u.owner) && rules.unit(u.type).attack > 0 && distance(state.map, u.tile, c.tile) <= 3,
    );
    if (near.length > 0) items.push({ kind: 'threat', priority: 1, text: `${plural(near.length, 'enemy unit')} near ${c.name}`, needsInput: false, city: c.id, tile: near[0]!.tile });
  }
  // Cities: disorder, starvation, nothing to build.
  const idle: number[] = [];
  const starving: { city: number; governed: boolean }[] = [];
  for (const c of cities) {
    const r = cityReport(rules, state, c);
    const governed = governorFor(state, c) !== null;
    if (r.disorder)
      items.push({
        kind: 'disorder',
        priority: 1,
        text: `${c.name} will be in disorder`,
        why: governed ? `The governor ran out of options: ${r.unhappy} unhappy against ${r.happy} happy. Raise luxury, build a temple or station troops.` : `${r.unhappy} unhappy against ${r.happy} happy.`,
        needsInput: true,
        city: c.id,
      });
    else if (r.foodSurplus < 0 && c.food + r.foodSurplus < 0) starving.push({ city: c.id, governed });
    if (c.build === null) idle.push(c.id);
  }
  // Starving cities: governed ones only for the record (the governor found nothing better).
  const hungry = starving.filter((x) => !x.governed);
  if (hungry.length > 0)
    items.push({ kind: 'starving', priority: 2, text: hungry.length === 1 ? `${state.cities[hungry[0]!.city]!.name} will starve and shrink` : `${hungry.length} cities will starve and shrink`, why: 'Move citizens to food tiles or give the city a governor.', needsInput: true, count: hungry.length, city: hungry[0]!.city });
  const fed = starving.filter((x) => x.governed);
  if (fed.length > 0)
    items.push({ kind: 'starving', priority: 3, text: fed.length === 1 ? `${state.cities[fed[0]!.city]!.name} will shrink` : `${fed.length} governed cities will shrink`, why: 'Their land cannot feed them: the governors found no better tiles. Irrigation, harbours or fewer overlapping cities help.', needsInput: false, count: fed.length, city: fed[0]!.city });
  if (idle.length > 0)
    items.push({ kind: 'idleCity', priority: 2, text: `${plural(idle.length, 'city', 'cities')} with nothing to build`, needsInput: true, count: idle.length, city: idle[0]! });
  // Offers waiting for an answer.
  for (const pr of state.diplomacy.proposals)
    if (pr.to === player) items.push({ kind: 'offer', priority: 1, text: `${state.players[pr.from]!.name} makes an offer`, needsInput: true });
  if (p.research.tech === null && cities.length > 0 && researchableTechs(rules, p).length > 0)
    items.push({ kind: 'research', priority: 2, text: 'Choose what to research', needsInput: true });
  const units = playerUnits(state, player).filter((u) => u.movesLeft > 0 && u.order === null && u.routine === null && u.carriedBy === null);
  if (units.length > 0)
    items.push({ kind: 'idleUnits', priority: 2, text: `${plural(units.length, 'unit')} await orders`, needsInput: true, count: units.length, unit: units[0]!.id, tile: units[0]!.tile });
  // Trade-route keeper.
  if (input.prev && p.automation.policies.tradeKeeper && input.prev.players[player]) {
    const before = availableResources(rules, input.prev, player);
    const now = availableResources(rules, state, player);
    const name = (id: string) => rules.resources[rules.resourceIndex(id)]!.name;
    const lost = [...before].filter((r) => !now.has(r)).sort();
    const gained = [...now].filter((r) => !before.has(r)).sort();
    if (lost.length > 0)
      items.push({ kind: 'resourceLost', priority: 1, text: `Lost access to ${lost.map(name).join(', ')}`, why: 'A road was cut, a city lost, or a deal ended. Workers can reconnect it.', needsInput: false });
    if (gained.length > 0) items.push({ kind: 'resourceGained', priority: 3, text: `Now connected: ${gained.map(name).join(', ')}`, needsInput: false });
  }
  for (const n of input.notices ?? []) items.push({ kind: 'notice', priority: 2, text: n.text, needsInput: false, city: n.city });
  // What automation took care of.
  const built = input.events.filter((e) => e.type === 'cityBuilt' && e.player === player).length;
  const count = (pred: (c: Command) => boolean) => input.commands.filter(pred).length;
  const builds = count((c) => c.type === 'setBuild');
  const placed = count((c) => c.type === 'setCitizens');
  const jobs = count((c) => c.type === 'work');
  const moved = count((c) => c.type === 'goto' || c.type === 'fortify');
  const rates = input.commands.find((c) => c.type === 'setRates');
  const research = input.commands.find((c) => c.type === 'setResearch');
  const handled: string[] = [];
  if (built > 0) handled.push(`${plural(built, 'city', 'cities')} finished a build`);
  if (builds > 0) handled.push(`templates chose ${plural(builds, 'build')}`);
  if (placed > 0) handled.push(`governors re-placed citizens in ${plural(placed, 'city', 'cities')}`);
  if (jobs > 0) handled.push(`workers started ${plural(jobs, 'job')}`);
  if (moved > 0) handled.push(`${plural(moved, 'unit')} moved or took post`);
  if (handled.length > 0) items.push({ kind: 'handled', priority: 3, text: `Automation: ${handled.join(', ')}`, needsInput: false });
  if (rates?.reason) items.push({ kind: 'handled', priority: 3, text: rates.reason, needsInput: false });
  if (research?.type === 'setResearch') items.push({ kind: 'handled', priority: 3, text: `Researching ${rules.tech(research.tech).name}`, ...(research.reason ? { why: research.reason } : {}), needsInput: false });
  if ((input.idleWorkers ?? 0) > 0)
    items.push({ kind: 'workers', priority: 3, text: `${plural(input.idleWorkers!, 'automated worker')} found nothing worth doing nearby`, why: 'Consider joining them to a city or moving them to new land.', needsInput: false });
  return items.sort((a, b) => a.priority - b.priority || Number(b.needsInput) - Number(a.needsInput));
}

/** Seconds of player attention a digest asks for: about five per decision plus ending the turn. */
export function inputSeconds(items: readonly DigestItem[]): number {
  return 5 + items.filter((i) => i.needsInput).reduce((s, i) => s + 5 * (i.count ?? 1), 0);
}
