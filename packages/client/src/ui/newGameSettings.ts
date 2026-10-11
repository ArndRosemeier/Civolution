/**
 * The New game choices, remembered in the browser so the next game starts with the same
 * settings. The map seed is not kept: a remembered seed would replay the same world.
 */
import type { GameMode, GameOptions } from '@civolution/engine';

export const NEW_GAME_KEY = 'civolution.newGame';

/** Fields that may hold 'random'. */
const RANDOMABLE = new Set(['land', 'water', 'climate', 'temp', 'age', 'civ']);

export interface NewGameSettings {
  size: string;
  land: string;
  water: number | 'random';
  climate: string;
  temp: string;
  age: number | 'random';
  /** A civilization id, or 'random' to draw one when the game starts. */
  civ: string;
  difficulty: string;
  rivals: number;
  mode: GameMode;
  victories: GameOptions['victories'];
  flips: boolean;
}

/** Saved settings laid over `defaults`, keeping only fields whose type still matches. */
export function loadNewGameSettings(defaults: NewGameSettings, storage: Pick<Storage, 'getItem'> = globalThis.localStorage): NewGameSettings {
  try {
    const raw = storage.getItem(NEW_GAME_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const out = { ...defaults } as Record<string, unknown>;
    for (const [k, v] of Object.entries(defaults)) {
      const s = saved[k];
      if (s === undefined || s === null) continue;
      if (k === 'victories') {
        if (typeof s === 'object') {
          const merged = { ...(v as Record<string, boolean>) };
          for (const key of Object.keys(merged)) {
            const b = (s as Record<string, unknown>)[key];
            if (typeof b === 'boolean') merged[key] = b;
          }
          out[k] = merged;
        }
      } else if (s === 'random' ? RANDOMABLE.has(k) : typeof s === typeof v) {
        out[k] = s;
      }
    }
    return out as unknown as NewGameSettings;
  } catch {
    // Private mode, blocked storage or a damaged entry: defaults are fine.
    return defaults;
  }
}

export function saveNewGameSettings(settings: NewGameSettings, storage: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  try {
    storage.setItem(NEW_GAME_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: the next game simply starts from the defaults.
  }
}
