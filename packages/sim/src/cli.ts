/**
 * `pnpm sim -- --size huge --turns 100 --seed 1 --players 16 --controller explorer`
 * Runs a headless game and prints the JSON report. Exits non-zero on invariant failures.
 */
import { parseArgs } from 'node:util';
import { indexRules } from '@civolution/engine';
import { conquests } from '@civolution/rules';
import { CONTROLLERS, defaultPlayers, runGame } from './runner.ts';

const { values } = parseArgs({
  options: {
    size: { type: 'string', default: 'standard' },
    turns: { type: 'string', default: '50' },
    seed: { type: 'string', default: '1' },
    players: { type: 'string' },
    controller: { type: 'string', default: 'explorer' },
    scouts: { type: 'boolean', default: true },
  },
});

const rules = indexRules(conquests);
const size = rules.set.worldSizes.find((w) => w.id === values.size);
if (!size) throw new Error(`unknown size ${values.size}; one of ${rules.set.worldSizes.map((w) => w.id).join(', ')}`);
const count = Number(values.players ?? size.defaultCivs);
const controller = CONTROLLERS[values.controller];
if (!controller) throw new Error(`unknown controller ${values.controller}`);
const { report } = runGame(
  {
    rules,
    game: {
      seed: Number(values.seed),
      map: { worldSize: size.id },
      players: defaultPlayers(count),
      ...(values.scouts ? { startUnits: [...rules.set.general.startUnits, rules.set.general.scoutUnit] } : {}),
    },
    controllers: Array.from({ length: count }, () => controller),
    turns: Number(values.turns),
  },
  // The CLI times the run for the report; the game itself never sees the clock.
  // eslint-disable-next-line no-restricted-properties
  () => performance.now(),
);
console.log(JSON.stringify(report, null, 2));
process.exit(report.invariantFailures.length > 0 ? 1 : 0);
