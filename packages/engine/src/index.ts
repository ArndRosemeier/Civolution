/**
 * @civolution/engine: the deterministic game core. No DOM, no I/O, no ambient time.
 * Everything changes state through `apply(rules, state, command)`.
 */
export * from './commands.ts';
export * from './grid.ts';
export * from './state.ts';
export { indexRules, type Rules } from './rules.ts';
export { createGame, apply, resolveSettings, PLAYER_COLORS, type NewGameOptions, type ApplyResult } from './game.ts';
export { generateMap } from './map/generate.ts';
export { canStandOn, checkMove, stepCost, zocUnits, type MoveCheck } from './movement.ts';
export { findPath, pathTurns, reachableThisTurn, type Path } from './pathfind.ts';
export * from './queries.ts';
export { sightRadius, unitSight, visibleTiles } from './vision.ts';
export { checkJob, jobBlocker, jobCost, turnsLeft, workRate, type JobCheck } from './workers.ts';
export { tileYield, resourceVisibleTo, type Explained, type Part, type TileYield } from './yields.ts';
export { saveGame, loadGame, stateHash, SaveError, type SaveHeader } from './save.ts';
export { checkInvariants, invariants, type Invariant } from './invariants.ts';
export { canonicalJson, hashString, hashValue } from './hash.ts';
export { makeRng, hash3, type Rng, type RngState } from './rng.ts';
