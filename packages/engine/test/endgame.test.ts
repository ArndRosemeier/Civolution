/**
 * Test vectors for Phase 6: resistance and culture flips (docs/rules/culture.md),
 * pollution and global warming (pollution.md), the spaceship (spaceship.md) and victory
 * conditions and game modes (victory.md).
 */
import { describe, expect, it } from 'vitest';
import {
  apply,
  cityReport,
  culturalWinner,
  dominationShares,
  flipOdds,
  FLIGHT_TURNS,
  IMP_POLLUTION,
  invalidateCaches,
  launchBlocker,
  loadGame,
  pollutionPoints,
  saveGame,
  spaceshipParts,
  unVote,
  warmingThreshold,
  type City,
  type GameState,
} from '../src/index.ts';
import { at, endTurnAll, flatGame, place, rules, run } from './helpers.ts';

function found(s: GameState, owner: number, x: number, y: number): { s: GameState; c: City } {
  const u = place(s, owner, 'settler', at(s, x, y));
  s = run(s, { type: 'foundCity', player: owner, unit: u.id });
  const c = Object.values(s.cities).find((k) => k.tile === at(s, x, y))!;
  return { s, c };
}

function patch(s: GameState, c: City, p: Partial<City>): void {
  s.cities[c.id] = { ...s.cities[c.id]!, ...p };
  invalidateCaches(s);
}

describe('resistance', () => {
  it('stops a resisting city and lets a garrison quell it', () => {
    let s = flatGame(1, 2);
    const a = found(s, 0, 10, 10);
    const b = found(a.s, 1, 20, 20);
    s = b.s;
    patch(s, b.c, { size: 2, resisters: 2, nationality: 0 });
    const r = cityReport(rules, s, s.cities[b.c.id]!);
    expect(r.resisters).toBe(2);
    expect(r.shields.value).toBe(0);
    expect(r.shields.parts.at(-1)!.label).toBe('2 resisting');
    // Six defenders quell three resisters a turn, more than there are.
    for (let i = 0; i < 6; i++) place(s, 1, 'warrior', b.c.tile, { fortified: true });
    s = endTurnAll(s);
    expect(s.cities[b.c.id]!.resisters).toBe(0);
  });

  it('starts when a foreign city is captured, never when a city of your own people is retaken', () => {
    for (let seed = 1; seed <= 5; seed++) {
      let s = flatGame(seed, 2);
      s.players[0]!.atWarWith = [1];
      s.players[1]!.atWarWith = [0];
      const b = found(s, 1, 20, 20);
      s = b.s;
      patch(s, b.c, { size: 6 });
      s.players[1]!.culture = 1000;
      const w = place(s, 0, 'warrior', at(s, 21, 21));
      s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: b.c.tile });
      const c = s.cities[b.c.id]!;
      expect(c.owner).toBe(0);
      expect(c.nationality).toBe(1);
      expect(c.resisters).toBeGreaterThanOrEqual(0);
      expect(c.resisters).toBeLessThanOrEqual(c.size);
    }
    let s = flatGame(1, 2);
    s.players[0]!.atWarWith = [1];
    s.players[1]!.atWarWith = [0];
    const b = found(s, 1, 20, 20);
    s = b.s;
    patch(s, b.c, { size: 6, nationality: 0 });
    const w = place(s, 0, 'warrior', at(s, 21, 21));
    s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: b.c.tile });
    expect(s.cities[b.c.id]!.resisters).toBe(0);
  });
});

describe('culture flips', () => {
  function setup(): { s: GameState; small: City; big: City } {
    let s = flatGame(1, 2);
    const cap = found(s, 0, 4, 4);
    const small = found(cap.s, 0, 20, 20);
    const big = found(small.s, 1, 24, 20);
    s = big.s;
    patch(s, big.c, { culture: 5000, size: 12 });
    s.players[1]!.culture = 5000;
    s.players[0]!.culture = 100;
    return { s, small: small.c, big: big.c };
  }

  it('need a neighbour with twice the home culture; capitals never flip', () => {
    const { s, small, big } = setup();
    const odds = flipOdds(rules, s, s.cities[small.id]!, false);
    expect(odds.toward).toBe(1);
    expect(odds.chance).toBeGreaterThan(0);
    expect(odds.chance).toBeLessThanOrEqual(20);
    expect(flipOdds(rules, s, s.cities[big.id]!, false).chance).toBe(0);
    const off = { ...s, options: { ...s.options, cultureFlips: false } };
    expect(flipOdds(rules, off, off.cities[small.id]!, false).chance).toBe(0);
    // A garrison lowers the chance by two points a unit.
    for (let i = 0; i < 3; i++) place(s, 0, 'warrior', small.tile);
    invalidateCaches(s);
    expect(flipOdds(rules, s, s.cities[small.id]!, false).reasons).toContain('3 military units (−6)');
  });

  it('hand the city over and lose its garrison', () => {
    let { s, small } = setup();
    place(s, 0, 'warrior', small.tile);
    let flipped = false;
    for (let i = 0; i < 80 && !flipped; i++) {
      s = endTurnAll(s);
      flipped = s.cities[small.id]?.owner === 1;
    }
    expect(flipped).toBe(true);
    expect(Object.values(s.units).filter((u) => u.tile === small.tile && u.owner === 0)).toHaveLength(0);
  });
});

describe('pollution', () => {
  it('counts industry by its buildings and big cities after Industrialization', () => {
    let s = flatGame(1, 2);
    const f = found(s, 0, 20, 20);
    s = f.s;
    patch(s, f.c, { buildings: { ...s.cities[f.c.id]!.buildings, factory: 1 } });
    const city = s.cities[f.c.id]!;
    // Factory pollution 2 × 40 shields / 40 = 2 points.
    expect(pollutionPoints(rules, s, city, new Set(Object.keys(city.buildings)), 40).value).toBe(2);
    // A Recycling Center leaves a third.
    expect(pollutionPoints(rules, s, city, new Set([...Object.keys(city.buildings), 'recyclingCenter']), 120).value).toBe(2);
    s.players[0]!.techs.push('industrialization');
    const big = { ...city, buildings: {}, size: 17 };
    // Five citizens over 12: three points; mass transit removes them.
    expect(pollutionPoints(rules, s, big, new Set(), 10).value).toBe(3);
    expect(pollutionPoints(rules, s, big, new Set(['massTransitSystem']), 10).value).toBe(0);
  });

  it('warms the climate when polluted tiles pile up', () => {
    let s = flatGame(1, 2);
    const threshold = warmingThreshold(s);
    const imp = [...s.map.improvements];
    for (let t = 0; t < threshold; t++) imp[t * 3] = IMP_POLLUTION;
    s.map = { ...s.map, improvements: imp };
    const grass = s.map.terrain.filter((t) => rules.terrains[t]!.id === 'grassland').length;
    const r = apply(rules, s, { type: 'endTurn', player: 0 });
    s = run(r.state, { type: 'endTurn', player: 1 });
    expect(s.climate.strikes).toBe(1);
    expect(s.map.terrain.filter((t) => rules.terrains[t]!.id === 'grassland').length).toBeLessThan(grass);
  });
});

describe('spaceship', () => {
  function readyShip(): { s: GameState; c: City } {
    let s = flatGame(1, 2);
    const f = found(s, 0, 20, 20);
    s = f.s;
    const ship = s.players[0]!.spaceship;
    for (const p of spaceshipParts(rules)) ship.parts[p.id] = p.needed;
    return { s, c: f.c };
  }

  it('launches from the capital and wins when it arrives', () => {
    let { s } = readyShip();
    expect(launchBlocker(rules, s, 1)).toMatch(/not finished/);
    s = run(s, { type: 'launchSpaceship', player: 0 });
    expect(s.players[0]!.spaceship.arrives).toBe(s.turn + FLIGHT_TURNS);
    for (let i = 0; i < FLIGHT_TURNS; i++) s = endTurnAll(s);
    expect(s.victory).toBeNull();
    // It lands at the end of its arrival turn.
    s = endTurnAll(s);
    expect(s.victory?.kind).toBe('space');
    expect(s.victory?.winner).toBe(0);
  });

  it('is lost with the capital', () => {
    let { s, c } = readyShip();
    s = run(s, { type: 'launchSpaceship', player: 0 });
    s.players[0]!.atWarWith = [1];
    s.players[1]!.atWarWith = [0];
    patch(s, c, { size: 5 });
    const w = place(s, 1, 'warrior', at(s, 21, 21));
    const r = apply(rules, s, { type: 'moveUnit', player: 1, unit: w.id, to: c.tile });
    expect(r.events.map((e) => e.type)).toContain('spaceshipLost');
    expect(r.state.players[0]!.spaceship.launched).toBeNull();
  });
});

describe('victory', () => {
  it('measures domination by land and people', () => {
    let s = flatGame(1, 2);
    const f = found(s, 0, 20, 20);
    s = f.s;
    const shares = dominationShares(rules, s, 0);
    expect(shares.population).toBe(100);
    expect(shares.land).toBeLessThan(5);
  });

  it('wins culturally with 20000 points in one city', () => {
    let s = flatGame(1, 2);
    const f = found(s, 0, 20, 20);
    s = f.s;
    patch(s, f.c, { culture: 20000 });
    expect(culturalWinner(rules, s)?.player).toBe(0);
    s = endTurnAll(s);
    expect(s.victory).toMatchObject({ kind: 'cultural', winner: 0 });
  });

  it('elects a UN leader with a majority of the world’s citizens', () => {
    let s = flatGame(1, 3);
    const a = found(s, 0, 10, 10);
    const b = found(a.s, 1, 20, 20);
    const c = found(b.s, 2, 30, 30);
    s = c.s;
    patch(s, a.c, { size: 10, buildings: { ...s.cities[a.c.id]!.buildings, unitedNations: 1 } });
    s.wonders = { unitedNations: a.c.id };
    patch(s, b.c, { size: 4 });
    patch(s, c.c, { size: 3 });
    const vote = unVote(rules, s);
    // 10 votes for player 0 of 17; the others vote for whom they like better.
    expect(vote.total).toBe(17);
    expect(vote.votes[0]).toBeGreaterThanOrEqual(10);
    expect(vote.winner).toBe(0);
    s = endTurnAll(s);
    expect(s.victory).toMatchObject({ kind: 'diplomatic', winner: 0 });
  });

  it('ends at the last turn with the highest score', () => {
    let s = flatGame(1, 2);
    const a = found(s, 0, 10, 10);
    const b = found(a.s, 1, 20, 20);
    s = b.s;
    patch(s, a.c, { size: 8 });
    s.turn = rules.set.general.lastTurn;
    s = endTurnAll(s);
    expect(s.victory).toMatchObject({ kind: 'score', winner: 0 });
    expect(s.players[0]!.scores.length).toBe(1);
  });

  it('is won by conquest when one civilization is left', () => {
    let s = flatGame(1, 2);
    s.players[0]!.atWarWith = [1];
    s.players[1]!.atWarWith = [0];
    const a = found(s, 0, 10, 10);
    const b = found(a.s, 1, 20, 20);
    s = b.s;
    const w = place(s, 0, 'warrior', at(s, 21, 21));
    s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: b.c.tile });
    expect(s.players[1]!.alive).toBe(false);
    s = endTurnAll(s);
    expect(s.victory).toMatchObject({ kind: 'conquest', winner: 0 });
  });
});

describe('game modes', () => {
  it('regicide: a civilization whose king dies is out, and its cities surrender', () => {
    let s = flatGame(1, 2, { civs: ['romans', 'greeks'], options: { mode: 'regicide' } });
    const a = found(s, 0, 10, 10);
    const b = found(a.s, 1, 30, 30);
    s = b.s;
    s.players[0]!.atWarWith = [1];
    s.players[1]!.atWarWith = [0];
    place(s, 1, 'alexander', at(s, 20, 20));
    const tank = place(s, 0, 'modernArmor', at(s, 21, 21));
    s = run(s, { type: 'moveUnit', player: 0, unit: tank.id, to: at(s, 20, 20) });
    expect(s.players[1]!.alive).toBe(false);
    expect(s.cities[b.c.id]!.owner).toBe(0);
  });

  it('elimination: losing any city ends a civilization', () => {
    let s = flatGame(1, 2, { options: { mode: 'elimination' } });
    const a = found(s, 1, 10, 10);
    const b = found(a.s, 1, 20, 20);
    s = b.s;
    s.players[0]!.atWarWith = [1];
    s.players[1]!.atWarWith = [0];
    patch(s, b.c, { size: 3 });
    const w = place(s, 0, 'warrior', at(s, 21, 21));
    s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: b.c.tile });
    expect(s.players[1]!.alive).toBe(false);
    expect(s.cities[a.c.id]!.owner).toBe(0);
  });

  it('victory points: wonders, kills, first advances and conquests score', () => {
    let s = flatGame(1, 2, { options: { mode: 'victoryPoints' } });
    s.players[0]!.atWarWith = [1];
    s.players[1]!.atWarWith = [0];
    const tank = place(s, 0, 'modernArmor', at(s, 21, 21));
    place(s, 1, 'warrior', at(s, 20, 20));
    s = run(s, { type: 'moveUnit', player: 0, unit: tank.id, to: at(s, 20, 20) });
    expect(s.players[0]!.victoryPoints).toBe(rules.set.general.victory.defeatUnitPoints);
  });
});

describe('saves', () => {
  it('loads alpha 0.003 saves (format 5) with Phase 6 defaults', () => {
    const s = flatGame();
    const old = JSON.parse(saveGame(s)) as { header: { version: number }; state: Record<string, unknown> & { version: number; players: Record<string, unknown>[] } };
    old.header.version = 5;
    old.state.version = 5;
    const { options: _o, victory: _v, climate: _c, un: _u, ...rest } = old.state;
    old.state = { ...rest, version: 5, players: old.state.players.map(({ goldenAge: _g, hadGoldenAge: _h, leadersBorn: _l, spaceship: _s, victoryPoints: _p, scores: _x, ...p }) => p) };
    const loaded = loadGame(rules, JSON.stringify(old));
    expect(loaded.version).toBe(6);
    expect(loaded.options.mode).toBe('standard');
    expect(loaded.players[0]!.spaceship).toEqual({ parts: {}, launched: null, arrives: null });
  });
});
