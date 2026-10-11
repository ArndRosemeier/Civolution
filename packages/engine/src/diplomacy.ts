/**
 * Diplomacy (docs/rules/diplomacy.md): contact, war and peace, treaties, deals and the
 * obligations they leave running, reputation, and what each civilization remembers
 * about the others. Everything here changes state only through commands
 * (`declareWar`, `proposeDeal`, `answerDeal`) and the end of the turn.
 */
import { registerCache } from './caches.ts';
import { learn, replaceCitizens, updateTerritory } from './cities.ts';
import type { CommandError } from './commands.ts';
import { empireInfo, resourceCopies, resourcesExported, tradeRoute } from './empire.ts';
import { distance } from './grid.ts';
import { atWar, hasTechFlag, tileOwners } from './queries.ts';
import type { Rules } from './rules.ts';
import type { Deal, DealItem, Demand, GameState, Player, Treaty, TreatyKind, Unit } from './state.ts';
import { playerCities } from './territory.ts';
import type { Tx } from './tx.ts';
import { carryAlong, isArmy } from './units.ts';
import { visibleTiles } from './vision.ts';

/** Turns a ceasefire lasts before the war resumes. */
export const CEASEFIRE_TURNS = 16;
/** Turns a signed peace treaty binds: declaring war before then breaks it. */
export const PEACE_TURNS = 20;
/** Turns per-turn payments and resource deliveries run. */
export const DEAL_TURNS = 20;
/** Reputation lost for breaking each kind of treaty by declaring war. */
export const BREACH_PENALTY: Record<TreatyKind, number> = {
  peace: 40,
  ceasefire: 25,
  rightOfPassage: 20,
  mutualProtection: 30,
  alliance: 40,
  embargo: 0,
};
/** Reputation lost for breaking running trade deals: cancelling them by war, or defaulting on a payment. */
export const TRADE_BREACH_PENALTY = 20;
/** Reputation lost when a per-turn payment cannot be made (a broken trade deal). */
export const DEFAULT_PENALTY = TRADE_BREACH_PENALTY;
/** Turns before a civilization may make the same kind of demand of the same rival again. */
export const DEMAND_COOLDOWN: Record<Demand['kind'], number> = { withdraw: 8, tribute: 20 };
/** Trespassing armed units within THREAT_RANGE tiles of a city that make a serious threat. */
export const THREAT_UNITS = 3;
export const THREAT_RANGE = 3;
/** Trespassers' attack within two tiles of a city above this multiple of its defence is a serious threat. */
export const THREAT_ODDS = 1.5;
/** How much a civilization holds a declaration of war against it. */
export const WAR_GRUDGE = 50;

const err = (code: CommandError['code'], message: string): CommandError => ({ code, message });

function nameOf(state: GameState, p: number): string {
  return state.players[p]?.name ?? `player ${p}`;
}

const pair = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Whether `a` has met `b`. */
export function hasContact(state: GameState, a: number, b: number): boolean {
  return a !== b && (state.players[a]?.contacts.includes(b) ?? false);
}

export function treatiesBetween(state: GameState, a: number, b: number): Treaty[] {
  const [x, y] = pair(a, b);
  return state.diplomacy.treaties.filter((t) => t.parties[0] === x && t.parties[1] === y);
}

export function hasTreaty(state: GameState, a: number, b: number, kind: TreatyKind): boolean {
  return treatiesBetween(state, a, b).some((t) => t.kind === kind);
}

export type Relation = 'unknown' | 'war' | 'ceasefire' | 'peace';

/** The standing between two civilizations: not met, at war, in a ceasefire, or at peace. */
export function relation(state: GameState, a: number, b: number): Relation {
  if (atWar(state, a, b)) return 'war';
  if (!hasContact(state, a, b)) return 'unknown';
  return hasTreaty(state, a, b, 'ceasefire') ? 'ceasefire' : 'peace';
}

/** Whether `a` is still bound by a peace treaty signed with `b` (declaring war would break it). */
export function peaceBinding(state: GameState, a: number, b: number): boolean {
  return treatiesBetween(state, a, b).some((t) => t.kind === 'peace' && t.until !== null && t.until > state.turn);
}

/** Civilizations whose embargo forbids trade between `a` and `b`. */
export function embargoed(state: GameState, a: number, b: number): boolean {
  return state.diplomacy.treaties.some(
    (t) => t.kind === 'embargo' && ((t.against === a && t.parties.includes(b)) || (t.against === b && t.parties.includes(a))),
  );
}

/** Living civilizations other than the barbarians. */
export function civilizations(state: GameState): Player[] {
  return state.players.filter((p) => p.alive && !p.barbarian);
}

/** Military strength: attack plus defence of every fighting unit, weighted by health. */
export function militaryPower(rules: Rules, state: GameState, player: number): number {
  let power = 0;
  for (const u of Object.values(state.units)) {
    if (u.owner !== player || isArmy(rules, u)) continue;
    const r = rules.unit(u.type);
    if (r.attack + r.defence === 0) continue;
    power += (r.attack + r.defence) * Math.max(1, r.hitPointBonus + 3);
  }
  return power;
}

/** Whether `u` is an armed unit standing in `owner`'s territory without leave (right of passage or alliance). */
function trespassing(rules: Rules, state: GameState, u: Unit, owner: number): boolean {
  if (u.carriedBy !== null || u.owner === owner || state.map.territory[u.tile] !== owner) return false;
  if (state.players[u.owner]!.barbarian || atWar(state, u.owner, owner)) return false;
  const r = rules.unit(u.type);
  if (r.attack === 0 || r.domain === 'air') return false;
  return !hasTreaty(state, u.owner, owner, 'rightOfPassage') && !hasTreaty(state, u.owner, owner, 'alliance');
}

/** `intruder`'s armed units inside `owner`'s territory without leave, by id. */
export function trespassers(rules: Rules, state: GameState, owner: number, intruder: number): Unit[] {
  return Object.values(state.units)
    .filter((u) => u.owner === intruder && trespassing(rules, state, u, owner))
    .sort((a, b) => a.id - b.id);
}

/**
 * The city of `owner` that `intruder`'s trespassers seriously threaten, or null
 * (docs/rules/diplomacy.md): at least THREAT_UNITS of them within THREAT_RANGE tiles of
 * it, or their attack within two tiles more than THREAT_ODDS times the defence inside.
 * `visible` limits the count to what `owner` can see.
 */
export function trespassThreat(rules: Rules, state: GameState, owner: number, intruder: number, visible?: Uint8Array): number | null {
  const units = trespassers(rules, state, owner, intruder).filter((u) => !visible || visible[u.tile]);
  if (units.length === 0) return null;
  for (const c of playerCities(state, owner).sort((a, b) => a.id - b.id)) {
    let near = 0;
    let attack = 0;
    for (const u of units) {
      const d = distance(state.map, u.tile, c.tile);
      if (d <= THREAT_RANGE) near++;
      if (d <= 2) attack += rules.unit(u.type).attack;
    }
    let defence = 0;
    for (const u of Object.values(state.units)) if (u.owner === owner && u.tile === c.tile && u.carriedBy === null) defence += rules.unit(u.type).defence;
    if (near >= THREAT_UNITS || attack > Math.max(1, defence) * THREAT_ODDS) return c.id;
  }
  return null;
}

const landCache = new WeakMap<number[], number[]>();
registerCache((s) => landCache.delete(s.map.territory));

/** Tiles inside each player's borders. */
function landCounts(state: GameState): number[] {
  let counts = landCache.get(state.map.territory);
  if (!counts) {
    counts = new Array<number>(state.players.length).fill(0);
    for (const t of state.map.territory) if (t >= 0) counts[t] = (counts[t] ?? 0) + 1;
    landCache.set(state.map.territory, counts);
  }
  return counts;
}

/**
 * Score (our model until the histograph of Phase 6): citizens, advances, wonders, land
 * and culture.
 */
export function score(rules: Rules, state: GameState, player: number): number {
  const p = state.players[player]!;
  if (!p.alive || p.barbarian) return 0;
  let citizens = 0;
  let wonders = 0;
  for (const c of playerCities(state, player)) {
    citizens += c.size;
    for (const b of Object.keys(c.buildings)) if (rules.building(b).kind === 'wonder') wonders++;
  }
  const land = landCounts(state)[player] ?? 0;
  return citizens * 2 + p.techs.length * 2 + wonders * 5 + Math.floor(land / 10) + Math.floor(p.culture / 100);
}

export type AttitudeLevel = 'furious' | 'annoyed' | 'cautious' | 'polite' | 'gracious';

export interface Attitude {
  value: number;
  level: AttitudeLevel;
  reasons: { label: string; amount: number }[];
}

export function attitudeLevel(value: number): AttitudeLevel {
  if (value <= -50) return 'furious';
  if (value <= -15) return 'annoyed';
  if (value < 15) return 'cautious';
  if (value < 50) return 'polite';
  return 'gracious';
}

/**
 * How `of` feels about `toward` (Civ3's furious–gracious scale), with the reasons: what
 * it remembers, the other's reputation, war and common enemies, treaties, trade,
 * crowded borders, the leader's temper and fear of a runaway leader.
 */
export function attitude(rules: Rules, state: GameState, of: number, toward: number): Attitude {
  const a = state.players[of]!;
  const b = state.players[toward]!;
  const reasons: { label: string; amount: number }[] = [];
  const add = (label: string, amount: number) => {
    if (amount !== 0) reasons.push({ label, amount: Math.round(amount) });
  };
  add('Remembers past dealings', a.memory[toward] ?? 0);
  add('Reputation for keeping treaties', (b.reputation - 100) / 2);
  if (atWar(state, of, toward)) add('At war', -30);
  const enemiesA = a.atWarWith.filter((x) => !state.players[x]?.barbarian);
  const common = enemiesA.filter((x) => b.atWarWith.includes(x)).length;
  add('Common enemies', common * 15);
  for (const t of treatiesBetween(state, of, toward)) {
    if (t.kind === 'rightOfPassage') add('Right of passage', 5);
    if (t.kind === 'mutualProtection') add('Mutual protection pact', 15);
    if (t.kind === 'alliance') add('Allies in war', 20);
  }
  const deals = state.diplomacy.ongoing.filter((d) => (d.from === of && d.to === toward) || (d.from === toward && d.to === of)).length;
  add('Trade between us', Math.min(15, deals * 5));
  const civ = a.civ ? rules.civ(a.civ) : null;
  if (civ) add(`${civ.leader}'s temper`, -civ.aggression * 4);
  // Close neighbours rub against each other.
  const mine = playerCities(state, of);
  const theirs = playerCities(state, toward);
  let close = 0;
  for (const c of mine) for (const d of theirs) if (distance(state.map, c.tile, d.tile) <= 7) close++;
  add('Crowded borders', -Math.min(15, close * 3));
  if (!a.human && b.human) {
    const diff = rules.set.difficulties.findIndex((d) => d.id === state.difficulty);
    const regent = rules.set.difficulties.findIndex((d) => d.id === 'regent');
    if (diff > regent) add('Wary of human ambition', -(diff - regent) * 3);
  }
  const lead = score(rules, state, toward);
  const own = score(rules, state, of);
  if (own > 0 && lead > own * 1.5 && lead > 40) add('Fears your growing lead', -10);
  const value = Math.max(-100, Math.min(100, reasons.reduce((s, r) => s + r.amount, 0)));
  return { value, level: attitudeLevel(value), reasons };
}

// ---------------------------------------------------------------------------
// Memory and reputation
// ---------------------------------------------------------------------------

/** Changes what `of` remembers about `toward` (clamped to −100 … 100). */
export function remember(tx: Tx, of: number, toward: number, amount: number): void {
  const p = tx.state.players[of];
  if (!p || p.barbarian || of === toward || amount === 0) return;
  const now = p.memory[toward] ?? 0;
  const next = Math.max(-100, Math.min(100, now + amount));
  if (next !== now) tx.player(of).memory[toward] = next;
}

function loseReputation(tx: Tx, player: number, amount: number): void {
  const p = tx.state.players[player]!;
  const next = Math.max(0, p.reputation - amount);
  if (next !== p.reputation) tx.player(player).reputation = next;
}

/**
 * `breaker` broke a treaty or a trade deal: it loses `penalty` reputation, and every
 * civilization that knows it, the victim included, remembers the full penalty
 * (owner's ruling 2026-10-11).
 */
function breakFaith(tx: Tx, breaker: number, penalty: number): void {
  loseReputation(tx, breaker, penalty);
  for (const o of civilizations(tx.state)) if (o.id !== breaker && o.contacts.includes(breaker)) remember(tx, o.id, breaker, -penalty);
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

/** Two civilizations meet: both learn of each other and are at peace (docs/rules/diplomacy.md). */
export function meet(tx: Tx, a: number, b: number): void {
  const pa = tx.state.players[a];
  const pb = tx.state.players[b];
  if (!pa || !pb || a === b || pa.barbarian || pb.barbarian || !pa.alive || !pb.alive) return;
  if (pa.contacts.includes(b)) return;
  tx.player(a).contacts = [...pa.contacts, b].sort((x, y) => x - y);
  tx.player(b).contacts = [...pb.contacts, a].sort((x, y) => x - y);
  tx.emit({ type: 'contactMade', player: a, other: b });
}

/** Contact through sight: any of `player`'s units or cities sees a foreign unit, city or border. */
export function meetAround(tx: Tx, player: number, tiles: readonly number[]): void {
  const p = tx.state.players[player];
  if (!p || p.barbarian) return;
  const owners = tileOwners(tx.state);
  const terr = tx.state.map.territory;
  for (const t of tiles) {
    for (const o of owners.get(t) ?? []) if (o !== player && !p.contacts.includes(o)) meet(tx, player, o);
    const o = terr[t]!;
    if (o >= 0 && o !== player && !tx.state.players[player]!.contacts.includes(o)) meet(tx, player, o);
  }
}

/** End-of-turn sweep: everything each civilization sees. */
function sweepContacts(rules: Rules, tx: Tx): void {
  for (const p of civilizations(tx.state)) {
    const seen = visibleTiles(rules, tx.state, p.id);
    const tiles: number[] = [];
    for (let t = 0; t < seen.length; t++) if (seen[t]) tiles.push(t);
    meetAround(tx, p.id, tiles);
  }
}

// ---------------------------------------------------------------------------
// War
// ---------------------------------------------------------------------------

/** Why a war is declared, when it is not simply the declarer's choice. */
export interface WarCause {
  /** Honouring a mutual protection pact: breaks nothing. */
  honouring?: boolean;
  /** `b` refused a demand: to withdraw its troops (breaks nothing: the intruder provoked it) or to pay tribute. */
  refused?: Demand['kind'];
}

/**
 * `a` declares war on `b`. Treaties and running deals between them end; breaking a
 * binding treaty or a trade deal costs reputation with everyone. Partners of `b` in a
 * mutual protection pact answer by declaring war on `a`.
 */
export function declareWar(tx: Tx, a: number, b: number, cause: WarCause = {}, seen = new Set<number>()): CommandError | null {
  const state = tx.state;
  const pb = state.players[b];
  if (!pb?.alive || a === b) return err('invalid', 'Pick another living civilization.');
  if (pb.barbarian) return err('invalid', 'There is no treaty with the barbarians; you are always at war with them.');
  if (!hasContact(state, a, b)) return err('invalid', `You have not met ${pb.name} yet.`);
  if (atWar(state, a, b)) return err('invalid', `Already at war with ${pb.name}.`);
  seen.add(a);
  const broken = treatiesBetween(state, a, b);
  let penalty = 0;
  let worst: TreatyKind | 'trade' | null = null;
  for (const t of broken) {
    const p = t.kind === 'peace' && !(t.until !== null && t.until > state.turn) ? 0 : BREACH_PENALTY[t.kind];
    if (p > penalty) {
      penalty = p;
      worst = t.kind;
    }
  }
  // Running payments and deliveries are trade deals: cancelling them by war breaks them.
  if (TRADE_BREACH_PENALTY > penalty && state.diplomacy.ongoing.some((o) => (o.from === a && o.to === b) || (o.from === b && o.to === a))) {
    penalty = TRADE_BREACH_PENALTY;
    worst = 'trade';
  }
  const honouring = cause.honouring === true;
  if (honouring || cause.refused === 'withdraw') penalty = 0;
  const d = tx.diplomacy();
  const [x, y] = pair(a, b);
  d.treaties = d.treaties.filter((t) => !(t.parties[0] === x && t.parties[1] === y));
  d.ongoing = d.ongoing.filter((o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
  d.proposals = d.proposals.filter((o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
  setWar(tx, a, b, true);
  remember(tx, b, a, -WAR_GRUDGE);
  if (penalty > 0 && worst) {
    breakFaith(tx, a, penalty);
    tx.emit({ type: 'treatyBroken', player: a, target: b, treaty: worst });
  }
  const refused = cause.refused === 'withdraw' ? 'withdrawRefused' : cause.refused === 'tribute' ? 'tributeRefused' : null;
  tx.emit({
    type: 'warDeclared',
    player: a,
    target: b,
    ...(honouring ? { reason: 'Honouring a mutual protection pact' } : {}),
    ...(refused ? { cause: refused } : {}),
  });
  // Mutual protection: everyone with a pact with b joins against a.
  for (const t of tx.state.diplomacy.treaties) {
    if (t.kind !== 'mutualProtection' || !t.parties.includes(b)) continue;
    const ally = t.parties[0] === b ? t.parties[1] : t.parties[0];
    if (ally === a || seen.has(ally) || !tx.state.players[ally]?.alive || atWar(tx.state, ally, a)) continue;
    if (!hasContact(tx.state, ally, a)) meet(tx, ally, a);
    declareWar(tx, ally, a, { honouring: true }, seen);
  }
  return null;
}

/** Records `a` and `b` entering (or leaving) a war in both players' war lists. */
function setWar(tx: Tx, a: number, b: number, war: boolean): void {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const p = tx.state.players[x]!;
    const has = p.atWarWith.includes(y);
    if (has === war) continue;
    const w = tx.player(x);
    w.atWarWith = war ? [...p.atWarWith, y].sort((m, n) => m - n) : p.atWarWith.filter((z) => z !== y);
    const since = { ...p.warSince };
    if (war) since[y] = tx.state.turn;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by player id
    else delete since[y];
    w.warSince = since;
  }
}

/** Moves `mover`'s units out of `owner`'s territory to their own nearest city (Civ3 does this on peace). */
function expel(_rules: Rules, tx: Tx, mover: number, owner: number): void {
  const cities = playerCities(tx.state, mover);
  if (cities.length === 0) return;
  const terr = tx.state.map.territory;
  let moved = 0;
  for (const u of Object.values(tx.state.units).sort((p, q) => p.id - q.id)) {
    if (u.owner !== mover || u.carriedBy !== null || terr[u.tile] !== owner) continue;
    // Ships sail home to port like everyone else.
    const home = [...cities]
      .sort((p, q) => distance(tx.state.map, p.tile, u.tile) - distance(tx.state.map, q.tile, u.tile) || p.id - q.id)[0]!;
    const w = tx.unit(u.id);
    w.tile = home.tile;
    w.order = null;
    w.fortified = false;
    carryAlong(tx, u.id, home.tile);
    moved++;
  }
  if (moved > 0) tx.emit({ type: 'unitsExpelled', player: mover, from: owner, units: moved });
}

/** Ends a war (or ceasefire) between a and b with a peace treaty. */
function signPeace(rules: Rules, tx: Tx, a: number, b: number): void {
  setWar(tx, a, b, false);
  const wa = tx.state.players[a]!.weariness;
  if (b in wa) tx.player(a).weariness = Object.fromEntries(Object.entries(wa).filter(([k]) => Number(k) !== b));
  const wb = tx.state.players[b]!.weariness;
  if (a in wb) tx.player(b).weariness = Object.fromEntries(Object.entries(wb).filter(([k]) => Number(k) !== a));
  removeTreaty(tx, a, b, 'ceasefire');
  removeTreaty(tx, a, b, 'peace');
  addTreaty(tx, a, b, 'peace', tx.state.turn + PEACE_TURNS);
  // Allies of either side against the other are released; the separate peace annoys them.
  const d = tx.diplomacy();
  for (const t of [...d.treaties]) {
    if (t.kind !== 'alliance') continue;
    const breaker = t.against === b && t.parties.includes(a) ? a : t.against === a && t.parties.includes(b) ? b : -1;
    if (breaker < 0) continue;
    const ally = t.parties[0] === breaker ? t.parties[1] : t.parties[0];
    d.treaties = d.treaties.filter((x) => x.id !== t.id);
    remember(tx, ally, breaker, -20);
  }
  remember(tx, a, b, 10);
  remember(tx, b, a, 10);
  expel(rules, tx, a, b);
  expel(rules, tx, b, a);
  tx.emit({ type: 'peaceMade', player: a, target: b });
}

function addTreaty(tx: Tx, a: number, b: number, kind: TreatyKind, until: number | null, against?: number): void {
  const d = tx.diplomacy();
  const id = d.nextId;
  d.nextId = id + 1;
  d.treaties.push({ id, kind, parties: pair(a, b), since: tx.state.turn, until, ...(against === undefined ? {} : { against }) });
}

function removeTreaty(tx: Tx, a: number, b: number, kind: TreatyKind): void {
  if (!hasTreaty(tx.state, a, b, kind)) return;
  const [x, y] = pair(a, b);
  const d = tx.diplomacy();
  d.treaties = d.treaties.filter((t) => !(t.kind === kind && t.parties[0] === x && t.parties[1] === y));
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

const TREATY_ITEMS = new Set(['peace', 'ceasefire', 'rightOfPassage', 'mutualProtection', 'alliance', 'embargo']);

export function isTreatyItem(item: DealItem): boolean {
  return TREATY_ITEMS.has(item.kind);
}

/**
 * Copies of a resource the player can still promise in a deal: every copy inside its
 * borders not promised already, its own last one included, while its trade network has
 * the resource (owner's ruling 2026-10-11: giving the last copy away loses it at home).
 */
export function resourceTradable(rules: Rules, state: GameState, player: number, resource: string): number {
  const info = empireInfo(rules, state, player);
  const home = info.capital ?? info.cities[0];
  if (!home) return 0;
  if (!info.resources.get(info.component.get(home.id) ?? -1)?.has(resource)) return 0;
  return Math.max(0, resourceCopies(rules, state, player, resource) - (resourcesExported(state, player).get(resource) ?? 0));
}

/** Copies of a resource the player has beyond the one it uses: trading more than these away costs it the resource. */
export function resourceSurplus(rules: Rules, state: GameState, player: number, resource: string): number {
  return Math.max(0, resourceTradable(rules, state, player, resource) - 1);
}

/** Resources flowing in to `player` from deals. */
export function incomingResources(state: GameState, player: number): string[] {
  const out: string[] = [];
  for (const o of state.diplomacy.ongoing) if (o.to === player && o.item.kind === 'resource') out.push(o.item.resource);
  return out;
}

function itemLabel(rules: Rules, state: GameState, item: DealItem): string {
  switch (item.kind) {
    case 'gold':
      return `${item.amount} gold`;
    case 'goldPerTurn':
      return `${item.amount} gold per turn`;
    case 'tech':
      return rules.tech(item.tech).name;
    case 'worldMap':
      return 'world map';
    case 'contact':
      return `contact with ${nameOf(state, item.player)}`;
    case 'embassy':
      return 'an embassy';
    case 'resource':
      return rules.resources[rules.resourceIndex(item.resource)]!.name;
    case 'city':
      return state.cities[item.city]?.name ?? 'a city';
    case 'peace':
      return 'peace treaty';
    case 'ceasefire':
      return 'ceasefire';
    case 'rightOfPassage':
      return 'right of passage';
    case 'mutualProtection':
      return 'mutual protection pact';
    case 'alliance':
      return `alliance against ${nameOf(state, item.against)}`;
    case 'embargo':
      return `embargo against ${nameOf(state, item.against)}`;
    case 'withdraw':
      return 'withdrawal of troops';
  }
}

export { itemLabel as dealItemLabel };

/** Why one side cannot hand over `item` to the other, or null. */
function itemBlocker(rules: Rules, state: GameState, giver: number, receiver: number, item: DealItem, war: boolean): string | null {
  const g = state.players[giver]!;
  const r = state.players[receiver]!;
  const bothKnow = (flag: string, what: string) =>
    hasTechFlag(rules, g, flag) && hasTechFlag(rules, r, flag) ? null : `Both sides need the advance that allows ${what}.`;
  switch (item.kind) {
    case 'gold':
      if (!Number.isInteger(item.amount) || item.amount <= 0) return 'Name an amount of gold.';
      return item.amount > g.gold ? `${g.name} has only ${g.gold} gold.` : null;
    case 'goldPerTurn':
      if (!Number.isInteger(item.amount) || item.amount <= 0 || item.amount > 1000) return 'Name a payment per turn.';
      return null;
    case 'tech': {
      if (!g.techs.includes(item.tech)) return `${g.name} does not know ${rules.tech(item.tech).name}.`;
      if (r.techs.includes(item.tech)) return `${r.name} already knows ${rules.tech(item.tech).name}.`;
      const missing = rules.tech(item.tech).prerequisites.filter((x) => !r.techs.includes(x));
      return missing.length > 0 ? `${r.name} lacks the groundwork for ${rules.tech(item.tech).name}.` : null;
    }
    case 'worldMap':
      return hasTechFlag(rules, g, 'enablesMapTrading') ? null : `${g.name} needs the advance that allows map trading.`;
    case 'contact': {
      const third = state.players[item.player];
      if (!third?.alive || third.barbarian || item.player === receiver || item.player === giver) return 'Pick a civilization to introduce.';
      if (!g.contacts.includes(item.player)) return `${g.name} has not met ${third.name}.`;
      if (r.contacts.includes(item.player)) return `${r.name} already knows ${third.name}.`;
      return hasTechFlag(rules, g, 'enablesCommunicationTrading') ? null : `${g.name} needs the advance that allows trading contacts.`;
    }
    case 'embassy':
      return r.embassies.includes(giver) ? `${r.name} already has an embassy there.` : null;
    case 'resource': {
      if (!rules.resources.some((x) => x.id === item.resource)) return 'Unknown resource.';
      if (resourceTradable(rules, state, giver, item.resource) <= 0) return `${g.name} has no ${rules.resources[rules.resourceIndex(item.resource)]!.name} left to trade.`;
      if (!tradeRoute(rules, state, giver, receiver)) return `No trade route joins the two capitals (roads, rivers or harbours).`;
      return null;
    }
    case 'city': {
      const c = state.cities[item.city];
      if (!c || c.owner !== giver) return `${g.name} does not hold that city.`;
      if ('palace' in c.buildings) return 'A capital cannot be traded.';
      return null;
    }
    case 'peace':
      return war || hasTreaty(state, giver, receiver, 'ceasefire') ? null : 'Peace is made to end a war or ceasefire.';
    case 'ceasefire':
      return war ? null : 'A ceasefire ends a war.';
    case 'rightOfPassage':
      if (war) return 'Not while at war.';
      if (hasTreaty(state, giver, receiver, 'rightOfPassage')) return 'Right of passage is already agreed.';
      return bothKnow('enablesRightOfPassage', 'rights of passage');
    case 'mutualProtection':
      if (war) return 'Not while at war.';
      if (hasTreaty(state, giver, receiver, 'mutualProtection')) return 'A pact is already in force.';
      return bothKnow('enablesMutualProtectionPacts', 'protection pacts');
    case 'alliance': {
      if (war) return 'Not while at war.';
      const t = state.players[item.against];
      if (!t?.alive || t.barbarian || item.against === giver || item.against === receiver) return 'Pick a common enemy.';
      if (!g.contacts.includes(item.against) || !r.contacts.includes(item.against)) return `Both sides must have met ${t.name}.`;
      if (state.diplomacy.treaties.some((x) => x.kind === 'alliance' && x.against === item.against && x.parties[0] === pair(giver, receiver)[0] && x.parties[1] === pair(giver, receiver)[1]))
        return 'That alliance already stands.';
      return bothKnow('enablesMilitaryAlliances', 'military alliances');
    }
    case 'embargo': {
      const t = state.players[item.against];
      if (!t?.alive || t.barbarian || item.against === giver || item.against === receiver) return 'Pick a civilization to embargo.';
      return bothKnow('enablesTradeEmbargoes', 'embargoes');
    }
    case 'withdraw':
      return war ? 'Not while at war.' : null;
  }
}

/** Why a deal cannot be made as it stands, or null. */
export function dealBlocker(rules: Rules, state: GameState, deal: Deal): string | null {
  const a = state.players[deal.from];
  const b = state.players[deal.to];
  if (!a?.alive || !b?.alive || deal.from === deal.to || a.barbarian || b.barbarian) return 'Pick another living civilization.';
  if (!hasContact(state, deal.from, deal.to)) return `You have not met ${b.name}.`;
  if (deal.give.length + deal.take.length === 0) return 'Put something on the table.';
  if (embargoed(state, deal.from, deal.to)) return 'An embargo forbids trade between you.';
  const war = atWar(state, deal.from, deal.to);
  const all = [...deal.give, ...deal.take];
  if (war && !all.some((i) => i.kind === 'peace' || i.kind === 'ceasefire')) return 'At war, only peace or a ceasefire opens talks.';
  if (all.some((i) => i.kind === 'peace') && all.some((i) => i.kind === 'ceasefire')) return 'Peace or a ceasefire, not both.';
  if (all.some((i) => i.kind === 'withdraw') && deal.demand?.kind !== 'withdraw') return 'Troops are withdrawn only on demand.';
  if (deal.demand) {
    if (deal.give.length > 0) return 'A demand offers nothing in return.';
    if (deal.demand.kind === 'withdraw' && (deal.take.length !== 1 || deal.take[0]!.kind !== 'withdraw')) return 'Demand the withdrawal of troops and nothing else.';
    if (deal.demand.kind === 'tribute' && deal.take.some((i) => i.kind !== 'gold' && i.kind !== 'tech')) return 'Tribute is gold or an advance.';
  }
  const keys = new Set<string>();
  for (const [list, giver, receiver] of [
    [deal.give, deal.from, deal.to],
    [deal.take, deal.to, deal.from],
  ] as const) {
    for (const item of list) {
      const key = isTreatyItem(item) ? JSON.stringify(item) : `${giver}:${JSON.stringify(item)}`;
      if (keys.has(key)) return 'The same item twice.';
      keys.add(key);
      const why = itemBlocker(rules, state, giver, receiver, item, war);
      if (why) return why;
    }
  }
  return null;
}

const demandKey = (from: number, to: number, kind: Demand['kind']) => `${from}:${to}:${kind}`;

/**
 * Why `deal` (a demand) cannot be made now, or null: everything `dealBlocker` checks,
 * troops to withdraw, and the cooldown since the last demand of its kind (DEMAND_COOLDOWN).
 */
export function demandBlocker(rules: Rules, state: GameState, deal: Deal): string | null {
  if (!deal.demand) return 'Not a demand.';
  const why = dealBlocker(rules, state, deal);
  if (why) return why;
  const them = nameOf(state, deal.to);
  if (deal.demand.kind === 'withdraw' && trespassers(rules, state, deal.from, deal.to).length === 0) return `${them} has no troops in your territory.`;
  const last = state.diplomacy.demands?.[demandKey(deal.from, deal.to, deal.demand.kind)];
  if (last !== undefined && state.turn - last < DEMAND_COOLDOWN[deal.demand.kind]) return `Too soon to make another demand of ${them}.`;
  return null;
}

/** Hands a city over in a deal: buildings stay, the giver's units there go home. */
function transferCity(rules: Rules, tx: Tx, cityId: number, to: number): void {
  const c = tx.state.cities[cityId]!;
  const from = c.owner;
  const w = tx.city(cityId);
  w.owner = to;
  w.build = null;
  w.queue = [];
  w.shields = 0;
  w.shieldsFor = null;
  w.manualTiles = false;
  w.capturedOn = null;
  for (const b of Object.keys(w.buildings)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by building id
    if (rules.building(b).kind === 'smallWonder') delete w.buildings[b];
  }
  const home = playerCities(tx.state, from).sort((p, q) => distance(tx.state.map, p.tile, c.tile) - distance(tx.state.map, q.tile, c.tile) || p.id - q.id)[0];
  for (const u of Object.values(tx.state.units).sort((p, q) => p.id - q.id)) {
    if (u.owner !== from || u.tile !== c.tile || u.carriedBy !== null || !home) continue;
    tx.unit(u.id).tile = home.tile;
    carryAlong(tx, u.id, home.tile);
  }
  updateTerritory(rules, tx);
  replaceCitizens(rules, tx, cityId);
  tx.emit({ type: 'cityTraded', city: cityId, player: to, from, tile: c.tile, name: c.name });
}

function giveItem(rules: Rules, tx: Tx, giver: number, receiver: number, item: DealItem): void {
  const turn = tx.state.turn;
  const d = () => tx.diplomacy();
  switch (item.kind) {
    case 'gold':
      tx.player(giver).gold = tx.state.players[giver]!.gold - item.amount;
      tx.player(receiver).gold = tx.state.players[receiver]!.gold + item.amount;
      return;
    case 'goldPerTurn':
    case 'resource': {
      const dd = d();
      const id = dd.nextId;
      dd.nextId = id + 1;
      dd.ongoing.push({ id, from: giver, to: receiver, item: item.kind === 'goldPerTurn' ? { kind: 'goldPerTurn', amount: item.amount } : { kind: 'resource', resource: item.resource }, since: turn, until: turn + DEAL_TURNS });
      return;
    }
    case 'tech':
      learn(rules, tx, receiver, item.tech);
      if (tx.state.players[receiver]!.research.tech === item.tech) tx.player(receiver).research = { tech: null, beakers: tx.state.players[receiver]!.research.beakers, turns: 0 };
      return;
    case 'worldMap': {
      const src = tx.state.players[giver]!.explored;
      const p = tx.player(receiver);
      for (let i = 0; i < src.length; i++) p.explored[i] = (p.explored[i]! | src[i]!) >>> 0;
      return;
    }
    case 'contact':
      meet(tx, receiver, item.player);
      return;
    case 'embassy':
      tx.player(receiver).embassies = [...tx.state.players[receiver]!.embassies, giver].sort((x, y) => x - y);
      return;
    case 'city':
      transferCity(rules, tx, item.city, receiver);
      return;
    case 'withdraw':
      expel(rules, tx, giver, receiver);
      return;
    default:
      return;
  }
}

function applyTreatyItem(rules: Rules, tx: Tx, a: number, b: number, item: DealItem): void {
  switch (item.kind) {
    case 'peace':
      signPeace(rules, tx, a, b);
      return;
    case 'ceasefire': {
      setWar(tx, a, b, false);
      addTreaty(tx, a, b, 'ceasefire', tx.state.turn + CEASEFIRE_TURNS);
      tx.emit({ type: 'ceasefireAgreed', player: a, target: b, until: tx.state.turn + CEASEFIRE_TURNS });
      return;
    }
    case 'rightOfPassage':
    case 'mutualProtection':
      addTreaty(tx, a, b, item.kind, null);
      return;
    case 'alliance':
      addTreaty(tx, a, b, 'alliance', null, item.against);
      for (const p of [a, b]) if (!atWar(tx.state, p, item.against)) declareWar(tx, p, item.against);
      return;
    case 'embargo': {
      addTreaty(tx, a, b, 'embargo', null, item.against);
      const dd = tx.diplomacy();
      dd.ongoing = dd.ongoing.filter((o) => !([a, b].includes(o.from) && o.to === item.against) && !([a, b].includes(o.to) && o.from === item.against));
      remember(tx, item.against, a, -10);
      remember(tx, item.against, b, -10);
      return;
    }
    default:
      return;
  }
}

/** Carries out an agreed deal. */
export function executeDeal(rules: Rules, tx: Tx, deal: Deal): void {
  for (const item of deal.give) if (!isTreatyItem(item)) giveItem(rules, tx, deal.from, deal.to, item);
  for (const item of deal.take) if (!isTreatyItem(item)) giveItem(rules, tx, deal.to, deal.from, item);
  for (const item of [...deal.give, ...deal.take]) if (isTreatyItem(item)) applyTreatyItem(rules, tx, deal.from, deal.to, item);
  if (deal.demand) {
    // A demand met pleases the demander; tribute paid under threat is resented.
    remember(tx, deal.from, deal.to, 5);
    if (deal.demand.kind === 'tribute') remember(tx, deal.to, deal.from, -5);
  } else if (deal.take.length === 0 && deal.give.length > 0 && !deal.give.every(isTreatyItem)) {
    // A gift (nothing asked back) is remembered warmly.
    remember(tx, deal.to, deal.from, 8);
  }
  else {
    remember(tx, deal.from, deal.to, 2);
    remember(tx, deal.to, deal.from, 2);
  }
  tx.emit({ type: 'dealMade', player: deal.from, target: deal.to, give: deal.give.map((i) => itemLabel(rules, tx.state, i)), take: deal.take.map((i) => itemLabel(rules, tx.state, i)) });
}

/** The `proposeDeal` and `answerDeal` commands. */
export function proposeDeal(rules: Rules, tx: Tx, deal: Deal, reason?: string): CommandError | null {
  const why = deal.demand ? demandBlocker(rules, tx.state, deal) : dealBlocker(rules, tx.state, deal);
  if (why) return err('invalid', why);
  const d = tx.diplomacy();
  const id = d.nextId;
  d.nextId = id + 1;
  d.proposals.push({ ...deal, id, turn: tx.state.turn });
  if (deal.demand) d.demands = { ...d.demands, [demandKey(deal.from, deal.to, deal.demand.kind)]: tx.state.turn };
  tx.emit({ type: 'dealProposed', proposal: id, player: deal.from, target: deal.to, ...(deal.demand ? { demand: deal.demand.kind } : {}), ...(reason ? { reason } : {}) });
  return null;
}

/** A demand refused (or left unanswered): the demander resents it and, if it threatened war, declares it. */
function refuseDemand(tx: Tx, p: Deal): void {
  if (!p.demand) return;
  remember(tx, p.from, p.to, -10);
  const s = tx.state;
  if (p.demand.war && s.players[p.from]!.alive && s.players[p.to]!.alive && !atWar(s, p.from, p.to)) declareWar(tx, p.from, p.to, { refused: p.demand.kind });
}

export function answerDeal(rules: Rules, tx: Tx, player: number, proposalId: number, accept: boolean): CommandError | null {
  const p = tx.state.diplomacy.proposals.find((x) => x.id === proposalId);
  if (!p) return err('invalid', 'That offer is no longer on the table.');
  if (p.to !== player) return err('invalid', 'That offer was not made to you.');
  const d = tx.diplomacy();
  d.proposals = d.proposals.filter((x) => x.id !== proposalId);
  if (!accept) {
    tx.emit({ type: 'dealRejected', proposal: proposalId, player: p.to, target: p.from });
    refuseDemand(tx, p);
    return null;
  }
  const why = dealBlocker(rules, tx.state, p);
  if (why) return err('invalid', `The deal no longer works: ${why}`);
  executeDeal(rules, tx, p);
  return null;
}

/** Offers to `player` lapse when it ends its turn without answering; a demand left unanswered is refused. */
export function dropProposalsTo(tx: Tx, player: number): void {
  if (!tx.state.diplomacy.proposals.some((p) => p.to === player || p.from === player)) return;
  const d = tx.diplomacy();
  const lapsed = d.proposals.filter((p) => p.to === player);
  d.proposals = d.proposals.filter((p) => p.to !== player);
  for (const p of lapsed) {
    if (!p.demand) continue;
    tx.emit({ type: 'dealRejected', proposal: p.id, player: p.to, target: p.from });
    refuseDemand(tx, p);
  }
}

// ---------------------------------------------------------------------------
// End of turn
// ---------------------------------------------------------------------------

/**
 * Diplomacy at the end of the turn: contacts by sight, ceasefires running out, payments
 * and deliveries, alliances whose war is over, trespassing, and memories fading.
 */
export function runDiplomacyTurn(rules: Rules, tx: Tx): void {
  sweepContacts(rules, tx);
  const turn = tx.state.turn;
  // Ceasefires that run out turn back into war.
  for (const t of [...tx.state.diplomacy.treaties]) {
    // The war resumes as the turn the ceasefire runs out begins.
    if (t.kind !== 'ceasefire' || t.until === null || t.until > turn + 1) continue;
    const [a, b] = t.parties;
    const d = tx.diplomacy();
    d.treaties = d.treaties.filter((x) => x.id !== t.id);
    if (!tx.state.players[a]!.alive || !tx.state.players[b]!.alive) continue;
    setWar(tx, a, b, true);
    tx.emit({ type: 'ceasefireEnded', player: a, target: b });
  }
  // Alliances end with their war; treaties end with a party.
  for (const t of [...tx.state.diplomacy.treaties]) {
    const gone = t.parties.some((p) => !tx.state.players[p]!.alive);
    const over = t.kind === 'alliance' && (t.against === undefined || !tx.state.players[t.against]!.alive || t.parties.every((p) => !atWar(tx.state, p, t.against!)));
    if (gone || over) {
      const d = tx.diplomacy();
      d.treaties = d.treaties.filter((x) => x.id !== t.id);
    }
  }
  // Payments and deliveries.
  for (const o of [...tx.state.diplomacy.ongoing]) {
    const giver = tx.state.players[o.from]!;
    const end = () => {
      const d = tx.diplomacy();
      d.ongoing = d.ongoing.filter((x) => x.id !== o.id);
    };
    if (!giver.alive || !tx.state.players[o.to]!.alive) {
      end();
      continue;
    }
    if (o.item.kind === 'goldPerTurn') {
      const pay = Math.min(giver.gold, o.item.amount);
      if (pay > 0) {
        tx.player(o.from).gold = giver.gold - pay;
        tx.player(o.to).gold = tx.state.players[o.to]!.gold + pay;
      }
      if (pay < o.item.amount) {
        // Defaulting breaks a trade deal: everyone who knows the payer remembers.
        end();
        breakFaith(tx, o.from, DEFAULT_PENALTY);
        tx.emit({ type: 'dealCancelled', player: o.from, target: o.to, why: 'The treasury could not pay.' });
        continue;
      }
    } else if (!empireInfo(rules, tx.state, o.from).cities.length) {
      end();
      continue;
    }
    if (o.until <= turn) {
      end();
      tx.emit({ type: 'dealExpired', player: o.from, target: o.to });
    }
  }
  // Military units lingering in a neighbour's land without leave are resented.
  const trespass = new Map<string, number>();
  const terr = tx.state.map.territory;
  for (const u of Object.values(tx.state.units)) {
    const owner = terr[u.tile]!;
    if (owner < 0 || !trespassing(rules, tx.state, u, owner)) continue;
    const key = `${owner}:${u.owner}`;
    trespass.set(key, (trespass.get(key) ?? 0) + 1);
  }
  for (const [key, n] of [...trespass.entries()].sort()) {
    const [owner, intruder] = key.split(':').map(Number) as [number, number];
    remember(tx, owner, intruder, -Math.min(4, n));
  }
  // Memories fade a point a turn; reputation recovers a point every ten turns.
  for (const p of civilizations(tx.state)) {
    const keys = Object.keys(p.memory).filter((k) => p.memory[k] !== 0);
    for (const k of keys) {
      const v = p.memory[k]!;
      remember(tx, p.id, Number(k), v > 0 ? -1 : 1);
    }
    if (turn % 10 === 0 && p.reputation < 100) tx.player(p.id).reputation = p.reputation + 1;
  }
}

/** Living civilizations `player` may trade with (met, not embargoed). */
export function tradingPartners(state: GameState, player: number): number[] {
  return state.players[player]!.contacts.filter((o) => state.players[o]?.alive && !embargoed(state, player, o));
}

/** Whether `p` could be handed `tech` in a deal: every prerequisite known (the era rule does not apply to trades). */
export function canReceiveTech(rules: Rules, p: Player, tech: string): boolean {
  return !p.techs.includes(tech) && rules.tech(tech).prerequisites.every((x) => p.techs.includes(x));
}
