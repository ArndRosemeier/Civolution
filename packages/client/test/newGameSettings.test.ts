import { describe, expect, it } from 'vitest';
import { loadNewGameSettings, NEW_GAME_KEY, saveNewGameSettings, type NewGameSettings } from '../src/ui/newGameSettings.ts';

const DEFAULTS: NewGameSettings = {
  size: 'standard',
  land: 'continents',
  water: 70,
  climate: 'normal',
  temp: 'temperate',
  age: 4,
  civ: 'random',
  difficulty: 'regent',
  rivals: 7,
  mode: 'standard',
  victories: { domination: true, spaceRace: true } as unknown as NewGameSettings['victories'],
  flips: true,
};

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe('remembered new game settings', () => {
  it('returns the defaults when nothing was saved', () => {
    expect(loadNewGameSettings(DEFAULTS, memory())).toEqual(DEFAULTS);
  });

  it('round-trips every choice, including a random civilization', () => {
    const store = memory();
    const mine = { ...DEFAULTS, size: 'huge', water: 'random' as const, civ: 'random', rivals: 3, flips: false };
    saveNewGameSettings(mine, store);
    expect(loadNewGameSettings(DEFAULTS, store)).toEqual(mine);
    saveNewGameSettings({ ...mine, civ: 'rome' }, store);
    expect(loadNewGameSettings(DEFAULTS, store).civ).toBe('rome');
  });

  it('ignores damaged or mistyped entries', () => {
    const store = memory();
    store.data.set(NEW_GAME_KEY, '{not json');
    expect(loadNewGameSettings(DEFAULTS, store)).toEqual(DEFAULTS);
    store.data.set(NEW_GAME_KEY, JSON.stringify({ size: 'random', rivals: 'many', victories: { domination: 'no', spaceRace: false } }));
    const s = loadNewGameSettings(DEFAULTS, store);
    expect(s.size).toBe('standard');
    expect(s.rivals).toBe(7);
    expect(s.victories).toEqual({ domination: true, spaceRace: false });
  });
});
