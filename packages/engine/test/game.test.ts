import { describe, expect, it } from 'vitest';
import {
  apply,
  checkInvariants,
  createGame,
  FLAG_HUT,
  loadGame,
  PLAYER_COLORS,
  playerUnits,
  saveGame,
  SaveError,
  stateHash,
} from '../src/index.ts';
import { at, endTurnAll, flatGame, place, rules, run } from './helpers.ts';

describe('commands and turns', () => {
  it('never mutates the input state', () => {
    const s = flatGame();
    const w = place(s, 0, 'warrior', at(s, 20, 20));
    const before = JSON.stringify(s);
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: w.id, to: at(s, 22, 20) });
    expect(r.error).toBeUndefined();
    expect(JSON.stringify(s)).toBe(before);
    expect(r.state.units[w.id]!.tile).toBe(at(s, 22, 20));
  });

  it('rejects commands for other players and after the turn ended', () => {
    let s = flatGame();
    const w = place(s, 0, 'warrior', at(s, 20, 20));
    expect(apply(rules, s, { type: 'skip', player: 1, unit: w.id }).error?.code).toBe('notYourUnit');
    s = run(s, { type: 'endTurn', player: 0 });
    expect(apply(rules, s, { type: 'skip', player: 0, unit: w.id }).error?.code).toBe('turnEnded');
    s = run(s, { type: 'endTurn', player: 1 });
    expect(s.turn).toBe(2);
    expect(s.players.filter((p) => !p.barbarian).every((p) => !p.endedTurn)).toBe(true);
  });

  it('restores movement each turn and keeps fortify and sentry orders', () => {
    let s = flatGame();
    const w = place(s, 0, 'warrior', at(s, 20, 20));
    s = run(s, { type: 'fortify', player: 0, unit: w.id });
    expect(s.units[w.id]).toMatchObject({ fortified: true, movesLeft: 0 });
    s = endTurnAll(s);
    expect(s.units[w.id]).toMatchObject({ fortified: true, movesLeft: 3, order: { type: 'fortify' } });
  });

  it('wakes sentries when a foreign unit comes into view', () => {
    let s = flatGame();
    const w = place(s, 0, 'warrior', at(s, 20, 20));
    s = run(s, { type: 'sentry', player: 0, unit: w.id });
    const b = place(s, 1, 'warrior', at(s, 24, 20));
    s = run(s, { type: 'moveUnit', player: 1, unit: b.id, to: at(s, 22, 20) });
    s = endTurnAll(s);
    expect(s.units[w.id]!.order).toBeNull();
  });

  it('opens tribal villages once', () => {
    let s = flatGame();
    const hut = at(s, 22, 20);
    s.map.flags[hut] = FLAG_HUT;
    const w = place(s, 0, 'warrior', at(s, 20, 20));
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: w.id, to: hut });
    expect(r.events.find((e) => e.type === 'hutEntered')).toBeDefined();
    s = r.state;
    expect(s.map.flags[hut]! & FLAG_HUT).toBe(0);
  });

  it('echoes the reason on events for explainability', () => {
    const s = flatGame();
    const w = place(s, 0, 'warrior', at(s, 20, 20));
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: w.id, to: at(s, 22, 20), reason: 'exploring east' });
    expect(r.events[0]).toMatchObject({ type: 'unitMoved', reason: 'exploring east' });
  });
});

describe('new game, save and load', () => {
  const options = {
    seed: 77,
    map: { worldSize: 'small' },
    players: [0, 1, 2].map((i) => ({ name: `P${i}`, color: PLAYER_COLORS[i]!, human: i === 0 })),
  };

  it('gives every player the start units on their start tile', () => {
    const s = createGame(rules, options);
    for (const p of s.players.filter((x) => !x.barbarian)) {
      const units = playerUnits(s, p.id);
      expect(units.map((u) => u.type)).toEqual(['settler', 'worker']);
      expect(units.every((u) => u.tile === s.map.starts[p.id])).toBe(true);
    }
    expect(checkInvariants(rules, s)).toEqual([]);
  });

  it('round-trips through a save and continues identically', () => {
    let s = createGame(rules, options);
    const worker = playerUnits(s, 0).find((u) => u.type === 'worker')!;
    s = run(s, { type: 'work', player: 0, unit: worker.id, job: 'road' });
    s = endTurnAll(s);
    const loaded = loadGame(rules, saveGame(s));
    expect(stateHash(loaded)).toBe(stateHash(s));
    const a = endTurnAll(endTurnAll(s));
    const b = endTurnAll(endTurnAll(loaded));
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('refuses saves from another rule set or of another kind', () => {
    const s = createGame(rules, options);
    const text = saveGame({ ...s, rulesHash: 'nope' });
    expect(() => loadGame(rules, text)).toThrow(SaveError);
    expect(() => loadGame(rules, '{"hello":1}')).toThrow(SaveError);
  });
});
