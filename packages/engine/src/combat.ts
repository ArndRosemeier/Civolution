/**
 * Civ3 combat (docs/rules/combat.md): strengths with every modifier explained, the
 * choice of defender, exact odds, and the round-by-round fight itself.
 *
 * A battle is a series of rounds. Each round the attacker wins with probability
 * A / (A + D), where A and D are the modified strengths, and the loser of the round
 * loses one hit point. It ends when one side has no hit points left, or when a unit
 * allowed to retreat would lose its last one and its retreat roll succeeds.
 *
 * Strengths are integers in hundredths (base × (100 + bonus percent)), so the fight
 * itself needs no floating point.
 */
import { sizeClass } from './city.ts';
import { directionTo } from './grid.ts';
import { crossesRiver } from './queries.ts';
import { empireInfo } from './empire.ts';
import type { Rules } from './rules.ts';
import { makeRng, hash3 } from './rng.ts';
import { IMP_FORTRESS, type GameState, type Unit } from './state.ts';
import { cityAt } from './territory.ts';
import { cargoOf, isArmy } from './units.ts';
import type { Part } from './yields.ts';

/** A strength: the base value, its percent modifiers, and the result in hundredths. */
export interface Strength {
  base: number;
  /** Percent modifiers, each explained. */
  mods: Part[];
  /** base × (100 + Σ mods), in hundredths of a strength point. */
  value: number;
}

export type CombatKind = 'land' | 'sea' | 'bombard' | 'air';

function strength(base: number, mods: Part[]): Strength {
  const pct = mods.reduce((a, m) => a + m.amount, 0);
  return { base, mods: mods.filter((m) => m.amount !== 0), value: Math.max(0, base * (100 + pct)) };
}

/** Building defence by kind of attack (docs/rules/combat.md: walls only help towns). */
const CITY_BUILDING_DEFENCE: Record<string, CombatKind[]> = {
  walls: ['land'],
  civilDefense: ['bombard', 'air'],
  coastalFortress: ['sea'],
  samMissileBattery: ['air'],
};

/**
 * The SAM Missile Battery doubles its city's defence against air strikes (docs/rules/air.md).
 * The rule file stores no number for it (its defence fields are 0), so this is our default.
 */
export const SAM_DEFENCE_PERCENT = 100;

function hasActiveEffect(rules: Rules, state: GameState, player: number, effect: string): boolean {
  if (state.players[player]?.barbarian) return false;
  for (const w of empireInfo(rules, state, player).activeWonders) if (rules.building(w).effects.includes(effect)) return true;
  return false;
}

/** Bonus a civilization's units get against barbarians: the difficulty's (human players) and the Great Wall's. */
function barbarianMods(rules: Rules, state: GameState, player: number, opponent: number | null): Part[] {
  if (opponent === null || !state.players[opponent]?.barbarian) return [];
  const p = state.players[player]!;
  if (p.barbarian) return [];
  const out: Part[] = [];
  const diff = rules.difficulty(state.difficulty);
  if (p.human && diff.attackBonusVsBarbarians > 0) out.push({ label: `${diff.name}: against barbarians`, amount: diff.attackBonusVsBarbarians });
  if (hasActiveEffect(rules, state, player, 'doubleCombatVsBarbarians')) out.push({ label: 'Great Wall: against barbarians', amount: 100 });
  return out;
}

/** Attack strength of `attacker` (one fighter: a unit, or an army member) against `opponent`. */
export function attackStrength(rules: Rules, state: GameState, attacker: Unit, opponent: number | null, owner = attacker.owner): Strength {
  const rule = rules.unit(attacker.type);
  return strength(rule.attack, barbarianMods(rules, state, owner, opponent));
}

export interface DefenceContext {
  kind: CombatKind;
  /** The attacking player, for bonuses against barbarians. */
  opponent: number | null;
  /** Tile the attack comes from, for the river bonus. */
  from?: number;
}

/** Defence strength of `defender` (one fighter) on `tile`, with its modifiers. */
export function defenceStrength(rules: Rules, state: GameState, defender: Unit, tile: number, ctx: DefenceContext, owner = defender.owner): Strength {
  const rule = rules.unit(defender.type);
  const g = rules.set.general;
  const mods: Part[] = [];
  const terrain = rules.terrains[state.map.terrain[tile]!]!;
  const land = rule.domain === 'land' && !terrain.water;
  const city = cityAt(state, tile);
  if (land) {
    if (terrain.defenceBonus) mods.push({ label: terrain.name, amount: terrain.defenceBonus });
    if (ctx.kind === 'land' && ctx.from !== undefined) {
      const dir = directionTo(state.map, ctx.from, tile);
      if (dir >= 0 && crossesRiver(state, ctx.from, dir)) mods.push({ label: 'Across a river', amount: g.riverDefenceBonus });
    }
    const fortress = !city && (state.map.improvements[tile]! & IMP_FORTRESS) !== 0;
    if (fortress) mods.push({ label: 'Fortress', amount: g.fortressDefenceBonus });
    else if (defender.fortified || city) mods.push({ label: city ? 'Fortified in the city' : 'Fortified', amount: g.fortifiedDefenceBonus });
  }
  if (city && city.owner === owner) {
    const cls = sizeClass(rules, city.size);
    if (ctx.kind === 'land' && land) {
      const bonus = cls === 'town' ? g.townDefenceBonus : cls === 'city' ? g.cityDefenceBonus : g.metropolisDefenceBonus;
      if (bonus) mods.push({ label: cls === 'metropolis' ? 'Metropolis' : cls === 'city' ? 'City' : 'Town', amount: bonus });
    }
    const have = empireInfo(rules, state, owner).effective.get(city.id) ?? new Set(Object.keys(city.buildings));
    for (const [b, kinds] of Object.entries(CITY_BUILDING_DEFENCE)) {
      if (!have.has(b) || !kinds.includes(ctx.kind) || !rules.hasBuilding(b)) continue;
      const br = rules.building(b);
      if (b === 'walls' && cls !== 'town') continue;
      const amount = b === 'samMissileBattery' ? SAM_DEFENCE_PERCENT : ctx.kind === 'sea' ? br.navalDefenceBonus : br.defenceBonus;
      if (amount) mods.push({ label: br.name, amount });
    }
  }
  mods.push(...barbarianMods(rules, state, owner, ctx.opponent));
  return strength(rule.defence, mods);
}

/** A side of a battle: one unit, or an army's members fighting in turn. */
export interface Side {
  /** The unit that fights (the army itself for an army). */
  unit: number;
  /** Fighting units: the unit itself, or the army's members. */
  members: number[];
  strengths: number[];
  hp: number[];
  /** Percent chance to retreat instead of losing the last hit point (0: cannot). */
  retreat: number;
}

/** Whether a unit takes part in fights at all. */
export function isCombatant(rules: Rules, state: GameState, u: Unit): boolean {
  const r = rules.unit(u.type);
  if (r.abilities.includes('army')) return cargoOf(state, u.id).length > 0;
  return r.attack > 0 || r.defence > 0;
}

function fighters(rules: Rules, state: GameState, u: Unit): Unit[] {
  return isArmy(rules, u) ? cargoOf(state, u.id) : [u];
}

/**
 * Retreat (docs/rules/combat.md): a land unit faster than its opponent may withdraw
 * instead of dying, with the chance of its experience level. Defenders do not withdraw
 * from cities or fortresses; armies never retreat.
 */
export function retreatChance(rules: Rules, state: GameState, u: Unit, opponent: Unit, defending: boolean): number {
  const r = rules.unit(u.type);
  if (r.domain !== 'land' || isArmy(rules, u) || isArmy(rules, opponent)) return 0;
  if (r.movement <= rules.unit(opponent.type).movement) return 0;
  if (defending && (cityAt(state, u.tile) || state.map.improvements[u.tile]! & IMP_FORTRESS)) return 0;
  return rules.set.experienceLevels.find((l) => l.id === u.experience)?.retreatChance ?? 0;
}

export function attackSide(rules: Rules, state: GameState, attacker: Unit, defender: Unit): Side {
  const ms = fighters(rules, state, attacker);
  return {
    unit: attacker.id,
    members: ms.map((m) => m.id),
    strengths: ms.map((m) => attackStrength(rules, state, m, defender.owner, attacker.owner).value),
    hp: ms.map((m) => m.hp),
    retreat: retreatChance(rules, state, attacker, defender, false),
  };
}

export function defenceSide(rules: Rules, state: GameState, defender: Unit, attacker: Unit, kind: CombatKind, from?: number): Side {
  const ms = fighters(rules, state, defender);
  const ctx: DefenceContext = { kind, opponent: attacker.owner, ...(from === undefined ? {} : { from }) };
  return {
    unit: defender.id,
    members: ms.map((m) => m.id),
    strengths: ms.map((m) => defenceStrength(rules, state, m, defender.tile, ctx, defender.owner).value),
    hp: ms.map((m) => m.hp),
    retreat: retreatChance(rules, state, defender, attacker, true),
  };
}

/** The member that fights next: the strongest by strength × hit points (ties: first). */
export function activeMember(strengths: readonly number[], hp: readonly number[]): number {
  let best = -1;
  let score = -1;
  for (let i = 0; i < hp.length; i++) {
    if (hp[i]! <= 0) continue;
    const s = strengths[i]! * hp[i]!;
    if (s > score) {
      score = s;
      best = i;
    }
  }
  return best;
}

/** Can `u` defend its tile against an attack of this kind? */
function defendsAgainst(rules: Rules, state: GameState, u: Unit, kind: CombatKind): boolean {
  if (u.carriedBy !== null) return false;
  const r = rules.unit(u.type);
  if (!isCombatant(rules, state, u)) return false;
  if (kind === 'land') return r.domain === 'land' && (r.defence > 0 || isArmy(rules, u));
  if (kind === 'sea') return r.domain === 'sea' && r.defence > 0;
  return r.defence > 0 && r.domain !== 'air';
}

/**
 * The unit that defends `tile` against `attacker`: the one with the best defence
 * strength × hit points (docs/rules/combat.md). Null when nothing there can defend.
 */
export function pickDefender(rules: Rules, state: GameState, attacker: Unit, tile: number, kind: CombatKind, from?: number): Unit | null {
  let best: Unit | null = null;
  let bestScore = -1;
  const units = Object.values(state.units)
    .filter((u) => u.tile === tile && u.owner !== attacker.owner)
    .sort((a, b) => a.id - b.id);
  for (const u of units) {
    if (!defendsAgainst(rules, state, u, kind)) continue;
    const side = defenceSide(rules, state, u, attacker, kind, from);
    const score = side.strengths.reduce((a, s) => Math.max(a, s), 0) * side.hp.reduce((a, h) => a + h, 0);
    if (score > bestScore) {
      best = u;
      bestScore = score;
    }
  }
  return best;
}

export interface Odds {
  attackerWins: number;
  attackerRetreats: number;
  defenderRetreats: number;
  defenderWins: number;
}

type Outcome = [number, number, number, number];

/**
 * Exact odds of a battle (docs/rules/combat.md). Large army battles fall back to a
 * fixed-seed simulation so the query stays pure and quick.
 */
export function battleOdds(a: Side, d: Side): Odds {
  const space = [...a.hp, ...d.hp].reduce((acc, h) => acc * (h + 1), 1);
  const r = space > 60000 ? simulateOdds(a, d) : exactOdds(a, d);
  return { attackerWins: r[0], attackerRetreats: r[1], defenderRetreats: r[2], defenderWins: r[3] };
}

function exactOdds(a: Side, d: Side): Outcome {
  const memo = new Map<string, Outcome>();
  const ra = a.members.length === 1 ? a.retreat / 100 : 0;
  const rd = d.members.length === 1 ? d.retreat / 100 : 0;
  const f = (ha: number[], hd: number[]): Outcome => {
    const key = `${ha.join(',')}|${hd.join(',')}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const i = activeMember(a.strengths, ha);
    const j = activeMember(d.strengths, hd);
    let out: Outcome;
    if (j < 0) out = [1, 0, 0, 0];
    else if (i < 0) out = [0, 0, 0, 1];
    else {
      const sa = a.strengths[i]!;
      const sd = d.strengths[j]!;
      const p = sa + sd === 0 ? 0.5 : sa / (sa + sd);
      // Attacker wins the round.
      let win: Outcome;
      if (hd[j] === 1 && rd > 0 && hd.reduce((x, y) => x + y, 0) === 1) {
        // The defender would die: it withdraws if its roll succeeds.
        win = [1 - rd, 0, rd, 0];
      } else {
        const nd = [...hd];
        nd[j] = nd[j]! - 1;
        win = f(ha, nd);
      }
      let lose: Outcome;
      if (ha[i] === 1 && ra > 0 && ha.reduce((x, y) => x + y, 0) === 1) {
        lose = [0, ra, 0, 1 - ra];
      } else {
        const na = [...ha];
        na[i] = na[i]! - 1;
        lose = f(na, hd);
      }
      out = [0, 1, 2, 3].map((k) => p * win[k]! + (1 - p) * lose[k]!) as Outcome;
    }
    memo.set(key, out);
    return out;
  };
  return f([...a.hp], [...d.hp]);
}

function simulateOdds(a: Side, d: Side): Outcome {
  const rng = makeRng(hash3(a.strengths.reduce((x, y) => x + y, 0), d.strengths.reduce((x, y) => x + y, 0), a.hp.length * 31 + d.hp.length));
  const n = 4000;
  const out: Outcome = [0, 0, 0, 0];
  const index: Record<BattleResult, number> = { attackerWon: 0, attackerRetreated: 1, defenderRetreated: 2, defenderWon: 3 };
  for (let t = 0; t < n; t++) out[index[fight(a, d, (k) => rng.int(k)).result]]!++;
  return out.map((x) => x / n) as Outcome;
}

export type BattleResult = 'attackerWon' | 'defenderWon' | 'attackerRetreated' | 'defenderRetreated';

export interface Fight {
  result: BattleResult;
  /** One letter per round: 'a' when the attacker won it, 'd' when the defender did. */
  rounds: string;
  attackerHp: number[];
  defenderHp: number[];
}

/** Fights a battle with the given random source (`random(n)` is uniform in [0, n)). */
export function fight(a: Side, d: Side, random: (n: number) => number): Fight {
  const ha = [...a.hp];
  const hd = [...d.hp];
  let rounds = '';
  const single = (hp: number[]) => hp.reduce((x, y) => x + y, 0) === 1;
  for (let guard = 0; guard < 10000; guard++) {
    const i = activeMember(a.strengths, ha);
    const j = activeMember(d.strengths, hd);
    if (j < 0) return { result: 'attackerWon', rounds, attackerHp: ha, defenderHp: hd };
    if (i < 0) return { result: 'defenderWon', rounds, attackerHp: ha, defenderHp: hd };
    const sa = a.strengths[i]!;
    const sd = d.strengths[j]!;
    const attackerWins = sa + sd === 0 ? random(2) === 0 : random(sa + sd) < sa;
    if (attackerWins) {
      rounds += 'a';
      if (hd[j] === 1 && d.members.length === 1 && single(hd) && d.retreat > 0 && random(100) < d.retreat)
        return { result: 'defenderRetreated', rounds, attackerHp: ha, defenderHp: hd };
      hd[j] = hd[j]! - 1;
    } else {
      rounds += 'd';
      if (ha[i] === 1 && a.members.length === 1 && single(ha) && a.retreat > 0 && random(100) < a.retreat)
        return { result: 'attackerRetreated', rounds, attackerHp: ha, defenderHp: hd };
      ha[i] = ha[i]! - 1;
    }
  }
  return { result: 'defenderWon', rounds, attackerHp: ha, defenderHp: hd };
}

