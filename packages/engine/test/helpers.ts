import { conquests } from '@civolution/rules';
import {
  apply,
  createGame,
  indexRules,
  PLAYER_COLORS,
  tileIndex,
  type Command,
  type GameState,
  type Unit,
} from '../src/index.ts';

export const rules = indexRules(conquests);

/** A Tiny map with two players, then flattened to grassland around (20, 20) for hand-built cases. */
export function flatGame(seed = 1): GameState {
  const s = createGame(rules, {
    seed,
    map: { worldSize: 'tiny' },
    players: [
      { name: 'A', color: PLAYER_COLORS[0]!, human: true },
      { name: 'B', color: PLAYER_COLORS[1]!, human: false },
    ],
  });
  const grass = rules.terrainIndex('grassland');
  const n = s.map.terrain.length;
  const map = {
    ...s.map,
    terrain: new Array<number>(n).fill(grass),
    underlying: new Array<number>(n).fill(-1),
    rivers: new Array<number>(n).fill(0),
    resource: new Array<number>(n).fill(-1),
    improvements: new Array<number>(n).fill(0),
    flags: new Array<number>(n).fill(0),
    territory: new Array<number>(n).fill(-1),
  };
  // Everyone sees everything, no units yet.
  const players = s.players.map((p) => ({ ...p, explored: p.explored.map(() => 0xffffffff) }));
  return { ...s, map, players, units: {}, nextUnitId: 1 };
}

export const at = (s: GameState, x: number, y: number) => tileIndex(s.map, x, y);

export function setTerrain(s: GameState, tile: number, id: string): void {
  s.map.terrain[tile] = rules.terrainIndex(id);
}

export function place(s: GameState, owner: number, type: string, tile: number, extra: Partial<Unit> = {}): Unit {
  const u: Unit = {
    id: s.nextUnitId++,
    owner,
    type,
    tile,
    movesLeft: rules.unit(type).movement * rules.moveScale,
    experience: 'regular',
    fortified: false,
    order: null,
    routine: null,
    ...extra,
  };
  s.units = { ...s.units, [u.id]: u };
  return u;
}

/** Applies a command and fails the test on a rejected command. */
export function run(s: GameState, cmd: Command): GameState {
  const r = apply(rules, s, cmd);
  if (r.error) throw new Error(`${cmd.type} rejected: ${r.error.message}`);
  return r.state;
}

export function endTurnAll(s: GameState): GameState {
  for (const p of s.players) s = run(s, { type: 'endTurn', player: p.id });
  return s;
}
