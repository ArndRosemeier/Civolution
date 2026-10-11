import { describe, expect, it } from 'vitest';
import { apply, checkJob, EDGE_NE, IMP_IRRIGATION, IMP_MINE, IMP_ROAD } from '../src/index.ts';
import { at, endTurnAll, flatGame, place, rules, run, setTerrain } from './helpers.ts';

describe('worker jobs', () => {
  it('builds a road on grassland in 3 turns under despotism', () => {
    let s = flatGame();
    const tile = at(s, 20, 20);
    const w = place(s, 0, 'worker', tile);
    expect(checkJob(rules, s, w, 'road')).toEqual({ ok: true, turns: 3 });
    s = run(s, { type: 'work', player: 0, unit: w.id, job: 'road' });
    s = endTurnAll(s);
    s = endTurnAll(s);
    expect(s.map.improvements[tile]! & IMP_ROAD).toBe(0);
    s = endTurnAll(s);
    expect(s.map.improvements[tile]! & IMP_ROAD).toBe(IMP_ROAD);
    expect(s.units[w.id]!.order).toBeNull();
  });

  it('pools work from several workers and scales with terrain', () => {
    let s = flatGame();
    const tile = at(s, 20, 20);
    setTerrain(s, tile, 'hills');
    const a = place(s, 0, 'worker', tile);
    const b = place(s, 0, 'worker', tile);
    expect(checkJob(rules, s, a, 'mine')).toEqual({ ok: true, turns: 12 });
    s = run(s, { type: 'work', player: 0, unit: a.id, job: 'mine' });
    expect(checkJob(rules, s, b, 'mine')).toEqual({ ok: true, turns: 6 });
    s = run(s, { type: 'work', player: 0, unit: b.id, job: 'mine' });
    for (let i = 0; i < 6; i++) s = endTurnAll(s);
    expect(s.map.improvements[tile]! & IMP_MINE).toBe(IMP_MINE);
  });

  it('needs fresh water to irrigate, and irrigation replaces a mine', () => {
    const s = flatGame();
    const dry = at(s, 20, 20);
    const w = place(s, 0, 'worker', dry);
    expect(checkJob(rules, s, w, 'irrigation')).toMatchObject({ ok: false });
    s.map.rivers[dry] = EDGE_NE;
    expect(checkJob(rules, s, w, 'irrigation')).toMatchObject({ ok: true });
    s.map.rivers[dry] = 0;
    s.map.improvements[at(s, 21, 21)] = IMP_IRRIGATION; // shares the SE edge
    expect(checkJob(rules, s, w, 'irrigation')).toMatchObject({ ok: true });
    s.map.improvements[at(s, 21, 21)] = 0;
    s.map.improvements[at(s, 20, 22)] = IMP_IRRIGATION; // only a corner
    expect(checkJob(rules, s, w, 'irrigation')).toMatchObject({ ok: false });
    s.players[0]!.techs = ['electricity'];
    expect(checkJob(rules, s, w, 'irrigation')).toMatchObject({ ok: true });
  });

  it('clears forest back to its underlying terrain and reports the shields', () => {
    let s = flatGame();
    const tile = at(s, 20, 20);
    setTerrain(s, tile, 'forest');
    s.map.underlying[tile] = rules.terrainIndex('tundra');
    const w = place(s, 0, 'worker', tile);
    s = run(s, { type: 'work', player: 0, unit: w.id, job: 'clearForest' });
    let events: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r1 = apply(rules, s, { type: 'endTurn', player: 0 });
      const r2 = apply(rules, r1.state, { type: 'endTurn', player: 1 });
      events = events.concat(r2.events.map((e) => e.type));
      s = r2.state;
    }
    expect(rules.terrains[s.map.terrain[tile]!]!.id).toBe('tundra');
    expect(events).toContain('forestCleared');
  });

  it('explains why a job is not possible', () => {
    const s = flatGame();
    const w = place(s, 0, 'worker', at(s, 20, 20));
    expect(checkJob(rules, s, w, 'plantForest')).toEqual({ ok: false, reason: 'Requires Engineering.' });
    expect(checkJob(rules, s, w, 'fortress')).toEqual({ ok: false, reason: 'Requires Construction.' });
    const warrior = place(s, 0, 'warrior', at(s, 20, 20));
    expect(checkJob(rules, s, warrior, 'road')).toMatchObject({ ok: false });
  });
});
