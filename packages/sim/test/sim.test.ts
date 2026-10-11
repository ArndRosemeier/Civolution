import { describe, expect, it } from 'vitest';
import { indexRules, stateHash } from '@civolution/engine';
import { conquests } from '@civolution/rules';
import { builder, conqueror, defaultPlayers, explorer, idle, replay, runGame } from '../src/index.ts';

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
    expect(report.finalHash).toMatchInlineSnapshot(`"2bada2326d1521d5"`);
  });

  it('explores a Huge map with 16 players and builds roads (Phase 1 exit criterion)', () => {
    const game = { seed: 1, map: { worldSize: 'huge' }, players: defaultPlayers(16), startUnits: withScouts };
    const { report } = runGame({ rules, game, controllers: Array.from({ length: 16 }, () => explorer), turns: 30 });
    expect(report.invariantFailures).toEqual([]);
    const explored = report.players.map((p) => p.exploredPercent);
    expect(Math.min(...explored)).toBeGreaterThan(0.5);
    expect(report.roads).toBeGreaterThan(16 * 3);
  }, 120_000);

  it('plays a single civilization to the modern era (Phase 2 exit criterion)', () => {
    // The economy test runs without barbarians; the builder does not defend itself.
    const game = { seed: 2, map: { worldSize: 'tiny', barbarians: 'none' as const }, players: defaultPlayers(1) };
    const modern = rules.eraIndex('modern');
    const { state, report } = runGame({ rules, game, controllers: [builder], turns: 540, until: (s) => s.players[0]!.era >= modern });
    expect(report.invariantFailures).toEqual([]);
    expect(state.players[0]!.era).toBe(modern);
    expect(report.players[0]!.cities).toBeGreaterThanOrEqual(8);
    expect(report.turns).toBeLessThan(540);
  }, 120_000);

  it('fights wars between four conquerors with barbarians about (Phase 3)', () => {
    const game = { seed: 1, map: { worldSize: 'small' }, players: defaultPlayers(4) };
    const { state, log, report } = runGame({ rules, game, controllers: [conqueror, conqueror, conqueror, conqueror], turns: 150 });
    expect(report.invariantFailures).toEqual([]);
    expect(report.war.battles).toBeGreaterThan(20);
    expect(report.war.citiesCaptured + report.war.citiesDestroyed).toBeGreaterThan(0);
    expect(report.war.barbarianCamps).toBeGreaterThan(0);
    expect(stateHash(replay(rules, game, log))).toBe(stateHash(state));
  }, 120_000);
});
