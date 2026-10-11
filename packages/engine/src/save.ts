/**
 * Saves: the state as JSON with a small header. Loading checks the format, the
 * version and that the save was made with the same rule set.
 */
import { defaultAutomation } from './automation.ts';
import { phase6Fields } from './game.ts';
import { defaultOptions } from './victory.ts';
import { tileCount } from './grid.ts';
import { hashValue } from './hash.ts';
import type { Rules } from './rules.ts';
import type { GameState } from './state.ts';

export interface SaveHeader {
  format: 'civolution-save';
  version: 6;
  rulesHash: string;
  turn: number;
  players: string[];
}

export function saveGame(state: GameState): string {
  const header: SaveHeader = {
    format: 'civolution-save',
    version: 6,
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
  const { header, state: raw } = (parsed ?? {}) as { header?: { format?: string; version?: number }; state?: GameState };
  if (header?.format !== 'civolution-save' || !raw) throw new SaveError('This is not a Civolution save.');
  const state = upgrade(raw, header.version);
  if (!state) throw new SaveError(`This save comes from an older version of the game (format ${String(header.version)}) and cannot be loaded.`);
  if (state.rulesHash !== rules.hash)
    throw new SaveError('This save was made with a different rule set.');
  const n = tileCount(state.map);
  const m = state.map;
  for (const key of ['terrain', 'underlying', 'rivers', 'resource', 'improvements', 'flags', 'territory'] as const) {
    if (!Array.isArray(m[key]) || m[key].length !== n) throw new SaveError(`The save's map is damaged (${key}).`);
  }
  return state;
}

/** Brings a save of an older format up to date, or returns null when that is not possible. */
function upgrade(state: GameState, version: number | undefined): GameState | null {
  const v = state.version as number;
  if (version !== v) return null;
  if (v === 6) return state;
  // Format 4 (alpha 0.002) had no automation settings.
  if (v === 4) return upgrade({ ...state, version: 5 as 6, players: state.players.map((p) => ({ ...p, automation: defaultAutomation() })) }, 5);
  // Format 5 (alpha 0.003) predates Phase 6: civilization extras, game options and victory.
  if (v === 5) {
    return {
      ...state,
      version: 6,
      players: state.players.map((p) => ({ ...p, ...phase6Fields() })),
      cities: Object.fromEntries(Object.entries(state.cities).map(([k, c]) => [k, { ...c, nationality: c.owner, resisters: 0 }])),
      options: defaultOptions(),
      victory: null,
      climate: { warming: 0, strikes: 0 },
      un: null,
    };
  }
  return null;
}

/** Golden-hash helper: a stable digest of the whole state. */
export function stateHash(state: GameState): string {
  return hashValue(state);
}
