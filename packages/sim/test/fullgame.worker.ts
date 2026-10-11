/**
 * The Phase 8 exit game, run in a worker thread so the test runner stays responsive
 * during a long synchronous game (sim.test.ts).
 */
import { parentPort } from 'node:worker_threads';
import { indexRules } from '@civolution/engine';
import { conquests } from '@civolution/rules';
import { ai, civsForSeed, defaultPlayers, runGame } from '../src/index.ts';

const rules = indexRules(conquests);
const game = { seed: 8, map: { worldSize: 'standard' }, players: defaultPlayers(8, civsForSeed(rules, 8, 8)), difficulty: 'monarch' };
const { state, report } = runGame({ rules, game, controllers: Array.from({ length: 8 }, () => ai), turns: rules.set.general.lastTurn + 1, until: (s) => s.victory !== null });
parentPort!.postMessage({ victory: state.victory, turn: state.turn, lastTurn: rules.set.general.lastTurn, invariantFailures: report.invariantFailures, refusals: report.refusals, commands: report.commands });
