import { conquests } from '@civolution/rules';
import {
  apply,
  createGame,
  indexRules,
  levelHp,
  PLAYER_COLORS,
  tileIndex,
  type Command,
  type GameState,
  type Unit,
} from '../src/index.ts';

export const rules = indexRules(conquests);

/** A Tiny map with two players, then flattened to grassland around (20, 20) for hand-built cases. */
export function flatGame(seed = 1, count = 2): GameState {
  const s = createGame(rules, {
    seed,
    map: { worldSize: 'tiny' },
    players: Array.from({ length: count }, (_, i) => ({ name: String.fromCharCode(65 + i), color: PLAYER_COLORS[i]!, human: i === 0 })),
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
  // Everyone sees everything and has met everyone, no units yet.
  const civs = s.players.filter((p) => !p.barbarian).map((p) => p.id);
  const players = s.players.map((p) => ({ ...p, explored: p.explored.map(() => 0xffffffff), contacts: p.barbarian ? [] : civs.filter((x) => x !== p.id) }));
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
    hp: levelHp(rules, type, extra.experience ?? 'regular'),
    fortified: false,
    acted: false,
    attacked: false,
    carriedBy: null,
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
  for (const p of s.players) if (p.alive && !p.barbarian && !s.players[p.id]!.endedTurn) s = run(s, { type: 'endTurn', player: p.id });
  return s;
}
