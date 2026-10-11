/**
 * Saves: the state as JSON with a small header. Loading checks the format, the
 * version and that the save was made with the same rule set.
 */
import { tileCount } from './grid.ts';
import { hashValue } from './hash.ts';
import type { Rules } from './rules.ts';
import type { GameState } from './state.ts';

export interface SaveHeader {
  format: 'civolution-save';
  version: 4;
  rulesHash: string;
  turn: number;
  players: string[];
}

export function saveGame(state: GameState): string {
  const header: SaveHeader = {
    format: 'civolution-save',
    version: 4,
    rulesHash: state.rulesHash,
    turn: state.turn,
    players: state.players.map((p) => p.name),
  };
  return JSON.stringify({ header, state });
}

export class SaveError extends Error {}

export function loadGame(rules: Rules, text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError('The save is not valid JSON.');
  }
  const { header, state } = (parsed ?? {}) as { header?: Partial<SaveHeader>; state?: GameState };
  if (header?.format !== 'civolution-save' || !state) throw new SaveError('This is not a Civolution save.');
  if (header.version !== 4 || (state.version as number) !== 4)
    throw new SaveError(`This save comes from an older version of the game (format ${String(header.version)}) and cannot be loaded.`);
  if (state.rulesHash !== rules.hash)
    throw new SaveError('This save was made with a different rule set.');
  const n = tileCount(state.map);
  const m = state.map;
  for (const key of ['terrain', 'underlying', 'rivers', 'resource', 'improvements', 'flags', 'territory'] as const) {
    if (!Array.isArray(m[key]) || m[key].length !== n) throw new SaveError(`The save's map is damaged (${key}).`);
  }
  return state;
}

/** Golden-hash helper: a stable digest of the whole state. */
export function stateHash(state: GameState): string {
  return hashValue(state);
}
