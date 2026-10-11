/**
 * The one way state changes: `apply(state, command)`. The human, the AI and the
 * automation layer all issue these same commands (PLAN.md §5, §8). `reason` is free
 * text the issuer attaches (for example an automation routine explaining itself); it
 * is echoed on the resulting events so the UI can show why something happened.
 */

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
    | 'notImplemented'
    | 'invalid';
  message: string;
}
