import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { indexRules, stateHash } from '@civolution/engine';
import { conquests } from '@civolution/rules';
import { ai, automated, builder, civsForSeed, defaultPlayers, explorer, idle, replay, runGame, runTournament } from '../src/index.ts';

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
    // Changing this hash needs a stated reason in the commit (PLAN.md §11). Phase 8: villages hold no barbarians for a civilization with fewer than two cities.
    expect(report.finalHash).toMatchInlineSnapshot(`"d8b667b7527c3fc0"`);
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

  it('plays a fully delegated civilization to the modern era (Phase 5)', () => {
    const game = { seed: 2, map: { worldSize: 'tiny', barbarians: 'none' as const }, players: defaultPlayers(1) };
    const modern = rules.eraIndex('modern');
    const { state, report } = runGame({ rules, game, controllers: [automated], turns: 540, until: (s) => s.players[0]!.era >= modern });
    expect(report.invariantFailures).toEqual([]);
    expect(state.players[0]!.era).toBe(modern);
    expect(report.players[0]!.cities).toBeGreaterThanOrEqual(10);
  }, 120_000);

  it('fights wars between four AI civilizations with barbarians about (Phase 3)', () => {
    const game = { seed: 1, map: { worldSize: 'small' }, players: defaultPlayers(4) };
    const { state, log, report } = runGame({ rules, game, controllers: [ai, ai, ai, ai], turns: 150 });
    expect(report.invariantFailures).toEqual([]);
    expect(report.war.battles).toBeGreaterThan(20);
    expect(report.war.citiesCaptured + report.war.citiesDestroyed).toBeGreaterThan(0);
    expect(report.war.barbarianCamps).toBeGreaterThan(0);
    expect(stateHash(replay(rules, game, log))).toBe(stateHash(state));
  }, 120_000);

  it('runs AI civilizations through diplomacy and war: contacts, treaties, deals, invariants clean (Phase 4)', () => {
    const game = { seed: 2, map: { worldSize: 'small' }, players: defaultPlayers(4) };
    const { state, log, report } = runGame({ rules, game, controllers: [ai, ai, ai, ai], turns: 200 });
    expect(report.invariantFailures).toEqual([]);
    expect(report.diplomacy.contacts).toBeGreaterThan(0);
    expect(report.diplomacy.wars).toBeGreaterThan(0);
    expect(report.diplomacy.deals).toBeGreaterThan(0);
    // The AI's commands are almost all accepted.
    expect(report.refused).toBeLessThan(report.commands / 20);
    expect(stateHash(replay(rules, game, log))).toBe(stateHash(state));
  }, 240_000);

  it('plays an AI-only game to turn 500 without stalls (Phase 4 exit criterion)', () => {
    const [g] = runTournament({ rules, size: 'tiny', players: 3, turns: 500, seeds: [3] });
    expect(g!.report.turns).toBe(500);
    expect(g!.report.invariantFailures).toEqual([]);
    expect(g!.report.players.filter((p) => p.controller === 'ai' && p.alive).length).toBeGreaterThan(0);
  }, 600_000);

  it('plays AI civilizations with their traits until the game is decided (Phase 6)', () => {
    const game = { seed: 4, map: { worldSize: 'tiny' }, players: defaultPlayers(3, civsForSeed(rules, 4, 3)) };
    const { state, log, report } = runGame({ rules, game, controllers: [ai, ai, ai], turns: rules.set.general.lastTurn, until: (s) => s.victory !== null });
    expect(report.invariantFailures).toEqual([]);
    expect(state.victory).not.toBeNull();
    expect(state.players.filter((p) => !p.barbarian).every((p) => p.civ !== null)).toBe(true);
    expect(stateHash(replay(rules, game, log))).toBe(stateHash(state));
  }, 240_000);

  it('plays a full game on a Standard map from start to finish (Phase 8 exit criterion)', async () => {
    // Eight AI civilizations, every rule on, invariants checked every turn, until the game is decided (by turn 540 at the latest).
    // The game runs in a worker thread so the test runner is not starved for a minute.
    const r = await new Promise<{ victory: unknown; turn: number; lastTurn: number; invariantFailures: unknown[]; refusals: Record<string, number>; commands: number }>((done, fail) => {
      const w = new Worker(new URL('./fullgame.worker.ts', import.meta.url), { execArgv: ['--import', 'tsx'] });
      w.once('message', (m) => {
        done(m);
        void w.terminate();
      });
      w.once('error', fail);
    });
    expect(r.invariantFailures).toEqual([]);
    expect(r.victory).not.toBeNull();
    expect(r.turn).toBeLessThanOrEqual(r.lastTurn + 1);
    // Gotos towards land the unit cannot reach are refused and cost nothing; anything else refused would point at an AI that misreads the rules.
    const misread = Object.entries(r.refusals).filter(([k]) => !k.startsWith('goto: No known route'));
    expect(misread.reduce((a, [, n]) => a + n, 0)).toBeLessThan(r.commands / 500);
  }, 600_000);

  it('beats a passive player at Monarch (Phase 4 exit criterion)', () => {
    const games = runTournament({ rules, size: 'tiny', players: 2, turns: 300, seeds: [1, 5], difficulty: 'monarch', passive: true });
    for (const g of games) {
      expect(g.report.invariantFailures).toEqual([]);
      expect(g.aiWon).toBe(true);
    }
  }, 240_000);
});
