/**
 * Test vectors for Phase 3 (docs/rules/combat.md, bombard.md, capture.md, armies.md,
 * naval.md, air.md, nukes.md, war-weariness.md, barbarians.md). Expected numbers are
 * worked by hand from the rule pages or taken from published Civ3 calculations; the
 * comments show the working.
 */
import { describe, expect, it } from 'vitest';
import {
  apply,
  battleOdds,
  checkInvariants,
  cityReport,
  defenceStrength,
  attackStrength,
  fight,
  invalidateCaches,
  IMP_FORTRESS,
  IMP_POLLUTION,
  IMP_ROAD,
  makeRng,
  pickDefender,
  playerCities,
  previewAttack,
  EDGE_NE,
  EDGE_SW,
  type City,
  type GameState,
  type Side,
} from '../src/index.ts';
import { at, endTurnAll, flatGame, place, rules, run, setTerrain } from './helpers.ts';

const side = (strengths: number[], hp: number[], retreat = 0): Side => ({
  unit: 1,
  members: strengths.map((_, i) => i + 1),
  strengths,
  hp,
  retreat,
});

/** Closed form for single units without retreat: P(win) = Σ_{k<hpA} C(hpD−1+k, k) p^hpD q^k. */
function closedForm(p: number, hpA: number, hpD: number): number {
  const c = (n: number, k: number) => {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  };
  let s = 0;
  for (let k = 0; k < hpA; k++) s += c(hpD - 1 + k, k) * p ** hpD * (1 - p) ** k;
  return s;
}

/** Declares war; both sides keep a settler far away so losing a battle does not end them. */
function war(s: GameState, a = 0, b = 1): GameState {
  place(s, a, 'settler', at(s, 50, 50));
  place(s, b, 'settler', at(s, 50, 54));
  return run(s, { type: 'declareWar', player: a, target: b });
}

function found(s: GameState, owner: number, x: number, y: number): { s: GameState; c: City } {
  const u = place(s, owner, 'settler', at(s, x, y));
  s = run(s, { type: 'foundCity', player: owner, unit: u.id });
  return { s, c: Object.values(s.cities).find((k) => k.tile === at(s, x, y))! };
}

describe('combat odds', () => {
  it('matches the binomial formula for single units', () => {
    // Regular (3 hp) against regular (3 hp), A = 3, D = 2: p = 0.6 per round.
    // P = 0.6³ (1 + 3·0.4 + 6·0.4²) = 0.216 × 2.16 = 0.46656 + … = 0.68256.
    const o = battleOdds(side([300], [3]), side([200], [3]));
    expect(o.attackerWins).toBeCloseTo(0.68256, 5);
    expect(o.attackerWins + o.defenderWins).toBeCloseTo(1, 10);
    for (const [a, d, ha, hd] of [[1, 1, 3, 3], [4, 3, 4, 3], [6, 10, 5, 2], [16, 18, 3, 4]] as const) {
      const p = a / (a + d);
      expect(battleOdds(side([a * 100], [ha]), side([d * 100], [hd])).attackerWins).toBeCloseTo(closedForm(p, ha, hd), 10);
    }
  });

  it('reproduces a published Civ3 calculation', () => {
    // Apolyton Civ3 strategy archive, "civ 3 combat calculations with retreat odds" (2002):
    // veteran Cavalry, attack 6, 5 hp, against fortified Infantry in a size 7–12 city on
    // plains, modified defence 18.15, 4 hp, no retreat: the attacker wins 11.2 % of the time.
    const o = battleOdds(side([600], [5]), side([1815], [4]));
    expect(Math.round(o.attackerWins * 1000) / 10).toBe(11.2);
  });

  it('lets a faster attacker retreat instead of dying', () => {
    // Retreat replaces the fatal round: the win chance is unchanged, and the retreat
    // chance r takes r of the losing mass.
    const plain = battleOdds(side([200], [3]), side([200], [3]));
    const fast = battleOdds(side([200], [3], 50), side([200], [3]));
    expect(fast.attackerWins).toBeCloseTo(plain.attackerWins, 10);
    expect(fast.attackerRetreats).toBeCloseTo(plain.defenderWins * 0.5, 10);
    expect(fast.defenderWins).toBeCloseTo(plain.defenderWins * 0.5, 10);
  });

  it('agrees with the fight itself over many battles', () => {
    const a = side([300], [3], 50);
    const d = side([250], [4]);
    const o = battleOdds(a, d);
    const rng = makeRng(7);
    const n = 20000;
    let wins = 0;
    let retreats = 0;
    for (let i = 0; i < n; i++) {
      const r = fight(a, d, (k) => rng.int(k)).result;
      if (r === 'attackerWon') wins++;
      if (r === 'attackerRetreated') retreats++;
    }
    expect(Math.abs(wins / n - o.attackerWins)).toBeLessThan(0.015);
    expect(Math.abs(retreats / n - o.attackerRetreats)).toBeLessThan(0.015);
  });

  it('fights armies member by member', () => {
    // Three 3-hp members against a single 3-hp unit of equal strength: the army loses only
    // if the defender wins 9 rounds before losing 3, i.e. at most 2 of the first 11 rounds
    // go to the army: (1 + 11 + 55) / 2�� = 67 / 2048.
    const o = battleOdds(side([300, 300, 300], [3, 3, 3]), side([300], [3]));
    expect(o.defenderWins).toBeCloseTo(67 / 2048, 12);
  });
});

describe('strengths', () => {
  it('adds terrain, river and fortification bonuses', () => {
    const s = war(flatGame());
    const t = at(s, 20, 20);
    setTerrain(s, t, 'hills');
    // A river on the edge between (19, 21) (south-west) and the hills.
    s.map.rivers[t] = EDGE_SW;
    s.map.rivers[at(s, 19, 21)] = EDGE_NE;
    const spear = place(s, 1, 'spearman', t, { fortified: true });
    const warrior = place(s, 0, 'warrior', at(s, 19, 21));
    invalidateCaches(s);
    // Spearman D 2 × (100 + 50 hills + 25 river + 25 fortified) % = 4.00.
    const d = defenceStrength(rules, s, spear, t, { kind: 'land', opponent: 0, from: warrior.tile });
    expect(d.value).toBe(400);
    expect(d.mods.map((m) => m.label)).toEqual(['Hills', 'Across a river', 'Fortified']);
    // From a tile that does not cross the river there is no river bonus.
    expect(defenceStrength(rules, s, spear, t, { kind: 'land', opponent: 0, from: at(s, 21, 21) }).value).toBe(350);
  });

  it('uses the fortress instead of fortifying', () => {
    const s = flatGame();
    const t = at(s, 20, 20);
    s.map.improvements[t] = IMP_FORTRESS;
    const spear = place(s, 1, 'spearman', t, { fortified: true });
    invalidateCaches(s);
    // Grassland 10 + fortress 50 = +60 %.
    expect(defenceStrength(rules, s, spear, t, { kind: 'land', opponent: 0 }).value).toBe(320);
  });

  it('gives city size and walls bonuses against land attacks', () => {
    let { s, c } = found(flatGame(), 1, 20, 20);
    const spear = place(s, 1, 'spearman', c.tile);
    invalidateCaches(s);
    // Town: grassland 10 + fortified in the city 25 = +35 %.
    expect(defenceStrength(rules, s, spear, c.tile, { kind: 'land', opponent: 0 }).value).toBe(270);
    s.cities[c.id]!.buildings.walls = 1;
    invalidateCaches(s);
    // Walls help towns: +50 % more.
    expect(defenceStrength(rules, s, spear, c.tile, { kind: 'land', opponent: 0 }).value).toBe(370);
    s.cities[c.id]!.size = 8;
    invalidateCaches(s);
    // A city of 7–12 gets +50 % by size; the walls add nothing more.
    expect(defenceStrength(rules, s, spear, c.tile, { kind: 'land', opponent: 0 }).value).toBe(370);
    s.cities[c.id]!.size = 13;
    invalidateCaches(s);
    expect(defenceStrength(rules, s, spear, c.tile, { kind: 'land', opponent: 0 }).value).toBe(470);
    c = s.cities[c.id]!;
    expect(c.size).toBe(13);
  });

  it('gives human players the difficulty bonus against barbarians', () => {
    const s = flatGame();
    const barb = s.players.find((p) => p.barbarian)!.id;
    const w = place(s, 0, 'warrior', at(s, 20, 20));
    // Player A is human; Regent gives +200 %.
    expect(attackStrength(rules, s, w, barb).value).toBe(300);
    const w2 = place(s, 1, 'warrior', at(s, 22, 20));
    expect(attackStrength(rules, s, w2, barb).value).toBe(100);
  });

  it('picks the strongest healthy defender', () => {
    const s = war(flatGame());
    const t = at(s, 20, 20);
    place(s, 1, 'warrior', t);
    const spear = place(s, 1, 'spearman', t);
    place(s, 1, 'worker', t);
    const a = place(s, 0, 'swordsman', at(s, 22, 20));
    expect(pickDefender(rules, s, a, t, 'land')!.id).toBe(spear.id);
    // A badly hurt spearman (1 hp × 2.2) loses the job to a healthy warrior (3 hp × 1.1).
    s.units[spear.id] = { ...spear, hp: 1 };
    expect(pickDefender(rules, s, a, t, 'land')!.type).toBe('warrior');
  });
});

describe('attacking', () => {
  it('needs a war, then fights and spends the attack', () => {
    let s = flatGame();
    const t = at(s, 20, 20);
    place(s, 1, 'worker', t);
    place(s, 1, 'warrior', t);
    const a = place(s, 0, 'archer', at(s, 22, 20));
    const peace = apply(rules, s, { type: 'moveUnit', player: 0, unit: a.id, to: t });
    expect(peace.error?.code).toBe('notAtWar');
    s = war(s);
    expect(s.players[1]!.atWarWith).toEqual([0]);
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: a.id, to: t });
    expect(r.error).toBeUndefined();
    const ev = r.events.find((e) => e.type === 'combat');
    expect(ev).toBeTruthy();
    s = r.state;
    const after = s.units[a.id];
    if (after) {
      expect(after.attacked).toBe(true);
      expect(after.movesLeft).toBe(0);
      // No second attack this turn.
      const again = apply(rules, s, { type: 'moveUnit', player: 0, unit: a.id, to: t });
      expect(again.error).toBeTruthy();
    }
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('captures a worker left without a defender', () => {
    let s = war(flatGame());
    const t = at(s, 20, 20);
    const w = place(s, 1, 'worker', t);
    const a = place(s, 0, 'warrior', at(s, 22, 20));
    s = run(s, { type: 'moveUnit', player: 0, unit: a.id, to: t });
    expect(s.units[w.id]!.owner).toBe(0);
    expect(s.units[a.id]!.tile).toBe(t);
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('turns a captured settler into a worker', () => {
    let s = war(flatGame());
    const t = at(s, 20, 20);
    place(s, 1, 'settler', t);
    // Keep player 1 alive with a city elsewhere.
    s = found(s, 1, 40, 20).s;
    const a = place(s, 0, 'warrior', at(s, 22, 20));
    s = run(s, { type: 'moveUnit', player: 0, unit: a.id, to: t });
    const captured = Object.values(s.units).filter((u) => u.tile === t && u.owner === 0).map((u) => u.type).sort();
    expect(captured).toEqual(['warrior', 'worker']);
  });

  it('captures an undefended city: one citizen fewer, palace moves, gold is plundered', () => {
    let s = war(flatGame());
    const cap = found(s, 1, 20, 20);
    s = cap.s;
    s = found(s, 1, 30, 20).s;
    const other = Object.values(s.cities).find((c) => c.tile === at(s, 30, 20))!;
    s.cities[cap.c.id] = { ...s.cities[cap.c.id]!, size: 4, worked: [], specialists: { entertainer: 4 } };
    s.cities[other.id] = { ...s.cities[other.id]!, size: 4, worked: [], specialists: { entertainer: 4 } };
    s.players[1] = { ...s.players[1]!, gold: 100 };
    invalidateCaches(s);
    const a = place(s, 0, 'warrior', at(s, 22, 20));
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: a.id, to: cap.c.tile });
    expect(r.error).toBeUndefined();
    s = r.state;
    const c = s.cities[cap.c.id]!;
    expect(c.owner).toBe(0);
    expect(c.size).toBe(3);
    expect('palace' in c.buildings).toBe(true); // player 0 had no capital: it becomes theirs
    expect('palace' in s.cities[other.id]!.buildings).toBe(true); // player 1's palace moved
    // Plunder: 100 gold × 4 / 8 citizens = 50.
    expect(s.players[0]!.gold).toBe(10 + 50);
    expect(s.players[1]!.gold).toBe(50);
    expect(r.events.some((e) => e.type === 'cityCaptured')).toBe(true);
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('destroys a size 1 city, razes on request, and eliminates a civilization left with nothing', () => {
    let s = run(flatGame(), { type: 'declareWar', player: 0, target: 1 });
    const one = found(s, 1, 20, 20);
    s = one.s;
    const a = place(s, 0, 'warrior', at(s, 22, 20));
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: a.id, to: one.c.tile });
    s = r.state;
    expect(s.cities[one.c.id]).toBeUndefined();
    expect(r.events.some((e) => e.type === 'cityDestroyed')).toBe(true);
    expect(s.players[1]!.alive).toBe(false);
    expect(r.events.some((e) => e.type === 'playerEliminated')).toBe(true);
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('razes a bigger city when asked', () => {
    let s = war(flatGame());
    const c = found(s, 1, 20, 20);
    s = found(c.s, 1, 30, 20).s;
    s.cities[c.c.id] = { ...s.cities[c.c.id]!, size: 5, worked: [], specialists: { entertainer: 5 } };
    invalidateCaches(s);
    const a = place(s, 0, 'warrior', at(s, 22, 20));
    s = run(s, { type: 'moveUnit', player: 0, unit: a.id, to: c.c.tile, raze: true });
    expect(s.cities[c.c.id]).toBeUndefined();
    expect(s.players[1]!.alive).toBe(true);
  });
});

describe('bombard', () => {
  it('wears units down but never kills without lethal bombard', () => {
    let s = war(flatGame());
    const t = at(s, 20, 20);
    const target = place(s, 1, 'warrior', t);
    const cat = place(s, 0, 'catapult', at(s, 22, 20));
    for (let turn = 0; turn < 12; turn++) {
      const r = apply(rules, s, { type: 'bombard', player: 0, unit: cat.id, target: t });
      expect(r.error).toBeUndefined();
      s = r.state;
      expect(s.units[target.id]!.hp).toBeGreaterThanOrEqual(1);
      s = endTurnAll(s);
      // Keep the target from healing between shots: mark it as having acted.
      s.units[target.id] = { ...s.units[target.id]!, acted: true };
    }
    expect(s.units[target.id]!.hp).toBe(1);
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('refuses targets out of range', () => {
    const s = war(flatGame());
    place(s, 1, 'warrior', at(s, 20, 20));
    const cat = place(s, 0, 'catapult', at(s, 26, 20));
    expect(apply(rules, s, { type: 'bombard', player: 0, unit: cat.id, target: at(s, 20, 20) }).error?.message).toMatch(/range/);
  });
});

describe('transports', () => {
  it('boards a ship, sails with it, and lands', () => {
    let s = flatGame();
    for (const [x, y] of [[22, 20], [24, 20], [23, 21]] as const) setTerrain(s, at(s, x, y), 'coast');
    invalidateCaches(s);
    const galley = place(s, 0, 'galley', at(s, 22, 20));
    const w = place(s, 0, 'warrior', at(s, 20, 20));
    s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: at(s, 22, 20) });
    expect(s.units[w.id]!.carriedBy).toBe(galley.id);
    s = run(s, { type: 'moveUnit', player: 0, unit: galley.id, to: at(s, 23, 21) });
    expect(s.units[w.id]!.tile).toBe(at(s, 23, 21));
    expect(checkInvariants(rules, s)).toEqual([]);
    s = endTurnAll(s);
    s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: at(s, 22, 22) });
    expect(s.units[w.id]!.carriedBy).toBeNull();
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('sinks the cargo with the ship', () => {
    let s = war(flatGame());
    for (const [x, y] of [[22, 20], [24, 20]] as const) setTerrain(s, at(s, x, y), 'coast');
    invalidateCaches(s);
    const galley = place(s, 1, 'galley', at(s, 22, 20));
    const cargo = place(s, 1, 'warrior', at(s, 22, 20), { carriedBy: galley.id });
    const trireme = place(s, 0, 'galley', at(s, 24, 20));
    // Attack until the enemy galley sinks (or ours does).
    for (let i = 0; i < 20 && s.units[galley.id] && s.units[trireme.id]; i++) {
      s = run(s, { type: 'moveUnit', player: 0, unit: trireme.id, to: at(s, 22, 20) });
      s = endTurnAll(s);
    }
    if (!s.units[galley.id]) expect(s.units[cargo.id]).toBeUndefined();
    expect(checkInvariants(rules, s)).toEqual([]);
  });
});

describe('armies and leaders', () => {
  it('forms an army from a leader in a city, fills it and fights with it', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s = war(s);
    const leader = place(s, 0, 'leader', c.tile);
    s = run(s, { type: 'buildArmy', player: 0, unit: leader.id });
    const army = Object.values(s.units).find((u) => u.type === 'army')!;
    expect(army).toBeTruthy();
    const members = [place(s, 0, 'swordsman', c.tile), place(s, 0, 'swordsman', c.tile), place(s, 0, 'swordsman', c.tile)];
    for (const m of members) s = run(s, { type: 'joinArmy', player: 0, unit: m.id, army: army.id });
    expect(s.units[army.id]!.hp).toBe(9);
    const fourth = place(s, 0, 'swordsman', c.tile);
    expect(apply(rules, s, { type: 'joinArmy', player: 0, unit: fourth.id, army: army.id }).error?.message).toMatch(/full/);
    // Members take no orders of their own.
    expect(apply(rules, s, { type: 'fortify', player: 0, unit: members[0]!.id }).error).toBeTruthy();
    expect(checkInvariants(rules, s)).toEqual([]);
    s = endTurnAll(s);
    const target = place(s, 1, 'warrior', at(s, 22, 20));
    const p = previewAttack(rules, s, s.units[army.id]!, target.tile)!;
    expect(p.odds.attackerWins).toBeGreaterThan(0.99);
    s = run(s, { type: 'moveUnit', player: 0, unit: army.id, to: target.tile });
    expect(checkInvariants(rules, s)).toEqual([]);
    if (!s.units[target.id]) expect(s.players[0]!.armyVictory).toBe(true);
  });

  it('lets a leader finish a building', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s = run(s, { type: 'setBuild', player: 0, city: c.id, build: { kind: 'building', id: 'barracks' } });
    const leader = place(s, 0, 'leader', c.tile);
    s = run(s, { type: 'leaderHurry', player: 0, unit: leader.id });
    expect(s.units[leader.id]).toBeUndefined();
    s = endTurnAll(s);
    expect('barracks' in playerCities(s, 0)[0]!.buildings).toBe(true);
  });
});

describe('air and nukes', () => {
  it('bombs from a city within range', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s = war(s);
    const bomber = place(s, 0, 'bomber', c.tile);
    const target = place(s, 1, 'infantry', at(s, 28, 20));
    // A Bomber's operational range is 10 tiles; (44, 20) is 12 away.
    const far = place(s, 1, 'infantry', at(s, 44, 20));
    expect(apply(rules, s, { type: 'airMission', player: 0, unit: bomber.id, mission: 'bomb', target: far.tile }).error?.message).toMatch(/range/);
    const r = apply(rules, s, { type: 'airMission', player: 0, unit: bomber.id, mission: 'bomb', target: target.tile });
    expect(r.error).toBeUndefined();
    expect(r.events.some((e) => e.type === 'bombarded')).toBe(true);
    s = r.state;
    expect(s.units[bomber.id]!.attacked).toBe(true);
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('needs the Manhattan Project for nukes, then destroys everything around the target', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s = war(s);
    const enemy = found(s, 1, 30, 20);
    s = enemy.s;
    s.cities[enemy.c.id] = { ...s.cities[enemy.c.id]!, size: 8, worked: [], specialists: { entertainer: 8 } };
    const nuke = place(s, 0, 'icbm', c.tile);
    const victims = [place(s, 1, 'infantry', enemy.c.tile), place(s, 1, 'infantry', at(s, 31, 21))];
    invalidateCaches(s);
    expect(apply(rules, s, { type: 'nuke', player: 0, unit: nuke.id, target: enemy.c.tile }).error?.message).toMatch(/Manhattan/);
    s.cities[c.id] = { ...s.cities[c.id]!, buildings: { ...s.cities[c.id]!.buildings, manhattanProject: 1 } };
    s.wonders = { manhattanProject: c.id };
    invalidateCaches(s);
    const r = apply(rules, s, { type: 'nuke', player: 0, unit: nuke.id, target: enemy.c.tile });
    expect(r.error).toBeUndefined();
    s = r.state;
    for (const v of victims) expect(s.units[v.id]).toBeUndefined();
    expect(s.cities[enemy.c.id]!.size).toBe(4);
    expect(s.map.improvements[at(s, 31, 21)]! & IMP_POLLUTION).toBeTruthy();
    expect(s.players[1]!.weariness[0]).toBeGreaterThan(0);
    expect(checkInvariants(rules, s)).toEqual([]);
  });
});

describe('healing, weariness and peace', () => {
  it('heals resting units: one in the field, two in a city, fully with barracks', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    const field = place(s, 0, 'spearman', at(s, 26, 20), { hp: 1 });
    const town = place(s, 0, 'spearman', c.tile, { hp: 1, experience: 'veteran' });
    s = endTurnAll(s);
    expect(s.units[field.id]!.hp).toBe(2);
    expect(s.units[town.id]!.hp).toBe(3);
    s.cities[c.id] = { ...s.cities[c.id]!, buildings: { ...s.cities[c.id]!.buildings, barracks: 1 } };
    invalidateCaches(s);
    s = endTurnAll(s);
    expect(s.units[town.id]!.hp).toBe(4);
  });

  it('makes citizens of a democracy weary of war, and peace ends it', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s = war(s);
    s.players[0] = { ...s.players[0]!, government: 'democracy', weariness: { 1: 60 } };
    s.cities[c.id] = { ...s.cities[c.id]!, size: 6 };
    invalidateCaches(s);
    s = run(s, { type: 'autoCitizens', player: 0, city: c.id });
    // 60 points under high weariness (÷ 20) = 3 content citizens turn unhappy.
    const report = cityReport(rules, s, s.cities[c.id]!);
    expect(report.moods.find((m) => m.label === 'War weariness')).toBeTruthy();
    s = run(s, { type: 'makePeace', player: 0, target: 1 });
    expect(s.players[0]!.weariness).toEqual({});
    expect(s.players[0]!.atWarWith).toEqual([]);
    expect(s.players[1]!.atWarWith).toEqual([]);
  });
});

describe('pillage and upgrades', () => {
  it('pillages roads in enemy land only when at war', () => {
    let s = flatGame();
    const enemy = found(s, 1, 20, 20);
    s = enemy.s;
    const t = at(s, 21, 21);
    s.map.improvements[t] = IMP_ROAD;
    invalidateCaches(s);
    const w = place(s, 0, 'warrior', t);
    expect(apply(rules, s, { type: 'pillage', player: 0, unit: w.id }).error?.code).toBe('notAtWar');
    s = run(war(s), { type: 'pillage', player: 0, unit: w.id });
    expect(s.map.improvements[t]! & IMP_ROAD).toBe(0);
  });

  it('upgrades in a city for gold', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.players[0] = { ...s.players[0]!, gold: 500, resources: ['iron'], techs: [...s.players[0]!.techs, 'bronzeWorking', 'feudalism', 'monarchy', 'ceremonialBurial', 'alphabet', 'codeOfLaws', 'warriorCode'] };
    const spear = place(s, 0, 'spearman', c.tile);
    invalidateCaches(s);
    s = run(s, { type: 'upgrade', player: 0, unit: spear.id });
    expect(s.units[spear.id]!.type).toBe('pikeman');
    // (30 − 20 shields) × 3 gold.
    const cost = (rules.unit('pikeman').shieldCost - rules.unit('spearman').shieldCost) * rules.set.general.upgradeCostPerShield;
    expect(s.players[0]!.gold).toBe(500 - cost);
  });
});

describe('a thousand battles', () => {
  it('keeps every invariant and wins as often as the odds say', () => {
    const types = ['warrior', 'spearman', 'archer', 'swordsman', 'horseman', 'pikeman', 'knight', 'musketman', 'longbowman', 'chariot'];
    const terrains = ['grassland', 'hills', 'forest', 'plains', 'mountains', 'jungle'];
    const levels = ['conscript', 'regular', 'veteran', 'elite'];
    const rng = makeRng(2024);
    let s = war(flatGame(3));
    let expected = 0;
    let wins = 0;
    let fights = 0;
    for (let i = 0; i < 1000; i++) {
      const tile = at(s, 20 + 2 * (i % 10), 10 + 2 * Math.floor((i % 100) / 10));
      const from = tile + 1 <= s.map.terrain.length ? at(s, 21 + 2 * (i % 10), 11 + 2 * Math.floor((i % 100) / 10)) : tile;
      // Clear both tiles.
      s.units = Object.fromEntries(Object.entries(s.units).filter(([, u]) => u.tile !== tile && u.tile !== from));
      setTerrain(s, tile, rng.pick(terrains));
      setTerrain(s, from, 'grassland');
      invalidateCaches(s);
      const dType = rng.pick(types);
      const aType = rng.pick(types);
      const roadless = rules.terrains[s.map.terrain[tile]!]!.impassableToWheeled;
      if (roadless && [aType, dType].some((t) => rules.unit(t).abilities.includes('wheeled'))) continue;
      const def = place(s, 1, dType, tile, { experience: rng.pick(levels), fortified: rng.chance(50) });
      s.units[def.id] = { ...def, hp: rules.set.experienceLevels.find((l) => l.id === def.experience)!.hitPoints + rules.unit(dType).hitPointBonus };
      const att = place(s, 0, aType, from, { experience: rng.pick(levels) });
      s.units[att.id] = { ...att, hp: rules.set.experienceLevels.find((l) => l.id === att.experience)!.hitPoints + rules.unit(aType).hitPointBonus };
      invalidateCaches(s);
      const p = previewAttack(rules, s, s.units[att.id]!, tile);
      if (!p) continue;
      const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: att.id, to: tile });
      expect(r.error).toBeUndefined();
      const ev = r.events.find((e) => e.type === 'combat');
      expect(ev).toBeTruthy();
      expected += p.odds.attackerWins;
      if (ev?.type === 'combat' && ev.result === 'attackerWon') wins++;
      fights++;
      s = r.state;
      const problems = checkInvariants(rules, s).filter((x) => !x.includes('explored'));
      if (problems.length) throw new Error(`battle ${i} ${aType} vs ${dType}: ${problems.join('; ')}`);
    }
    expect(fights).toBeGreaterThan(900);
    // Within four standard deviations of the predicted number of wins.
    const sd = Math.sqrt(fights * 0.25);
    expect(Math.abs(wins - expected)).toBeLessThan(4 * sd);
  });
});

describe('barbarians', () => {
  it('raise camps, raid, and leave the world consistent', () => {
    let s = flatGame(5);
    s.settings = { ...s.settings, barbarians: 'raging' };
    s = found(s, 0, 10, 10).s;
    s = found(s, 1, 40, 30).s;
    place(s, 0, 'warrior', at(s, 12, 10));
    place(s, 1, 'warrior', at(s, 42, 30));
    let camps = 0;
    let events = 0;
    for (let t = 0; t < 80; t++) {
      for (const p of s.players) {
        if (!p.alive || p.barbarian) continue;
        const r = apply(rules, s, { type: 'endTurn', player: p.id });
        if (r.error) throw new Error(r.error.message);
        events += r.events.filter((e) => e.type === 'campAppeared' || e.type === 'combat' || e.type === 'cityRaided').length;
        s = r.state;
      }
      camps = Math.max(camps, s.map.flags.filter((f) => f & 8).length);
      expect(checkInvariants(rules, s)).toEqual([]);
    }
    expect(camps).toBeGreaterThan(0);
    expect(events).toBeGreaterThan(0);
  });

  it('pays for a destroyed camp', () => {
    let s = flatGame();
    const t = at(s, 20, 20);
    s.map.flags[t] = 8;
    invalidateCaches(s);
    const w = place(s, 0, 'warrior', at(s, 22, 20));
    const gold = s.players[0]!.gold;
    s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: t });
    expect(s.map.flags[t]! & 8).toBe(0);
    expect(s.players[0]!.gold).toBe(gold + 25);
  });
});
