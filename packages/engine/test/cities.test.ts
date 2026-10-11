/**
 * Test vectors for Phase 2 (docs/rules/cities.md, corruption.md, happiness.md,
 * production.md, science.md, governments.md, culture.md). Every expected number is
 * worked out by hand from the rule pages; the comments show the working.
 */
import { describe, expect, it } from 'vitest';
import {
  cityReport,
  corruptionRate,
  foodBox,
  formatYear,
  invalidateCaches,
  hurryQuote,
  IMP_IRRIGATION,
  IMP_ROAD,
  playerCities,
  techCost,
  unitSupportCost,
  yearOf,
  type City,
  type GameState,
} from '../src/index.ts';
import { at, endTurnAll, flatGame, place, rules, run, setTerrain } from './helpers.ts';

/** Founds a city for `owner` at (x, y) with a settler and returns the new state and city. */
function found(s: GameState, owner: number, x: number, y: number): { s: GameState; c: City } {
  const u = place(s, owner, 'settler', at(s, x, y));
  s = run(s, { type: 'foundCity', player: owner, unit: u.id });
  const c = Object.values(s.cities).find((k) => k.tile === at(s, x, y))!;
  return { s, c };
}

/** Puts a city's citizens on the given tiles (manual placement). */
function work(s: GameState, c: City, tiles: number[], specialists: Record<string, number> = {}): GameState {
  return run(s, { type: 'setCitizens', player: c.owner, city: c.id, worked: tiles, specialists });
}

describe('founding', () => {
  it('founds a capital with a palace, a road and a ring of borders', () => {
    const { s, c } = found(flatGame(), 0, 20, 20);
    expect(c.size).toBe(1);
    expect('palace' in c.buildings).toBe(true);
    expect(s.map.improvements[c.tile]! & IMP_ROAD).toBeTruthy();
    // Ring 1 = the 3×3 block around the city.
    expect(s.map.territory.filter((p) => p === 0).length).toBe(9);
    expect(c.worked.length).toBe(1);
  });

  it('refuses sites next to another city and on water', () => {
    let { s } = found(flatGame(), 0, 20, 20);
    const near = place(s, 0, 'settler', at(s, 21, 21));
    const r = run.bind(null, s);
    expect(() => r({ type: 'foundCity', player: 0, unit: near.id })).toThrow(/Too close/);
    setTerrain(s, at(s, 30, 30), 'coast');
    const wet = place(s, 0, 'settler', at(s, 30, 30));
    expect(() => run(s, { type: 'foundCity', player: 0, unit: wet.id })).toThrow(/cannot be founded/);
    // Two tiles away is fine.
    s = found(s, 0, 24, 20).s;
    expect(playerCities(s, 0).length).toBe(2);
    expect(playerCities(s, 0).filter((c) => 'palace' in c.buildings).length).toBe(1);
  });
});

describe('tile yields', () => {
  it('city tile on grassland: irrigated, road, at least one shield', () => {
    const { s, c } = found(flatGame(), 0, 20, 20);
    // Grassland 2/0/0 + city irrigation 1 food + road 1 commerce + 1 shield minimum = 3/1/1,
    // and Despotism takes the third food away again.
    expect(cityReport(rules, s, c).tiles[0]).toMatchObject({ food: 2, shields: 1, commerce: 1 });
    s.players[0] = { ...s.players[0]!, government: 'monarchy' };
    invalidateCaches(s);
    expect(cityReport(rules, s, c).tiles[0]).toMatchObject({ food: 3, shields: 1, commerce: 1 });
  });

  it('Despotism takes one from any yield above 2; Monarchy does not', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    const t = at(s, 21, 21);
    s.map.resource[t] = rules.resourceIndex('wheat');
    invalidateCaches(s);
    s.map.improvements[t] = IMP_IRRIGATION;
    invalidateCaches(s);
    s = work(s, c, [t]);
    c = s.cities[c.id]!;
    // Grassland 2 + wheat 2 + irrigation 1 = 5 food, minus 1 under Despotism.
    expect(cityReport(rules, s, c).tiles[1]!.food).toBe(4);
    s.players[0] = { ...s.players[0]!, government: 'monarchy' };
    invalidateCaches(s);
    expect(cityReport(rules, s, c).tiles[1]!.food).toBe(5);
  });

  it('Republic adds one commerce where a tile already has some', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    const t = at(s, 21, 21);
    s.map.improvements[t] = IMP_ROAD;
    invalidateCaches(s);
    s = work(s, c, [t]);
    c = s.cities[c.id]!;
    s.players[0] = { ...s.players[0]!, government: 'republic' };
    invalidateCaches(s);
    // Road 1 + Republic 1.
    expect(cityReport(rules, s, c).tiles[1]!.commerce).toBe(2);
  });
});

describe('growth', () => {
  it('uses a food box of 10 × (size + 1) and grows when it fills', () => {
    expect([1, 2, 6, 7].map((n) => foodBox(rules, n))).toEqual([20, 30, 70, 80]);
    let { s, c } = found(flatGame(), 0, 20, 20);
    // City tile 2 food (Despotism) + a grassland tile 2 food − 2 eaten = +2 a turn: 10 turns.
    expect(cityReport(rules, s, c).foodSurplus).toBe(2);
    expect(cityReport(rules, s, c).growth).toBe(10);
    for (let i = 0; i < 9; i++) s = endTurnAll(s);
    expect(s.cities[c.id]!.size).toBe(1);
    expect(s.cities[c.id]!.food).toBe(18);
    s = endTurnAll(s);
    c = s.cities[c.id]!;
    expect(c.size).toBe(2);
    expect(c.food).toBe(0);
  });

  it('keeps half the new box with a granary', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.cities[c.id] = { ...c, food: 19, buildings: { ...c.buildings, granary: 1 } };
    invalidateCaches(s);
    s = endTurnAll(s);
    c = s.cities[c.id]!;
    expect(c.size).toBe(2);
    // Half of the size-2 box (30).
    expect(c.food).toBe(15);
  });

  it('stops at size 6 without an aqueduct or fresh water', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    // Chieftain (4 born content) plus a temple and a colosseum keep six citizens at work:
    // 2 food from the city tile + 6 × 2 − 12 eaten = +2.
    s.difficulty = 'chieftain';
    s.cities[c.id] = { ...c, size: 6, food: 69, culture: 20, buildings: { ...c.buildings, temple: 1, colosseum: 1 } };
    invalidateCaches(s);
    s = run(s, { type: 'autoCitizens', player: 0, city: c.id });
    s = endTurnAll(s);
    expect(s.cities[c.id]!.size).toBe(6);
    expect(s.cities[c.id]!.food).toBe(70);
  });
});

describe('corruption and waste', () => {
  // Tiny map: 60 × 60, so the distance scale is (60 + 60) / 4 = 30 tiles; the optimal
  // number of cities at Regent is 14 × 90 % = 12.
  function twoCities(connected: boolean) {
    let { s, c: capital } = found(flatGame(), 0, 20, 20);
    // Six tiles east: x + 12.
    let other: City;
    ({ s, c: other } = found(s, 0, 32, 20));
    if (connected) for (let x = 20; x <= 32; x += 2) s.map.improvements[at(s, x, 20)]! |= IMP_ROAD;
    invalidateCaches(s);
    return { s, capital, other };
  }

  it('is zero in the capital', () => {
    const { s, capital } = twoCities(true);
    expect(corruptionRate(rules, s, capital).value).toBe(0);
  });

  it('grows with distance and rank under Despotism (rampant, 90 %)', () => {
    const { s, other } = twoCities(true);
    // distance 6 → 50 × 6 / 30 = 10 → 9 after 90 %; rank 1 → 50 × 1 / 12 = 4 → 3. Total 12 %.
    const rate = corruptionRate(rules, s, other);
    expect(rate.value).toBe(12);
  });

  it('counts an unconnected city as far away', () => {
    const { s, other } = twoCities(false);
    // Distance part at its maximum: 50 → 45, plus rank 3: 48 %.
    expect(corruptionRate(rules, s, other).value).toBe(48);
  });

  it('is halved by a courthouse', () => {
    const { s, other } = twoCities(false);
    s.cities[other.id] = { ...other, buildings: { courthouse: 1 } };
    invalidateCaches(s);
    expect(corruptionRate(rules, s, s.cities[other.id]!).value).toBe(24);
  });

  it('is flat 30 % under Communism', () => {
    const { s, other } = twoCities(false);
    s.players[0] = { ...s.players[0]!, government: 'communism' };
    invalidateCaches(s);
    expect(corruptionRate(rules, s, other).value).toBe(30);
  });
});

describe('happiness', () => {
  it('Regent: two citizens are born content, the rest unhappy; more unhappy than happy is disorder', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.cities[c.id] = { ...c, size: 4, culture: 20 };
    invalidateCaches(s);
    s = endTurnAll(s); // borders reach ring 2
    c = s.cities[c.id]!;
    s = work(s, c, [at(s, 21, 21), at(s, 19, 21), at(s, 21, 19), at(s, 19, 19)]);
    c = s.cities[c.id]!;
    s.players[0] = { ...s.players[0]!, rates: { tax: 4, science: 6, luxury: 0 } };
    invalidateCaches(s);
    let r = cityReport(rules, s, c);
    expect([r.happy, r.content, r.unhappy, r.disorder]).toEqual([0, 2, 2, true]);
    // A temple makes one unhappy citizen content: 0 / 3 / 1, still disorder.
    s.cities[c.id] = { ...c, buildings: { ...c.buildings, temple: 1 } };
    invalidateCaches(s);
    r = cityReport(rules, s, s.cities[c.id]!);
    expect([r.happy, r.content, r.unhappy, r.disorder]).toEqual([0, 3, 1, true]);
    // One entertainer: 3 laborers (2 content, 1 unhappy) → temple → 3 content; 1 luxury → 1 happy.
    s = work(s, s.cities[c.id]!, [at(s, 21, 21), at(s, 19, 21), at(s, 21, 19)], { entertainer: 1 });
    r = cityReport(rules, s, s.cities[c.id]!);
    expect([r.happy, r.content, r.unhappy, r.disorder]).toEqual([1, 2, 0, false]);
  });

  it('disorder stops production and income', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.cities[c.id] = { ...c, size: 4, culture: 20 };
    invalidateCaches(s);
    s = endTurnAll(s);
    c = s.cities[c.id]!;
    s = work(s, c, [at(s, 21, 21), at(s, 19, 21), at(s, 21, 19), at(s, 19, 19)]);
    const r = cityReport(rules, s, s.cities[c.id]!);
    expect(r.disorder).toBe(true);
    expect(r.shields.value).toBe(0);
    expect(r.tax.value).toBe(0);
    expect(r.science.value).toBe(0);
  });

  it('cities that place their own citizens avoid disorder with entertainers', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.cities[c.id] = { ...c, size: 4, culture: 20 };
    invalidateCaches(s);
    s = endTurnAll(s);
    s = run(s, { type: 'autoCitizens', player: 0, city: c.id });
    const r = cityReport(rules, s, s.cities[c.id]!);
    expect(r.disorder).toBe(false);
    expect(s.cities[c.id]!.specialists.entertainer).toBeGreaterThan(0);
  });
});

describe('production', () => {
  it('builds a warrior in ten shields and repeats it', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.cities[c.id] = { ...c, shields: 9 };
    invalidateCaches(s);
    s = endTurnAll(s);
    const warriors = Object.values(s.units).filter((u) => u.type === 'warrior');
    expect(warriors.length).toBe(1);
    expect(s.cities[c.id]!.build).toEqual({ kind: 'unit', id: 'warrior' });
  });

  it('loses half the shields when switching between units and buildings', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.players[0] = { ...s.players[0]!, techs: ['ceremonialBurial'] };
    invalidateCaches(s);
    s.cities[c.id] = { ...c, shields: 9, shieldsFor: 'unit' };
    invalidateCaches(s);
    s = run(s, { type: 'setBuild', player: 0, city: c.id, build: { kind: 'building', id: 'temple' } });
    expect(s.cities[c.id]!.shields).toBe(4);
  });

  it('waits for size before giving up settlers', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s = run(s, { type: 'setBuild', player: 0, city: c.id, build: { kind: 'unit', id: 'settler' } });
    s.cities[c.id] = { ...s.cities[c.id]!, shields: 29, size: 2 };
    invalidateCaches(s);
    s = endTurnAll(s);
    expect(Object.values(s.units).some((u) => u.type === 'settler')).toBe(false);
    s.cities[c.id] = { ...s.cities[c.id]!, size: 3 };
    invalidateCaches(s);
    s = run(s, { type: 'autoCitizens', player: 0, city: c.id });
    s = endTurnAll(s);
    c = s.cities[c.id]!;
    expect(Object.values(s.units).some((u) => u.type === 'settler')).toBe(true);
    expect(c.size).toBe(1);
  });

  it('quotes hurry costs: gold under Monarchy, citizens under Despotism', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.players[0] = { ...s.players[0]!, techs: ['ceremonialBurial'], gold: 500 };
    invalidateCaches(s);
    s = run(s, { type: 'setBuild', player: 0, city: c.id, build: { kind: 'building', id: 'temple' } });
    c = s.cities[c.id]!;
    // Temple 60 shields, none yet. Forced labour: 60 / 20 = 3 citizens, but the city has 1.
    expect(hurryQuote(rules, s, c)).toMatchObject({ kind: 'none' });
    s.players[0] = { ...s.players[0]!, government: 'monarchy' };
    invalidateCaches(s);
    // Buildings: 2 gold a shield, doubled with an empty box: 60 × 2 × 2.
    expect(hurryQuote(rules, s, c)).toMatchObject({ kind: 'gold', gold: 240 });
    s.cities[c.id] = { ...c, shields: 10 };
    invalidateCaches(s);
    expect(hurryQuote(rules, s, s.cities[c.id]!)).toMatchObject({ kind: 'gold', gold: 100 });
    s = run(s, { type: 'hurry', player: 0, city: c.id });
    expect(s.players[0]!.gold).toBe(400);
    s = endTurnAll(s);
    expect('temple' in s.cities[c.id]!.buildings).toBe(true);
  });

  it('charges gold for military units beyond the free ones', () => {
    let { s } = found(flatGame(), 0, 20, 20);
    // Despotism: 4 free units per town.
    for (let i = 0; i < 6; i++) place(s, 0, 'warrior', at(s, 20, 20));
    expect(unitSupportCost(rules, s, 0)).toBe(2);
    s.players[0] = { ...s.players[0]!, government: 'republic' };
    invalidateCaches(s);
    // Republic: 1 free per town, 2 gold per unit beyond.
    expect(unitSupportCost(rules, s, 0)).toBe(10);
    s = endTurnAll(s);
  });
});

describe('science and eras', () => {
  it('costs cost factor × difficulty × world size', () => {
    const s = flatGame();
    // Bronze Working 3 × Regent 10 × Tiny 160 / 100 = 48.
    expect(techCost(rules, s, 'bronzeWorking')).toBe(48);
  });

  it('needs at least four turns per advance and loses the extra beakers', () => {
    let { s } = found(flatGame(), 0, 20, 20);
    s = run(s, { type: 'setResearch', player: 0, tech: 'bronzeWorking' });
    s.players[0] = { ...s.players[0]!, research: { tech: 'bronzeWorking', beakers: 1000, turns: 0 } };
    invalidateCaches(s);
    for (let i = 0; i < 3; i++) s = endTurnAll(s);
    expect(s.players[0]!.techs).not.toContain('bronzeWorking');
    s = endTurnAll(s);
    expect(s.players[0]!.techs).toContain('bronzeWorking');
    expect(s.players[0]!.research).toEqual({ tech: null, beakers: 0, turns: 0 });
  });

  it('opens a new era only after the required techs of the last one', () => {
    let s = flatGame();
    expect(() => run(s, { type: 'setResearch', player: 0, tech: 'monotheism' })).toThrow(/Middle Ages/);
    const required = rules.set.techs.filter((t) => t.era === 'ancient' && !t.flags.includes('notRequiredForEraAdvance')).map((t) => t.id);
    s.players[0] = { ...s.players[0]!, techs: required, era: 1 };
    invalidateCaches(s);
    s = run(s, { type: 'setResearch', player: 0, tech: 'monotheism' });
    expect(s.players[0]!.research.tech).toBe('monotheism');
  });
});

describe('governments', () => {
  it('goes through anarchy before the new government', () => {
    let { s } = found(flatGame(), 0, 20, 20);
    s.players[0] = { ...s.players[0]!, techs: ['monarchy'] };
    invalidateCaches(s);
    s = run(s, { type: 'revolution', player: 0, government: 'monarchy' });
    expect(s.players[0]!.government).toBe('anarchy');
    const ends = s.players[0]!.revolution!.endsOnTurn;
    expect(ends - s.turn).toBeGreaterThanOrEqual(2);
    expect(ends - s.turn).toBeLessThanOrEqual(5);
    while (s.turn < ends) {
      expect(s.players[0]!.government).toBe('anarchy');
      s = endTurnAll(s);
    }
    expect(s.players[0]!.government).toBe('monarchy');
  });

  it('collects no science during anarchy', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.players[0] = { ...s.players[0]!, government: 'anarchy' };
    invalidateCaches(s);
    expect(cityReport(rules, s, c).science.value).toBe(0);
  });
});

describe('culture and borders', () => {
  it('a temple (2 a turn) pushes the border to ring 2 at 10 points', () => {
    let { s, c } = found(flatGame(), 0, 20, 20);
    s.cities[c.id] = { ...c, buildings: { ...c.buildings, temple: 1 } };
    invalidateCaches(s);
    // Palace 1 + temple 2 = 3 a turn: 10 after 4 turns.
    for (let i = 0; i < 3; i++) s = endTurnAll(s);
    expect(s.cities[c.id]!.culture).toBe(9);
    expect(s.map.territory.filter((p) => p === 0).length).toBe(9);
    s = endTurnAll(s);
    expect(s.cities[c.id]!.culture).toBe(12);
    // Ring 2 = the 21-tile work area.
    expect(s.map.territory.filter((p) => p === 0).length).toBe(21);
  });
});

describe('calendar', () => {
  it('starts in 4000 BC at 50 years a turn and skips year 0', () => {
    expect(formatYear(yearOf(rules, 1))).toBe('4000 BC');
    expect(formatYear(yearOf(rules, 26))).toBe('2750 BC');
    // 25 × 50 + 25 × 40 + 40 × 25 = 3250 years → 750 BC at turn 91; then 20 a turn.
    expect(formatYear(yearOf(rules, 91))).toBe('750 BC');
    expect(formatYear(yearOf(rules, 128))).toBe('10 BC');
    expect(formatYear(yearOf(rules, 129))).toBe('AD 11');
  });
});
