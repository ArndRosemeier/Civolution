/**
 * Copy-on-write transaction over a GameState. `apply` must not mutate its input, but
 * cloning a Huge map for every unit move is wasteful, so a transaction copies only the
 * parts it touches: the state object once, each touched unit, player or map array once.
 */
import { invalidateCaches } from './caches.ts';
import type { GameEvent } from './commands.ts';
import { invalidateTileOwners } from './queries.ts';
import { nextInt } from './rng.ts';
import type { City, GameState, MapState, Player, Unit, WorkProgress } from './state.ts';

type MapArray = 'terrain' | 'underlying' | 'rivers' | 'resource' | 'improvements' | 'flags' | 'territory';

export interface Tx {
  readonly state: GameState;
  readonly events: GameEvent[];
  unit(id: number): Unit;
  player(id: number): Player;
  mapArray(name: MapArray): number[];
  addUnit(u: Omit<Unit, 'id'>): Unit;
  removeUnit(id: number): void;
  city(id: number): City;
  addCity(c: Omit<City, 'id'>): City;
  removeCity(id: number): void;
  setWonder(building: string, city: number): void;
  setWork(tile: number, w: WorkProgress | null): void;
  random(n: number): number;
  emit(e: GameEvent): void;
}

export function beginTx(input: GameState, reason?: string): Tx {
  const state: GameState = { ...input };
  const events: GameEvent[] = [];
  const touchedUnits = new Set<number>();
  const touchedPlayers = new Set<number>();
  const touchedArrays = new Set<MapArray>();
  let unitsCopied = false;
  let playersCopied = false;
  let mapCopied = false;
  let workCopied = false;
  let rngCopied = false;
  let citiesCopied = false;
  let wondersCopied = false;
  const touchedCities = new Set<number>();

  const units = () => {
    if (!unitsCopied) {
      state.units = { ...state.units };
      unitsCopied = true;
    }
    return state.units;
  };
  const cities = () => {
    if (!citiesCopied) {
      state.cities = { ...state.cities };
      citiesCopied = true;
    }
    return state.cities;
  };
  const map = (): MapState => {
    if (!mapCopied) {
      state.map = { ...state.map };
      mapCopied = true;
    }
    return state.map;
  };

  return {
    state,
    events,
    unit(id) {
      invalidateCaches(state);
      const u = state.units[id];
      if (!u) throw new Error(`no unit ${id}`);
      if (touchedUnits.has(id)) return u;
      const copy = { ...u };
      units()[id] = copy;
      touchedUnits.add(id);
      return copy;
    },
    player(id) {
      invalidateCaches(state);
      if (!playersCopied) {
        state.players = [...state.players];
        playersCopied = true;
      }
      const p = state.players[id];
      if (!p) throw new Error(`no player ${id}`);
      if (touchedPlayers.has(id)) return p;
      const copy = { ...p, explored: [...p.explored] };
      state.players[id] = copy;
      touchedPlayers.add(id);
      return copy;
    },
    mapArray(name) {
      invalidateCaches(state);
      const m = map();
      if (!touchedArrays.has(name)) {
        m[name] = [...m[name]];
        touchedArrays.add(name);
        m.revision = m.revision + 1;
      }
      return m[name];
    },
    addUnit(u) {
      invalidateCaches(state);
      const id = state.nextUnitId;
      state.nextUnitId = id + 1;
      const unit: Unit = { id, ...u };
      units()[id] = unit;
      touchedUnits.add(id);
      invalidateTileOwners(state);
      return unit;
    },
    removeUnit(id) {
      invalidateCaches(state);
      const us = units();
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by id
      delete us[id];
      touchedUnits.delete(id);
      invalidateTileOwners(state);
    },
    city(id) {
      invalidateCaches(state);
      const c = state.cities[id];
      if (!c) throw new Error(`no city ${id}`);
      if (touchedCities.has(id)) return c;
      const copy: City = {
        ...c,
        buildings: { ...c.buildings },
        worked: [...c.worked],
        specialists: { ...c.specialists },
        queue: [...c.queue],
        forcedLabor: [...c.forcedLabor],
      };
      cities()[id] = copy;
      touchedCities.add(id);
      return copy;
    },
    addCity(c) {
      invalidateCaches(state);
      const id = state.nextCityId;
      state.nextCityId = id + 1;
      const city: City = { id, ...c };
      cities()[id] = city;
      touchedCities.add(id);
      return city;
    },
    removeCity(id) {
      invalidateCaches(state);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by id
      delete cities()[id];
      touchedCities.delete(id);
    },
    setWonder(building, city) {
      if (!wondersCopied) {
        state.wonders = { ...state.wonders };
        wondersCopied = true;
      }
      state.wonders[building] = city;
    },
    setWork(tile, w) {
      if (!workCopied) {
        state.work = { ...state.work };
        workCopied = true;
      }
      if (w) state.work[tile] = w;
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- records keyed by tile
      else delete state.work[tile];
    },
    random(n) {
      if (!rngCopied) {
        state.rng = [...state.rng];
        rngCopied = true;
      }
      return nextInt(state.rng, n);
    },
    emit(e) {
      events.push(reason === undefined || e.reason !== undefined ? e : { ...e, reason });
    },
  };
}
