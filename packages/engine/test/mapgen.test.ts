import { describe, expect, it } from 'vitest';
import { checkInvariants, createGame, distance, FLAG_HUT, PLAYER_COLORS, stateHash } from '../src/index.ts';
import { rules } from './helpers.ts';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: PLAYER_COLORS[i % 16]!, human: i === 0 }));

describe('map generator', () => {
  it('is deterministic for a seed', () => {
    const a = createGame(rules, { seed: 42, map: { worldSize: 'small' }, players: players(4) });
    const b = createGame(rules, { seed: 42, map: { worldSize: 'small' }, players: players(4) });
    const c = createGame(rules, { seed: 43, map: { worldSize: 'small' }, players: players(4) });
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(a)).not.toBe(stateHash(c));
  });

  it.each(['archipelago', 'continents', 'pangaea'] as const)('builds a valid %s Standard map', (landForm) => {
    const s = createGame(rules, { seed: 5, map: { worldSize: 'standard', landForm }, players: players(8) });
    expect(checkInvariants(rules, s)).toEqual([]);
    const water = s.map.terrain.filter((t) => rules.terrains[t]!.water).length;
    const share = water / s.map.terrain.length;
    expect(share).toBeGreaterThan(0.66);
    expect(share).toBeLessThan(0.74);
    expect(s.map.rivers.some((r) => r !== 0)).toBe(true);
    expect(s.map.resource.some((r) => r >= 0)).toBe(true);
    expect(s.map.flags.some((f) => f & FLAG_HUT)).toBe(true);
    for (const st of s.map.starts) expect(rules.terrains[s.map.terrain[st]!]!.canFoundCity).toBe(true);
  });

  it('honours water coverage', () => {
    for (const waterPercent of [60, 80] as const) {
      const s = createGame(rules, { seed: 9, map: { worldSize: 'small', waterPercent }, players: players(4) });
      const water = s.map.terrain.filter((t) => rules.terrains[t]!.water).length / s.map.terrain.length;
      expect(Math.abs(water * 100 - waterPercent)).toBeLessThan(4);
    }
  });

  it('generates a Huge map with 16 spaced start positions', () => {
    const s = createGame(rules, { seed: 1, map: { worldSize: 'huge' }, players: players(16) });
    expect(s.map.terrain).toHaveLength(160 * 160 / 2);
    expect(s.map.starts).toHaveLength(16);
    let closest = Infinity;
    for (const a of s.map.starts) for (const b of s.map.starts) if (a !== b) closest = Math.min(closest, distance(s.map, a, b));
    expect(closest).toBeGreaterThanOrEqual(8);
    expect(checkInvariants(rules, s)).toEqual([]);
  });
});
