import { describe, expect, it } from 'vitest';
import {
  apply,
  checkMove,
  EDGE_NE,
  EDGE_SW,
  findPath,
  IMP_RAIL,
  IMP_ROAD,
  pathTurns,
  reachableThisTurn,
  visibleTiles,
} from '../src/index.ts';
import { at, endTurnAll, flatGame, place, rules, run, setTerrain } from './helpers.ts';

describe('movement costs (in thirds)', () => {
  it('charges terrain cost, road 1/3 and railroad 0', () => {
    const s = flatGame();
    const a = at(s, 20, 20);
    const b = at(s, 22, 20);
    const w = place(s, 0, 'warrior', a);
    expect(checkMove(rules, s, w, b)).toMatchObject({ ok: true, cost: 3 });
    setTerrain(s, b, 'hills');
    expect(checkMove(rules, s, w, b)).toMatchObject({ ok: true, cost: 6 });
    s.map.improvements[a] = IMP_ROAD;
    s.map.improvements[b] = IMP_ROAD;
    expect(checkMove(rules, s, w, b)).toMatchObject({ ok: true, cost: 1 });
    s.map.improvements[a] = IMP_ROAD | IMP_RAIL;
    s.map.improvements[b] = IMP_ROAD | IMP_RAIL;
    expect(checkMove(rules, s, w, b)).toMatchObject({ ok: true, cost: 0 });
  });

  it('lets a unit with any movement left make one more step', () => {
    let s = flatGame();
    const a = at(s, 20, 20);
    const b = at(s, 21, 21);
    const c = at(s, 22, 22);
    s.map.improvements[a] = IMP_ROAD;
    s.map.improvements[b] = IMP_ROAD;
    setTerrain(s, c, 'mountains');
    const w = place(s, 0, 'warrior', a);
    s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: b });
    expect(s.units[w.id]!.movesLeft).toBe(2);
    s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: c });
    expect(s.units[w.id]!.movesLeft).toBe(0);
    const again = apply(rules, s, { type: 'moveUnit', player: 0, unit: w.id, to: b });
    expect(again.error?.code).toBe('noMovesLeft');
  });

  it('does not let roads cross rivers before bridges', () => {
    const s = flatGame();
    const a = at(s, 20, 20);
    const ne = at(s, 21, 19);
    s.map.improvements[a] = IMP_ROAD;
    s.map.improvements[ne] = IMP_ROAD;
    s.map.rivers[a] = EDGE_NE;
    s.map.rivers[ne] = EDGE_SW;
    const w = place(s, 0, 'warrior', a);
    expect(checkMove(rules, s, w, ne)).toMatchObject({ ok: true, cost: 3 });
    s.players[0]!.techs = ['engineering'];
    expect(checkMove(rules, s, w, ne)).toMatchObject({ ok: true, cost: 1 });
  });

  it('keeps land units out of water and galleys near the coast', () => {
    const s = flatGame();
    const a = at(s, 20, 20);
    const water = at(s, 22, 20);
    setTerrain(s, water, 'sea');
    const w = place(s, 0, 'warrior', a);
    expect(checkMove(rules, s, w, water)).toMatchObject({ ok: false, error: { code: 'cannotEnter' } });
    const coast = at(s, 30, 30);
    const sea = at(s, 32, 30);
    setTerrain(s, coast, 'coast');
    setTerrain(s, sea, 'sea');
    const galley = place(s, 0, 'galley', coast);
    expect(checkMove(rules, s, galley, sea).ok).toBe(false);
  });

  it('treats all terrain as road for explorers', () => {
    const s = flatGame();
    const b = at(s, 22, 20);
    setTerrain(s, b, 'mountains');
    const e = place(s, 0, 'explorer', at(s, 20, 20));
    expect(checkMove(rules, s, e, b)).toMatchObject({ ok: true, cost: 1 });
  });

  it('blocks tiles held by another civilization at peace, and reports zones of control at war', () => {
    let s = flatGame();
    const a = at(s, 20, 20);
    const b = at(s, 22, 20);
    const w = place(s, 0, 'horseman', a);
    place(s, 1, 'warrior', b);
    expect(checkMove(rules, s, w, b)).toMatchObject({ ok: false, error: { code: 'cannotEnter' } });
    // A cavalry unit (has ZOC) sitting north of the path, at war.
    place(s, 1, 'cavalry', at(s, 21, 19));
    s.players[0]!.atWarWith = [1];
    s.players[1]!.atWarWith = [0];
    const r = apply(rules, s, { type: 'moveUnit', player: 0, unit: w.id, to: at(s, 21, 21) });
    expect(r.error).toBeUndefined();
    s = r.state;
    const r2 = apply(rules, s, { type: 'moveUnit', player: 0, unit: w.id, to: at(s, 22, 22) });
    expect(r2.events.some((e) => e.type === 'zoneOfControl')).toBe(false);
    const w2 = place(s, 0, 'horseman', at(s, 20, 18));
    const r3 = apply(rules, s, { type: 'moveUnit', player: 0, unit: w2.id, to: at(s, 22, 18) });
    expect(r3.events.find((e) => e.type === 'zoneOfControl')).toMatchObject({ by: [expect.any(Number)] });
  });
});

describe('goto and pathfinding', () => {
  it('prefers roads and continues across turns', () => {
    let s = flatGame();
    const start = at(s, 10, 10);
    const goal = at(s, 30, 10);
    for (let x = 10; x <= 30; x += 2) s.map.improvements[at(s, x, 10)] = IMP_ROAD;
    // Hills just off the road make the straight line expensive anyway.
    const w = place(s, 0, 'warrior', start);
    const path = findPath(rules, s, w, goal)!;
    expect(path.tiles).toHaveLength(10);
    expect(path.cost).toBe(10);
    expect(pathTurns(rules, s, w, path)).toBe(4);
    s = run(s, { type: 'goto', player: 0, unit: w.id, to: goal });
    expect(s.units[w.id]!.tile).toBe(at(s, 16, 10));
    for (let i = 0; i < 3; i++) s = endTurnAll(s);
    expect(s.units[w.id]!.tile).toBe(goal);
    expect(s.units[w.id]!.order).toBeNull();
  });

  it('lists tiles reachable this turn', () => {
    const s = flatGame();
    const h = place(s, 0, 'horseman', at(s, 20, 20));
    expect(reachableThisTurn(rules, s, h)).toHaveLength(24);
  });
});

describe('vision', () => {
  it('reveals around moving units and sees farther from mountains', () => {
    let s = flatGame();
    s.players[0]!.explored = s.players[0]!.explored.map(() => 0);
    const a = at(s, 20, 20);
    const m = at(s, 22, 20);
    setTerrain(s, m, 'mountains');
    const w = place(s, 0, 'warrior', a);
    expect(visibleTiles(rules, s, 0).reduce((x, y) => x + y, 0)).toBe(9);
    s = run(s, { type: 'moveUnit', player: 0, unit: w.id, to: m });
    expect(visibleTiles(rules, s, 0).reduce((x, y) => x + y, 0)).toBe(25);
  });
});
