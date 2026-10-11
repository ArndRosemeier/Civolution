/**
 * AI tournaments (PLAN.md §9, §11): many headless games over seeds, AI against AI or AI
 * against a passive player, with a line per game and a summary. Exits non-zero on
 * invariant failures.
 *
 *   pnpm --filter @civolution/sim tournament -- --size small --players 4 --turns 500 --seeds 1-4
 *   pnpm --filter @civolution/sim tournament -- --passive --size tiny --players 2 --difficulty monarch --turns 300 --seeds 1-6
 */
import { parseArgs } from 'node:util';
import { indexRules, type Rules } from '@civolution/engine';
import { conquests } from '@civolution/rules';
import { ai, builder, defaultPlayers, runGame, type SimReport } from './runner.ts';

export interface TournamentGame {
  seed: number;
  report: SimReport;
  /** Passive games: whether the AI side won (the passive player destroyed, or out-scored three to one). */
  aiWon?: boolean;
}

export interface TournamentOptions {
  rules: Rules;
  size: string;
  players: number;
  turns: number;
  seeds: number[];
  difficulty?: string;
  /** Player 0 is a passive builder (marked human, so it gets no AI handicaps). */
  passive?: boolean;
  clock?: () => number;
  onGame?: (g: TournamentGame) => void;
}

/** Plays every seed and reports each game. */
export function runTournament(o: TournamentOptions): TournamentGame[] {
  const out: TournamentGame[] = [];
  for (const seed of o.seeds) {
    const players = defaultPlayers(o.players).map((p, i) => (o.passive && i === 0 ? { ...p, human: true } : p));
    const { report } = runGame(
      {
        rules: o.rules,
        game: { seed, map: { worldSize: o.size }, players, ...(o.difficulty ? { difficulty: o.difficulty } : {}) },
        controllers: players.map((_, i) => (o.passive && i === 0 ? builder : ai)),
        turns: o.turns,
        ...(o.passive ? { until: (s) => !s.players[0]!.alive } : {}),
      },
      o.clock,
    );
    const game: TournamentGame = { seed, report };
    if (o.passive) {
      const passive = report.players[0]!;
      const best = Math.max(...report.players.slice(1).filter((p) => p.controller === 'ai').map((p) => p.score));
      game.aiWon = !passive.alive || best >= passive.score * 3;
    }
    out.push(game);
    o.onGame?.(game);
  }
  return out;
}

function seedList(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map(Number) as [number, number | undefined];
    for (let s = a; s <= (b ?? a); s++) out.push(s);
  }
  return out;
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('src/tournament.ts');
if (isMain) {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      size: { type: 'string', default: 'small' },
      players: { type: 'string', default: '4' },
      turns: { type: 'string', default: '500' },
      seeds: { type: 'string', default: '1-4' },
      difficulty: { type: 'string' },
      passive: { type: 'boolean', default: false },
    },
  });
  const rules = indexRules(conquests);
  let failures = 0;
  const games = runTournament({
    rules,
    size: values.size,
    players: Number(values.players),
    turns: Number(values.turns),
    seeds: seedList(values.seeds),
    ...(values.difficulty ? { difficulty: values.difficulty } : {}),
    passive: values.passive,
    // The tournament times games for the report; the games never see the clock.
    // eslint-disable-next-line no-restricted-properties
    clock: () => performance.now(),
    onGame: (g) => {
      const r = g.report;
      failures += r.invariantFailures.length;
      const civs = r.players.filter((p) => p.controller !== 'barbarians');
      const leader = [...civs].sort((a, b) => b.score - a.score)[0]!;
      console.log(
        [
          `seed ${g.seed}`,
          `${r.turns} turns`,
          `${r.msPerTurn} ms/turn (max ${r.maxMsPerTurn})`,
          `alive ${civs.filter((p) => p.alive).length}/${civs.length}`,
          `cities ${civs.map((p) => p.cities).join('/')}`,
          `eras ${civs.map((p) => p.era.slice(0, 3)).join('/')}`,
          `wars ${r.diplomacy.wars} peaces ${r.diplomacy.peaces} deals ${r.diplomacy.deals}`,
          `battles ${r.war.battles} captured ${r.war.citiesCaptured} razed ${r.war.citiesDestroyed}`,
          `refused ${r.refused}`,
          `invariants ${r.invariantFailures.length}`,
          `leader ${leader.name} (${leader.controller}, ${leader.score})`,
          ...(g.aiWon === undefined ? [] : [g.aiWon ? 'AI WON' : 'passive held']),
        ].join(' | '),
      );
    },
  });
  if (values.passive) console.log(`AI won ${games.filter((g) => g.aiWon).length} of ${games.length}`);
  process.exit(failures > 0 ? 1 : 0);
}
