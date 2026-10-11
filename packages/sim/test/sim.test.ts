import { describe, expect, it } from 'vitest';
import { indexRules, stateHash } from '@civolution/engine';
import { conquests } from '@civolution/rules';
import { defaultPlayers, explorer, idle, replay, runGame } from '../src/index.ts';

const rules = indexRules(conquests);
const withScouts = [...rules.set.general.startUnits, rules.set.general.scoutUnit];

describe('headless games', () => {
  it('plays a Small map with explorers: invariants clean, land explored, roads built, replayable', () => {
    const game = { seed: 3, map: { worldSize: 'small' }, players: defaultPlayers(4), startUnits: withScouts };
    const { state, log, report } = runGame({ rules, game, controllers: [explorer, explorer, explorer, idle], turns: 40 });
    expect(report.invariantFailures).toEqual([]);
    expect(report.players[0]!.exploredPercent).toBeGreaterThan(report.players[3]!.exploredPercent * 2);
    expect(report.roads).toBeGreaterThan(5);
    expect(stateHash(replay(rules, game, log))).toBe(stateHash(state));
  });

  it('keeps a golden hash for a fixed seed', () => {
    const game = { seed: 11, map: { worldSize: 'tiny' }, players: defaultPlayers(2), startUnits: withScouts };
    const { report } = runGame({ rules, game, controllers: [explorer, explorer], turns: 15 });
    // Changing this hash needs a stated reason in the commit (PLAN.md §11).
    expect(report.finalHash).toMatchInlineSnapshot(`"88bb666f553656f8"`);
  });

  it('explores a Huge map with 16 players and builds roads (Phase 1 exit criterion)', () => {
    const game = { seed: 1, map: { worldSize: 'huge' }, players: defaultPlayers(16), startUnits: withScouts };
    const { report } = runGame({ rules, game, controllers: Array.from({ length: 16 }, () => explorer), turns: 30 });
    expect(report.invariantFailures).toEqual([]);
    const explored = report.players.map((p) => p.exploredPercent);
    expect(Math.min(...explored)).toBeGreaterThan(0.5);
    expect(report.roads).toBeGreaterThan(16 * 3);
  }, 120_000);
});
