/**
 * What an AI civilization knows at the start of its turn (PLAN.md §9, fair information):
 * its personality, what it can see, its cities and the threats against them, and its
 * enemies. Built once per turn; the turn's commands re-read the live state.
 */
import {
  landMasses,
  militaryPower,
  playerCities,
  visibleTiles,
  distance,
  isExplored,
  type City,
  type GameState,
  type Player,
  type Rules,
  type Unit,
} from '@civolution/engine';
import type { UnitRule } from '@civolution/data-schema';

export interface Personality {
  /** −2 (peaceful) … +2 (aggressive). */
  aggression: number;
  favourite: string | null;
  shunned: string | null;
  often: Set<string>;
  never: Set<string>;
}

/** The civilization's character from the rule file, or a stable one derived from the seed for unnamed players. */
export function personality(rules: Rules, state: GameState, player: number): Personality {
  const p = state.players[player]!;
  if (p.civ) {
    const c = rules.civ(p.civ);
    return { aggression: c.aggression, favourite: c.favoriteGovernment ?? null, shunned: c.shunnedGovernment ?? null, often: new Set(c.buildOften), never: new Set(c.buildNever) };
  }
  const aggression = ((((state.seed ^ (player * 2654435761)) >>> 0) % 5) | 0) - 2;
  return { aggression, favourite: null, shunned: null, often: new Set(), never: new Set() };
}

export type Role = 'defender' | 'attacker' | 'siege' | 'settler' | 'worker' | 'explorer' | 'leader' | 'army' | 'naval' | 'air' | 'other';

export function roleOf(rule: UnitRule): Role {
  if (rule.abilities.includes('army')) return 'army';
  if (rule.abilities.includes('leader') || rule.abilities.includes('king')) return 'leader';
  if (rule.specialActions.includes('buildCity')) return 'settler';
  if (rule.jobs.length > 0) return 'worker';
  if (rule.domain === 'sea') return 'naval';
  if (rule.domain === 'air') return 'air';
  if (rule.attack === 0 && rule.bombardStrength > 0) return 'siege';
  if (rule.attack === 0 && rule.defence === 0) return 'explorer';
  if (rule.attack > rule.defence) return 'attacker';
  if (rule.defence > 0) return 'defender';
  return 'other';
}

export interface View {
  rules: Rules;
  player: number;
  me: Player;
  traits: Personality;
  visible: Uint8Array;
  cities: City[];
  capital: City | null;
  /** Civilizations at war with this one (barbarians excluded). */
  enemies: number[];
  /** Enemy attack strength in sight within three tiles of each city. */
  threat: Map<number, number>;
  /** Cities within eight tiles of a foreign city or a visible enemy. */
  frontier: Set<number>;
  masses: Int32Array;
  power: number;
  /** Military power of every other living civilization, as far as this one can judge. */
  powerOf: Map<number, number>;
}

export function buildView(rules: Rules, state: GameState, player: number): View {
  const me = state.players[player]!;
  const visible = visibleTiles(rules, state, player);
  const cities = playerCities(state, player);
  const capital = cities.find((c) => 'palace' in c.buildings) ?? null;
  const enemies = me.atWarWith.filter((e) => state.players[e]?.alive && !state.players[e].barbarian);
  const hostile = (u: Unit) => u.owner !== player && (state.players[u.owner]!.barbarian || me.atWarWith.includes(u.owner));
  const threat = new Map<number, number>();
  const frontier = new Set<number>();
  const enemyUnits = Object.values(state.units).filter((u) => visible[u.tile] && hostile(u) && u.carriedBy === null);
  const foreignCities = Object.values(state.cities).filter((c) => c.owner !== player && isExplored(me, c.tile));
  for (const c of cities) {
    let t = 0;
    for (const u of enemyUnits) {
      const d = distance(state.map, u.tile, c.tile);
      if (d <= 3) t += rules.unit(u.type).attack * (d <= 1 ? 2 : 1);
      if (d <= 6) frontier.add(c.id);
    }
    threat.set(c.id, t);
    if (foreignCities.some((f) => distance(state.map, f.tile, c.tile) <= 8)) frontier.add(c.id);
  }
  const powerOf = new Map<number, number>();
  for (const p of state.players) if (p.alive && !p.barbarian && p.id !== player) powerOf.set(p.id, militaryPower(rules, state, p.id));
  return {
    rules,
    player,
    me,
    traits: personality(rules, state, player),
    visible,
    cities,
    capital,
    enemies,
    threat,
    frontier,
    masses: landMasses(rules, state),
    power: militaryPower(rules, state, player),
    powerOf,
  };
}
