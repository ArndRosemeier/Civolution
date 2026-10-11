import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@civolution/engine';
import { AMBIENCE, EVENT_SOUNDS, MUSIC, TITLE_MUSIC, eventSoundIds, pickSound } from '../src/sounds.ts';

const client = resolve(import.meta.dirname, '..');
const index = JSON.parse(readFileSync(resolve(client, 'public/audio/index.json'), 'utf8')) as Record<string, string[]>;

/** Ids the client code plays directly: play('…'). */
function playedInCode(): string[] {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f.name)) for (const m of readFileSync(p, 'utf8').matchAll(/\bplay\('([a-z][a-z0-9-]*)'\)/g)) out.add(m[1]!);
    }
  };
  walk(resolve(client, 'src'));
  return [...out];
}

describe('sounds', () => {
  it('every event type has a sound or says which sound covers it', () => {
    for (const [type, rule] of Object.entries(EVENT_SOUNDS)) {
      if ('covered' in rule) expect(rule.covered.length, type).toBeGreaterThan(10);
      else expect(rule.tier, type).toBeGreaterThan(0);
    }
  });

  it('every sound the game can play has generated clips', () => {
    const ids = [...eventSoundIds(), ...MUSIC, TITLE_MUSIC, ...Object.values(AMBIENCE), ...playedInCode(), 'battle-won', 'battle-lost', 'ui-click'];
    const missing = [...new Set(ids)].filter((id) => !index[id]?.length);
    expect(missing).toEqual([]);
  });

  it('plays the most important sound of a batch', () => {
    const ctx = { human: 0, family: () => 'mounted', unitType: () => 'horseman' };
    const moved: GameEvent = { type: 'unitMoved', unit: 1, player: 0, from: 0, to: 1, cost: 3 };
    const grew: GameEvent = { type: 'cityGrew', city: 1, player: 0, tile: 5, size: 3 };
    const war: GameEvent = { type: 'warDeclared', player: 1, target: 0 };
    expect(pickSound([moved], ctx)).toBe('move-mounted');
    expect(pickSound([moved, grew], ctx)).toBe('city-grew');
    expect(pickSound([grew, war, moved], ctx)).toBe('war-declared');
    expect(pickSound([{ type: 'tilesRevealed', player: 0, tiles: [1] }], ctx)).toBeNull();
  });
});
