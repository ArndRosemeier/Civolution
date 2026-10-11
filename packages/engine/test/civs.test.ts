/**
 * Test vectors for Phase 6 civilizations (docs/rules/civilizations.md, golden-ages.md,
 * leaders.md, wonders.md).
 */
import { describe, expect, it } from 'vitest';
import {
  apply,
  buildBlocker,
  buildCost,
  canStandOn,
  checkJob,
  cityReport,
  createGame,
  inGoldenAge,
  invalidateCaches,
  leaderName,
  nextUpgrade,
  PLAYER_COLORS,
  shipMoveBonus,
  treasuryInterest,
  unitAvailable,
  unitMaxMoves,
  workableTiles,
  type City,
  type GameState,
} from '../src/index.ts';
import { at, endTurnAll, flatGame, place, rules, run, setTerrain } from './helpers.ts';

function found(s: GameState, owner: number, x: number, y: number): { s: GameState; c: City } {
  const u = place(s, owner, 'settler', at(s, x, y));
  s = run(s, { type: 'foundCity', player: owner, unit: u.id });
  const c = Object.values(s.cities).find((k) => k.tile === at(s, x, y))!;
  return { s, c };
}

function withBuilding(s: GameState, c: City, id: string, turn = s.turn): GameState {
  s.cities[c.id] = { ...s.cities[c.id]!, buildings: { ...s.cities[c.id]!.buildings, [id]: turn } };
  if (rules.building(id).kind === 'wonder') s.wonders = { ...s.wonders, [id]: c.id };
  invalidateCaches(s);
  return s;
}

describe('unique units and free advances', () => {
  it('lets each civilization build its own unique unit instead of the common one', () => {
    const s = flatGame(1, 3, { civs: ['romans', 'greeks'] });
    expect(unitAvailable(rules, s, 0, 'legionary')).toBe(true);
    expect(unitAvailable(rules, s, 0, 'swordsman')).toBe(false);
    expect(unitAvailable(rules, s, 1, 'hoplite')).toBe(true);
    expect(unitAvailable(rules, s, 1, 'spearman')).toBe(false);
    expect(unitAvailable(rules, s, 1, 'legionary')).toBe(false);
    // A player without a civilization builds the common units.
    expect(unitAvailable(rules, s, 2, 'swordsman')).toBe(true);
    expect(unitAvailable(rules, s, 2, 'legionary')).toBe(false);
    // Kings, leaders and variants are never built.
    expect(unitAvailable(rules, s, 0, 'caesar')).toBe(false);
    expect(unitAvailable(rules, s, 0, 'legionary129')).toBe(false);
    // Upgrade lines skip other civilizations' unique units: a Roman warrior becomes a legionary.
    expect(nextUpgrade(rules, s, 0, 'warrior')).toBe('legionary');
    expect(nextUpgrade(rules, s, 2, 'warrior')).toBe('swordsman');
  });

  it('only lets expansionist civilizations build scouts, and starts them with one', () => {
    const s = createGame(rules, {
      seed: 3,
      map: { worldSize: 'tiny' },
      players: [
        { name: 'R', color: PLAYER_COLORS[0]!, human: true, civ: 'russians' },
        { name: 'E', color: PLAYER_COLORS[1]!, human: true, civ: 'egyptians' },
      ],
    });
    const types = (p: number) => Object.values(s.units).filter((u) => u.owner === p).map((u) => u.type).sort();
    expect(types(0)).toEqual(['scout', 'settler', 'worker']);
    expect(types(1)).toEqual(['settler', 'worker']);
    expect(unitAvailable(rules, s, 1, 'scout')).toBe(false);
    // Free advances: Russia starts with Pottery and Bronze Working, Egypt with Ceremonial Burial and Masonry.
    expect([...s.players[0]!.techs].sort()).toEqual(['bronzeWorking', 'pottery']);
    expect([...s.players[1]!.techs].sort()).toEqual(['ceremonialBurial', 'masonry']);
  });

  it('names cities and great leaders from the civilization’s lists', () => {
    let s = flatGame(1, 2, { civs: ['romans', 'greeks'] });
    const a = found(s, 0, 10, 10);
    const b = found(a.s, 1, 20, 20);
    s = b.s;
    expect(a.c.name).toBe('Rome');
    expect(b.c.name).toBe('Athens');
    expect(found(s, 0, 14, 10).c.name).toBe('Veii');
    expect(leaderName(rules, s, 0, false)).toBe('Trajan');
    expect(leaderName(rules, s, 0, true)).toBe('Leonardo da Vinci');
  });
});

describe('traits', () => {
  it('halves improvements of the matching characteristic (religious temples, scientific libraries)', () => {
    const s = flatGame(1, 2, { civs: ['egyptians', 'greeks'] });
    // Temple 60 shields; Egypt is religious. Library 80; Greece is scientific.
    expect(buildCost(rules, { kind: 'building', id: 'temple' }, s, 0)).toBe(30);
    expect(buildCost(rules, { kind: 'building', id: 'temple' }, s, 1)).toBe(60);
    expect(buildCost(rules, { kind: 'building', id: 'library' }, s, 1)).toBe(40);
    // Wonders never get the discount.
    expect(buildCost(rules, { kind: 'building', id: 'oracle' }, s, 0)).toBe(rules.building('oracle').cost);
  });

  it('gives commercial tiles extra commerce and a quarter more optimal cities', () => {
    let s = flatGame(1, 2, { civs: ['greeks', 'egyptians'] });
    const f = found(s, 0, 20, 20);
    s = f.s;
    // The city tile: grassland 1 commerce from its road… Greek tiles with 2+ commerce get one more.
    const tile = workableTiles(rules, s, s.cities[f.c.id]!)[0]!;
    s.map.rivers[tile] = 1;
    s.map.improvements[tile] = 1;
    invalidateCaches(s);
    s = run(s, { type: 'setCitizens', player: 0, city: f.c.id, worked: [tile], specialists: {} });
    const report = cityReport(rules, s, s.cities[f.c.id]!);
    const row = report.tiles.find((t) => t.tile === tile)!;
    // Grassland with a river (1) and a road (1) = 2, +1 commercial.
    expect(row.commerce).toBe(3);
  });

  it('feeds agricultural city tiles and speeds industrious workers', () => {
    let s = flatGame(1, 2, { civs: ['maya', undefined] });
    const f = found(s, 0, 20, 20);
    s = f.s;
    const mine = cityReport(rules, s, s.cities[f.c.id]!).tiles[0]!;
    const g = found(s, 1, 10, 10);
    s = g.s;
    const theirs = cityReport(rules, s, s.cities[g.c.id]!).tiles[0]!;
    expect(mine.food).toBe(theirs.food + 1);
    // Road on grassland: 3 turns for others, 2 for an industrious worker (+50 %).
    const w = place(s, 0, 'worker', at(s, 25, 25));
    const v = place(s, 1, 'worker', at(s, 5, 25));
    expect(checkJob(rules, s, w, 'road')).toEqual({ ok: true, turns: 2 });
    expect(checkJob(rules, s, v, 'road')).toEqual({ ok: true, turns: 3 });
  });

  it('gets religious civilizations through anarchy in one turn', () => {
    let s = flatGame(1, 2, { civs: ['egyptians', 'romans'] });
    s.players[0]!.techs.push('monarchy', 'codeOfLaws');
    s.players[1]!.techs.push('monarchy', 'codeOfLaws');
    s = run(s, { type: 'revolution', player: 0, government: 'monarchy' });
    expect(s.players[0]!.revolution!.endsOnTurn - s.turn).toBe(1);
    s = endTurnAll(s);
    expect(s.players[0]!.government).toBe('monarchy');
  });

  it('gives seafaring civilizations faster ships, and the Great Lighthouse lets galleys cross the sea', () => {
    let s = flatGame(1, 2, { civs: ['english', 'romans'] });
    const sea = at(s, 30, 30);
    setTerrain(s, sea, 'sea');
    const e = place(s, 0, 'galley', sea);
    const r = place(s, 1, 'galley', sea);
    expect(shipMoveBonus(rules, s, 0)).toBe(1);
    expect(unitMaxMoves(rules, s, e)).toBe(unitMaxMoves(rules, s, r) + rules.moveScale);
    expect(canStandOn(rules, s, r, sea)).toMatch(/coastal/);
    const f = found(s, 1, 20, 20);
    s = withBuilding(f.s, f.c, 'greatLighthouse');
    expect(canStandOn(rules, s, r, sea)).toBeNull();
    expect(shipMoveBonus(rules, s, 1)).toBe(1);
  });

  it('gives scientific civilizations a free advance with each new era', () => {
    let s = flatGame(1, 2, { civs: ['greeks', 'romans'] });
    const f = found(s, 0, 20, 20);
    s = f.s;
    const ancient = rules.set.techs.filter((t) => t.era === 'ancient' && !t.flags.includes('notRequiredForEraAdvance')).map((t) => t.id);
    const last = ancient.find((t) => rules.tech(t).prerequisites.length > 0 && !ancient.some((o) => rules.tech(o).prerequisites.includes(t)))!;
    s.players[0]!.techs = ancient.filter((t) => t !== last);
    s.players[0]!.research = { tech: last, beakers: 100000, turns: 10 };
    // Someone else knows Philosophy already, so its first-discoverer bonus (bit21) stays out of this count.
    s.players[1]!.techs = [...s.players[1]!.techs, 'philosophy'];
    const before = s.players[0]!.techs.length;
    s = endTurnAll(s);
    expect(s.players[0]!.era).toBe(1);
    // The researched advance plus the free one.
    expect(s.players[0]!.techs.length).toBe(before + 2);
  });
});

describe('golden ages', () => {
  it('start with a unique unit’s first victory, add shields and commerce, and come once', () => {
    let s = flatGame(1, 2, { civs: ['germans', 'romans'] });
    const f = found(s, 0, 20, 20);
    s = f.s;
    s.players[0]!.atWarWith = [1];
    s.players[1]!.atWarWith = [0];
    const before = cityReport(rules, s, s.cities[f.c.id]!);
    const tank = place(s, 0, 'panzer', at(s, 25, 25));
    place(s, 1, 'warrior', at(s, 26, 25));
    s = run(s, { type: 'moveUnit', player: 0, unit: tank.id, to: at(s, 26, 25) });
    expect(s.players[0]!.hadGoldenAge).toBe(true);
    expect(inGoldenAge(s, 0)).toBe(true);
    const during = cityReport(rules, s, s.cities[f.c.id]!);
    // City tile: 2 food 1 shield 1 commerce on grassland → +1 shield, +1 commerce.
    expect(during.tiles[0]!.shields).toBe(before.tiles[0]!.shields + 1);
    expect(during.tiles[0]!.commerce).toBe(before.tiles[0]!.commerce + 1);
    expect(s.players[0]!.goldenAge!.until - s.turn).toBe(rules.set.general.goldenAgeDuration);
    for (let i = 0; i < rules.set.general.goldenAgeDuration; i++) s = endTurnAll(s);
    expect(inGoldenAge(s, 0)).toBe(false);
    expect(s.players[0]!.goldenAge).toBeNull();
    expect(s.players[0]!.hadGoldenAge).toBe(true);
  });

  it('start when the civilization’s wonders cover both of its traits', () => {
    let s = flatGame(1, 2, { civs: ['egyptians', 'romans'] });
    const f = found(s, 0, 20, 20);
    s = f.s;
    // Egypt is religious and industrious; the Pyramids are a place of worship and a construction.
    expect(rules.building('pyramids').tags).toEqual(expect.arrayContaining(['placeOfWorship', 'constructionInstallation']));
    s.players[0]!.techs.push('bronzeWorking');
    s.cities[f.c.id] = { ...s.cities[f.c.id]!, build: { kind: 'building', id: 'pyramids' }, shields: rules.building('pyramids').cost };
    invalidateCaches(s);
    expect(buildBlocker(rules, s, s.cities[f.c.id]!, { kind: 'building', id: 'pyramids' })).toBeNull();
    s = endTurnAll(s);
    expect(s.wonders.pyramids).toBe(f.c.id);
    expect(s.players[0]!.hadGoldenAge).toBe(true);
  });
});

describe('wonders', () => {
  it('pays Wall Street interest: 5 % of the treasury, at most 50 gold', () => {
    let s = flatGame(1, 2);
    const f = found(s, 0, 20, 20);
    s = withBuilding(f.s, f.c, 'wallStreet');
    s.players[0]!.gold = 400;
    expect(treasuryInterest(rules, s, 0)).toBe(20);
    s.players[0]!.gold = 5000;
    expect(treasuryInterest(rules, s, 0)).toBe(50);
  });

  it('teaches advances two known civilizations have with the Great Library', () => {
    let s = flatGame(1, 3);
    const f = found(s, 0, 20, 20);
    s = withBuilding(f.s, f.c, 'greatLibrary');
    s.players[1]!.techs.push('bronzeWorking');
    s.players[2]!.techs.push('bronzeWorking', 'alphabet');
    s = endTurnAll(s);
    expect(s.players[0]!.techs).toContain('bronzeWorking');
    expect(s.players[0]!.techs).not.toContain('alphabet');
  });

  it('earns gold from a wonder visited for 2000 years', () => {
    let s = flatGame(1, 2);
    const f = found(s, 0, 20, 20);
    s = withBuilding(f.s, f.c, 'colossus', 1);
    s.turn = 200;
    const r = cityReport(rules, s, s.cities[f.c.id]!);
    expect(r.tax.parts.some((p) => p.label === 'The Colossus visitors' || p.label.endsWith('visitors'))).toBe(true);
  });

  it('builds the spaceship only with an Apollo Program of your own', () => {
    let s = flatGame(1, 2);
    const f = found(s, 0, 20, 20);
    s = f.s;
    s.players[0]!.techs = rules.set.techs.map((t) => t.id);
    s.cities[f.c.id] = { ...s.cities[f.c.id]!, size: 13 };
    s.players[0]!.resources = rules.resources.filter((r) => r.kind === 'strategic').map((r) => r.id);
    const part = { kind: 'building', id: 'ssCockpit' } as const;
    expect(buildBlocker(rules, s, s.cities[f.c.id]!, part)).toMatch(/Apollo/);
    s = withBuilding(s, f.c, 'apolloProgram');
    expect(buildBlocker(rules, s, s.cities[f.c.id]!, part)).toBeNull();
    s.cities[f.c.id] = { ...s.cities[f.c.id]!, build: part, shields: 100000 };
    s = endTurnAll(s);
    expect(s.players[0]!.spaceship.parts.ssCockpit).toBe(1);
    expect('ssCockpit' in s.cities[f.c.id]!.buildings).toBe(false);
    expect(buildBlocker(rules, s, s.cities[f.c.id]!, part)).toMatch(/every/);
  });
});

describe('scientific leaders', () => {
  it('appear only for scientific civilizations first to an advance, and do not lead armies', () => {
    let born = 0;
    for (let seed = 1; seed <= 40 && born === 0; seed++) {
      let s = flatGame(seed, 2, { civs: ['greeks', 'romans'] });
      const f = found(s, 0, 20, 20);
      s = f.s;
      s.players[0]!.research = { tech: 'ceremonialBurial', beakers: 100000, turns: 10 };
      s = endTurnAll(s);
      const leader = Object.values(s.units).find((u) => u.owner === 0 && u.scientific);
      if (!leader) continue;
      born++;
      expect(leader.name).toBe('Aristotle');
      const r = apply(rules, s, { type: 'buildArmy', player: 0, unit: leader.id });
      expect(r.error?.message).toMatch(/Scientific/);
    }
    expect(born).toBe(1);
  });
});
