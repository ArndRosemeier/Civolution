/**
 * The one way state changes: `apply(state, command)`. The human, the AI and the
 * automation layer all issue these same commands (PLAN.md §5, §8). `reason` is free
 * text the issuer attaches (for example an automation routine explaining itself); it
 * is echoed on the resulting events so the UI can show why something happened.
 */

import type { Build, Rates } from './state.ts';

interface Base {
  player: number;
  reason?: string;
}

export type Command =
  | (Base & { type: 'moveUnit'; unit: number; to: number })
  | (Base & { type: 'goto'; unit: number; to: number })
  | (Base & { type: 'fortify'; unit: number })
  | (Base & { type: 'sentry'; unit: number })
  | (Base & { type: 'wake'; unit: number })
  | (Base & { type: 'skip'; unit: number })
  | (Base & { type: 'disband'; unit: number })
  | (Base & { type: 'work'; unit: number; job: string })
  | (Base & { type: 'setRoutine'; unit: number; routine: string | null })
  | (Base & { type: 'foundCity'; unit: number; name?: string })
  | (Base & { type: 'joinCity'; unit: number })
  | (Base & { type: 'setBuild'; city: number; build: Build })
  | (Base & { type: 'setQueue'; city: number; queue: Build[] })
  | (Base & { type: 'setCitizens'; city: number; worked: number[]; specialists: Record<string, number> })
  | (Base & { type: 'autoCitizens'; city: number })
  | (Base & { type: 'hurry'; city: number })
  | (Base & { type: 'renameCity'; city: number; name: string })
  | (Base & { type: 'setRates'; rates: Rates })
  | (Base & { type: 'setResearch'; tech: string })
  | (Base & { type: 'revolution'; government: string })
  | (Base & { type: 'endTurn' });

export type HutOutcome =
  | { kind: 'gold'; amount: number }
  | { kind: 'map'; tiles: number }
  | { kind: 'unit'; unitType: string; unit: number }
  | { kind: 'empty' };

export type GameEvent = { reason?: string } & (
  | { type: 'unitMoved'; unit: number; player: number; from: number; to: number; cost: number }
  | { type: 'tilesRevealed'; player: number; tiles: number[] }
  | { type: 'hutEntered'; unit: number; player: number; tile: number; outcome: HutOutcome }
  | { type: 'zoneOfControl'; unit: number; player: number; from: number; to: number; by: number[] }
  | { type: 'unitCreated'; unit: number; player: number; unitType: string; tile: number }
  | { type: 'unitDisbanded'; unit: number; player: number }
  | { type: 'orderChanged'; unit: number; player: number }
  | { type: 'workStarted'; unit: number; player: number; tile: number; job: string; turns: number }
  | { type: 'workCompleted'; tile: number; job: string; player: number }
  | { type: 'forestCleared'; tile: number; player: number; shields: number }
  | { type: 'gotoFinished'; unit: number; player: number; arrived: boolean }
  | { type: 'unitWoke'; unit: number; player: number; tile: number }
  | { type: 'playerEndedTurn'; player: number }
  | { type: 'turnStarted'; turn: number }
  | { type: 'cityFounded'; city: number; player: number; tile: number; name: string }
  | { type: 'cityJoined'; city: number; player: number; tile: number; size: number }
  | { type: 'cityGrew'; city: number; player: number; tile: number; size: number }
  | { type: 'cityStarved'; city: number; player: number; tile: number; size: number }
  | { type: 'cityCapped'; city: number; player: number; tile: number; needs: string }
  | { type: 'cityBuilt'; city: number; player: number; tile: number; build: Build; unit?: number }
  | { type: 'cityBuildBlocked'; city: number; player: number; tile: number; build: Build; why: string }
  | { type: 'cityChanged'; city: number; player: number; tile: number }
  | { type: 'cityHurried'; city: number; player: number; tile: number; gold: number; citizens: number }
  | { type: 'cityDisorder'; city: number; player: number; tile: number; turns: number }
  | { type: 'cityOrderRestored'; city: number; player: number; tile: number }
  | { type: 'cityCelebrating'; city: number; player: number; tile: number; started: boolean }
  | { type: 'bordersGrew'; city: number; player: number; tile: number; radius: number }
  | { type: 'wonderBuilt'; city: number; player: number; tile: number; building: string }
  | { type: 'buildingSold'; city: number; player: number; tile: number; building: string; why: string }
  | { type: 'techDiscovered'; player: number; tech: string }
  | { type: 'researchChanged'; player: number; tech: string }
  | { type: 'eraEntered'; player: number; era: string }
  | { type: 'ratesChanged'; player: number }
  | { type: 'anarchyStarted'; player: number; target: string; turns: number }
  | { type: 'governmentChanged'; player: number; government: string }
  | { type: 'treasury'; player: number; income: number; upkeep: number; unitSupport: number; gold: number }
);

export interface CommandError {
  code:
    | 'unknownUnit'
    | 'notYourUnit'
    | 'notAdjacent'
    | 'cannotEnter'
    | 'noMovesLeft'
    | 'cannotWork'
    | 'turnEnded'
    | 'unknownCity'
    | 'notYourCity'
    | 'cannotFound'
    | 'cannotBuild'
    | 'notImplemented'
    | 'invalid';
  message: string;
}
