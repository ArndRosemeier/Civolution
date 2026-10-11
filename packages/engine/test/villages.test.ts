/**
 * Test vectors for tribal villages (docs/rules/turns.md; owner's ruling 2026-10-11).
 */
import { describe, expect, it } from 'vitest';
import { apply, FLAG_HUT, HUT_ODDS, invalidateCaches, type GameState, type HutOutcome } from '../src/index.ts';
import { seedRng } from '../src/rng.ts';
import { at, flatGame, place, rules, run } from './helpers.ts';

/** A game where player 0 has two cities far from a village at (30, 20), on turn `turn`. */
function setup(civ: string | undefined, turn: number): GameState {
  let s = flatGame(1, 2, { civs: [civ, 'romans'] });
  for (const x of [8, 12]) {
    const u = place(s, 0, 'settler', at(s, x, 8));
    s = run(s, { type: 'foundCity', player: 0, unit: u.id });
  }
  s.turn = turn;
  return s;
}

/** Opens the village `n` times from the same position with different random streams. */
function outcomes(base: GameState, n: number): { outcome: HutOutcome; state: GameState }[] {
  const out: { outcome: HutOutcome; state: GameState }[] = [];
  for (let i = 0; i < n; i++) {
    const s = structuredClone(base);
    s.rng = seedRng(1000 + i);
    const hut = at(s, 30, 20);
    s.map.flags[hut] = FLAG_HUT;
    const w = place(s, 0, 'warrior', at(s, 29, 20));
    invalidateCaches(s);
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: w.id, to: hut });
    expect(r.error).toBeUndefined();
    const e = r.events.find((x) => x.type === 'hutEntered');
    if (e?.type !== 'hutEntered') throw new Error('no village');
    out.push({ outcome: e.outcome, state: r.state });
  }
  return out;
}

const share = (xs: { outcome: HutOutcome }[], kind: HutOutcome['kind']) => xs.filter((x) => x.outcome.kind === kind).length / xs.length;

describe('tribal villages', () => {
  it('keeps its odds in one table adding up to 100', () => {
    expect(Object.values(HUT_ODDS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(HUT_ODDS.barbarians).toBe(70);
  });

  it('hold barbarians about 70 % of the time once they are allowed', () => {
    const xs = outcomes(setup(undefined, 10), 200);
    expect(share(xs, 'barbarians')).toBeGreaterThan(0.6);
    expect(share(xs, 'barbarians')).toBeLessThan(0.8);
    expect(share(xs, 'gold')).toBeGreaterThan(0);
  });

  it('give a gift instead of barbarians early in the game, never nothing in their place', () => {
    const xs = outcomes(setup(undefined, 3), 200);
    expect(share(xs, 'barbarians')).toBe(0);
    // Only the table's own 1 % may be nothing.
    expect(share(xs, 'empty')).toBeLessThan(0.05);
    expect(share(xs, 'gold')).toBeGreaterThan(0.2);
  });

  it('never hold barbarians for an expansionist civilization', () => {
    const xs = outcomes(setup('russians', 10), 200);
    expect(share(xs, 'barbarians')).toBe(0);
    expect(share(xs, 'empty')).toBeLessThan(0.05);
  });

  it('can give Settlers or become one of the player’s cities', () => {
    const xs = outcomes(setup(undefined, 3), 300);
    const settlers = xs.find((x) => x.outcome.kind === 'unit' && x.outcome.unitType === 'settler');
    expect(settlers).toBeDefined();
    const city = xs.find((x) => x.outcome.kind === 'city');
    expect(city).toBeDefined();
    if (city?.outcome.kind !== 'city') throw new Error('no city');
    expect(city.state.cities[city.outcome.city]).toMatchObject({ owner: 0, tile: at(city.state, 30, 20) });
  });

  it('do not become a city where none may be founded', () => {
    const base = setup(undefined, 3);
    // Another civilization's city two tiles away: too close for a new one.
    const u = place(base, 1, 'settler', at(base, 32, 20));
    const s = run(base, { type: 'foundCity', player: 1, unit: u.id });
    s.turn = 3;
    const xs = outcomes(s, 200);
    expect(share(xs, 'city')).toBe(0);
  });
});
