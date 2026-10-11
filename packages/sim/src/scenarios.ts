/**
 * Set-up scenarios for tests, benchmarks and the browser's `?scenario=` switch. Pure
 * engine code (no Node APIs), so the client can load them too.
 */
import {
  apply,
  cityRadiusTiles,
  createGame,
  distance,
  isCoastal,
  levelHp,
  neighbours,
  PLAYER_COLORS,
  IMP_IRRIGATION,
  IMP_MINE,
  IMP_ROAD,
  type GameState,
  type Rules,
  type Unit,
} from '@civolution/engine';

export interface EmpireOptions {
  seed?: number;
  cities?: number;
  worldSize?: string;
}

/**
 * A late-game empire (PLAN.md §12, Phase 5 exit criterion): the human player holds
 * `cities` cities (200 by default) on a Huge pangaea with every advance up to the
 * industrial era, mid-sized cities with the usual buildings, a worker and two defenders
 * per city. A second civilization is at peace somewhere else on the map.
 */
export function empireScenario(rules: Rules, opts: EmpireOptions = {}): GameState {
  const want = opts.cities ?? 200;
  const industrial = rules.eraIndex('industrial');
  const techs = rules.set.techs.filter((t) => rules.eraIndex(t.era) <= industrial).map((t) => t.id);
  let s = createGame(rules, {
    seed: opts.seed ?? 5,
    map: { worldSize: opts.worldSize ?? 'huge', landForm: 'pangaea', waterPercent: 60, barbarians: 'none' },
    players: [
      { name: 'You', color: PLAYER_COLORS[0]!, human: true },
      { name: 'Rival', color: PLAYER_COLORS[1]!, human: false },
    ],
    startTechs: techs,
  });
  // Sites: land tiles in breadth-first order from the human start, at least four apart.
  const m = s.map;
  const land = (t: number) => !rules.terrains[m.terrain[t]!]!.water && rules.terrains[m.terrain[t]!]!.canFoundCity;
  const rivalStart = m.starts[1]!;
  const sites: number[] = [];
  const seen = new Uint8Array(m.terrain.length);
  const queue = [m.starts[0]!];
  seen[queue[0]!] = 1;
  while (queue.length > 0 && sites.length < want) {
    const t = queue.shift()!;
    if (land(t) && distance(m, t, rivalStart) > 12 && sites.every((x) => distance(m, x, t) >= 4)) sites.push(t);
    for (const n of neighbours(m, t)) {
      if (seen[n] || rules.terrains[m.terrain[n]!]!.water) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  const unit = (owner: number, type: string, tile: number, extra: Partial<Unit> = {}): Unit => ({
    id: s.nextUnitId,
    owner,
    type,
    tile,
    movesLeft: rules.unit(type).movement * rules.moveScale,
    experience: 'veteran',
    hp: levelHp(rules, type, 'veteran'),
    fortified: false,
    acted: false,
    attacked: false,
    carriedBy: null,
    order: null,
    routine: null,
    ...extra,
  });
  // Found the cities with a settler each (the engine names them and draws borders).
  const explored = s.players[0]!.explored.map(() => 0xffffffff);
  s = { ...s, units: {}, nextUnitId: 1, players: s.players.map((p) => (p.id === 0 ? { ...p, explored } : p)) };
  for (const type of ['settler', 'rifleman']) {
    const u = unit(1, type, rivalStart);
    s = { ...s, units: { ...s.units, [u.id]: u }, nextUnitId: s.nextUnitId + 1 };
  }
  for (const tile of sites) {
    const settler = unit(0, 'settler', tile);
    s = { ...s, units: { ...s.units, [settler.id]: settler }, nextUnitId: s.nextUnitId + 1 };
    const r = apply(rules, s, { type: 'foundCity', player: 0, unit: settler.id });
    if (!r.error) s = r.state;
    else s = { ...s, units: Object.fromEntries(Object.entries(s.units).filter(([id]) => Number(id) !== settler.id)) };
  }
  // Grown cities with the buildings a late-game core has.
  const core = ['temple', 'library', 'marketplace', 'granary', 'aqueduct', 'courthouse', 'barracks'];
  const cities = { ...s.cities };
  const units: Record<string, Unit> = { ...s.units };
  let next = s.nextUnitId;
  const add = (u: Unit) => {
    units[next] = { ...u, id: next };
    next++;
  };
  Object.values(cities).forEach((c, i) => {
    const buildings: Record<string, number> = { ...c.buildings };
    for (const b of core.slice(0, 3 + (i % 5))) buildings[b] = 1;
    if (isCoastal(rules, s, c.tile)) buildings.harbor = 1;
    if (i % 3 === 0) buildings.university = 1;
    cities[c.id] = { ...c, size: 5 + (i % 6), buildings, build: { kind: 'building', id: 'temple' in buildings && !('university' in buildings) ? 'university' : 'bank' } };
    add({ ...unit(0, 'rifleman', c.tile), fortified: true, order: { type: 'fortify' } });
    add({ ...unit(0, 'rifleman', c.tile), fortified: true, order: { type: 'fortify' } });
    const around = cityRadiusTiles(s.map, c.tile).filter((t) => t !== c.tile && !rules.terrains[s.map.terrain[t]!]!.water);
    add(unit(0, 'worker', around[i % Math.max(1, around.length)] ?? c.tile));
  });
  s = { ...s, cities, units, nextUnitId: next, players: s.players.map((p) => (p.id === 0 ? { ...p, gold: 2000, government: 'democracy' } : p)) };
  // Late-game land: roads everywhere around the cities, irrigation where it helps.
  const improvements = [...s.map.improvements];
  for (const c of Object.values(s.cities))
    for (const t of cityRadiusTiles(s.map, c.tile)) {
      const terrain = rules.terrains[s.map.terrain[t]!]!;
      if (terrain.water) continue;
      improvements[t] = improvements[t]! | IMP_ROAD;
      if (terrain.irrigationFood > 0 && terrain.mineShields <= 1) improvements[t] = improvements[t] | IMP_IRRIGATION;
      else if (terrain.mineShields > 1) improvements[t] = improvements[t] | IMP_MINE;
    }
  s = { ...s, map: { ...s.map, improvements, revision: s.map.revision + 1 } };
  // Let the engine place every city's citizens for its new size.
  for (const c of Object.values(s.cities)) {
    const r = apply(rules, s, { type: 'autoCitizens', player: 0, city: c.id });
    if (!r.error) s = r.state;
  }
  return s;
}
