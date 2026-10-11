/**
 * The AI at sea (PLAN.md §9, naval invasions): a ship to explore the coasts early, and
 * invasions of enemy land across water: build a transport in a coastal staging city,
 * muster the field army there, load it, sail to a beach next to the target and land.
 * Ashore, the force fights like any other (military.ts, staging-less campaign).
 */
import {
  cargoOf,
  cargoSpace,
  cityAt,
  distance,
  findPath,
  isCoastal,
  isExplored,
  neighbours,
  playerCities,
  playerUnits,
  exploredCount,
  unitAvailable,
  tilesInRadius,
  transportFor,
  tileCount,
  type City,
  type GameState,
  type Unit,
} from '@civolution/engine';
import type { UnitRule } from '@civolution/data-schema';
import { siteScore } from '@civolution/automation';
import type { Ctx } from './military.ts';
import { roleOf, type View } from './view.ts';

const why = (text: string) => `AI: ${text}`;

export interface Invasion {
  enemy: number;
  target: City;
  /** Coastal own city where the force musters and boards. */
  staging: City;
  /** An own port on the enemy's land to ferry the force to, instead of a beach landing. */
  port: City | null;
}

export function isTransport(rule: UnitRule): boolean {
  return rule.domain === 'sea' && rule.capacity > 0 && rule.aiRoles.includes('navalTransport');
}

/** Whether the civilization knows how to build a transport ship. */
export function canSail(view: View, state: GameState): boolean {
  const p = state.players[view.player]!;
  return view.rules.set.units.some((u) => isTransport(u) && unitAvailable(view.rules, state, view.player, u.id) && (!u.requiredTech || p.techs.includes(u.requiredTech)));
}

/** The roomiest transport that can sail the open sea, else the roomiest at all. */
export function bestTransport(units: UnitRule[]): UnitRule | null {
  const t = units.filter(isTransport);
  t.sort((a, b) => Number(a.abilities.includes('sinksInSea')) - Number(b.abilities.includes('sinksInSea')) || b.capacity - a.capacity || a.shieldCost - b.shieldCost || a.id.localeCompare(b.id));
  return t[0] ?? null;
}

/** How far out a ship may sail: 0 coast only, 1 the sea, 2 the ocean. */
export function reach(rule: UnitRule): number {
  return rule.abilities.includes('sinksInSea') ? 0 : rule.abilities.includes('sinksInOcean') ? 1 : 2;
}

/** The ship for scouting: the farthest-reaching, then the cheapest. */
export function explorerShip(units: UnitRule[]): UnitRule | null {
  const t = units.filter((u) => u.domain === 'sea' && u.attack + u.defence > 0 && !u.abilities.includes('submarine'));
  t.sort((a, b) => reach(b) - reach(a) || a.shieldCost - b.shieldCost || b.movement - a.movement || a.id.localeCompare(b.id));
  return t[0] ?? null;
}

/** Whether the AI still wants a ship out exploring: much of the world unknown, or no rival met. */
export function wantsSeaExplorer(view: View, state: GameState): boolean {
  if (state.turn < 15 || !view.cities.some((c) => isCoastal(view.rules, state, c.tile))) return false;
  if (playerUnits(state, view.player).some((u) => u.routine === 'explore' && view.rules.unit(u.type).domain === 'sea')) return false;
  const known = exploredCount(state.players[view.player]!) / tileCount(state.map);
  return known < 0.6 || view.me.contacts.length === 0;
}

/**
 * An overseas campaign for the force on land mass `from`: an enemy city on other land,
 * reached through an own port there if the AI has one, otherwise by a beach landing
 * next to a coastal enemy city; sailing from the nearest own coastal city on `from`.
 */
export function chooseInvasion(view: View, state: GameState, enemies: number[], from: number): Invasion | null {
  const mine = playerCities(state, view.player);
  const coastalHome = mine.filter((c) => view.masses[c.tile] === from && isCoastal(view.rules, state, c.tile));
  if (coastalHome.length === 0) return null;
  let best: Invasion | null = null;
  let bestScore = Infinity;
  for (const c of Object.values(state.cities)) {
    if (!enemies.includes(c.owner) || !isExplored(view.me, c.tile) || view.masses[c.tile] === from) continue;
    const ports = mine.filter((m) => view.masses[m.tile] === view.masses[c.tile] && isCoastal(view.rules, state, m.tile));
    const port = ports.sort((a, b) => distance(state.map, a.tile, c.tile) - distance(state.map, b.tile, c.tile) || a.id - b.id)[0] ?? null;
    if (!port && !isCoastal(view.rules, state, c.tile)) continue;
    const dest = port?.tile ?? c.tile;
    for (const s of coastalHome) {
      const score = distance(state.map, s.tile, dest) * 2 + c.size + (port ? distance(state.map, port.tile, c.tile) : 0);
      if (score < bestScore || (score === bestScore && best && c.id < best.target.id)) {
        best = { enemy: c.owner, target: c, staging: s, port };
        bestScore = score;
      }
    }
  }
  return best;
}

/** A beach for the landing: a free land tile next to the target and a water tile next to it. */
function landing(ctx: Ctx, inv: Invasion, ship: Unit): { water: number; land: number } | null {
  const s = ctx.state();
  const rules = ctx.view.rules;
  const water = (t: number) => rules.terrains[s.map.terrain[t]!]!.water;
  const occupied = (t: number) => Object.values(s.units).some((u) => u.tile === t && u.owner !== ctx.view.player);
  const lands = neighbours(s.map, inv.target.tile)
    .filter((t) => !water(t) && !rules.terrains[s.map.terrain[t]!]!.impassable && !occupied(t) && !cityAt(s, t))
    .sort((a, b) => rules.terrains[s.map.terrain[b]!]!.defenceBonus - rules.terrains[s.map.terrain[a]!]!.defenceBonus || a - b);
  for (const land of lands) {
    const seas = neighbours(s.map, land)
      .filter((w) => water(w) && !occupied(w) && isExplored(ctx.view.me, w))
      .sort((a, b) => distance(s.map, a, ship.tile) - distance(s.map, b, ship.tile) || a - b);
    for (const w of seas) if (w === ship.tile || findPath(rules, s, ship, w)) return { water: w, land };
  }
  return null;
}

/**
 * Musters the field army of the staging city's land at the staging city and boards the
 * transports waiting there; returns the units it took charge of.
 */
export function musterForInvasion(ctx: Ctx, field: Unit[], inv: Invasion): void {
  const { view } = ctx;
  const rules = view.rules;
  const staging = inv.staging;
  for (const u of field) {
    const v = ctx.state().units[u.id];
    if (!v || v.movesLeft <= 0) continue;
    if (v.tile !== staging.tile) {
      if (v.order?.type !== 'goto' || v.order.target !== staging.tile) ctx.act({ type: 'goto', player: view.player, unit: v.id, to: staging.tile, reason: why(`mustering at ${staging.name} to sail against ${inv.target.name}`) });
      continue;
    }
  }
  // Board when the force can fill a transport (or is all there is).
  const s = ctx.state();
  const here = field.map((u) => s.units[u.id]).filter((v): v is Unit => !!v && v.tile === staging.tile && v.carriedBy === null);
  const ships = playerUnits(s, view.player).filter((x) => x.tile === staging.tile && isTransport(rules.unit(x.type)) && x.carriedBy === null);
  for (const ship of ships) {
    const room = cargoSpace(rules, ctx.state(), ship) - cargoOf(ctx.state(), ship.id).length;
    if (room <= 0) continue;
    if (here.length < Math.min(room, Math.max(2, field.length))) break;
    for (const v of here.splice(0, room)) ctx.act({ type: 'load', player: view.player, unit: v.id, reason: why(`boarding for ${inv.target.name}`) });
  }
}

/** Transports sail loaded to the beach and set the troops ashore; empty ones return to port. */
export function runTransports(ctx: Ctx, invasions: Invasion[]): void {
  const { view } = ctx;
  const rules = view.rules;
  for (const t0 of playerUnits(ctx.state(), view.player)) {
    if (!isTransport(rules.unit(t0.type)) || t0.carriedBy !== null || t0.routine) continue;
    const ship = ctx.state().units[t0.id];
    if (!ship) continue;
    const settlers = cargoOf(ctx.state(), ship.id).filter((c) => rules.unit(c.type).specialActions.includes('buildCity'));
    if (settlers.length > 0 && sailColonists(ctx, ship, settlers, colonySite(view, ctx.state()))) continue;
    // Each ship serves the crossing whose port of departure is nearest.
    const inv = [...invasions].sort((a, b) => distance(ctx.state().map, a.staging.tile, ship.tile) - distance(ctx.state().map, b.staging.tile, ship.tile) || a.staging.id - b.staging.id)[0] ?? null;
    const cargo = cargoOf(ctx.state(), ship.id).filter((c) => rules.unit(c.type).domain === 'land');
    if (cargo.length > 0 && inv?.port) {
      const port = inv.port;
      if (ship.tile !== port.tile && ship.movesLeft > 0 && (ship.order?.type !== 'goto' || ship.order.target !== port.tile))
        ctx.act({ type: 'goto', player: view.player, unit: ship.id, to: port.tile, reason: why(`ferrying troops to ${port.name}`) });
      if (ctx.state().units[ship.id]?.tile === port.tile)
        for (const c of cargoOf(ctx.state(), ship.id)) ctx.act({ type: 'unload', player: view.player, unit: c.id, reason: why(`ashore at ${port.name}`) });
      continue;
    }
    if (cargo.length > 0 && inv) {
      const beach = landing(ctx, inv, ship);
      if (!beach) {
        // Nowhere to land from here: put the troops ashore if in port.
        if (cityAt(ctx.state(), ship.tile)?.owner === view.player) for (const c of cargo) ctx.act({ type: 'unload', player: view.player, unit: c.id, reason: why('no beach in reach') });
        continue;
      }
      if (ship.tile !== beach.water && ship.movesLeft > 0) {
        if (ship.order?.type !== 'goto' || ship.order.target !== beach.water) ctx.act({ type: 'goto', player: view.player, unit: ship.id, to: beach.water, reason: why(`sailing against ${inv.target.name}`) });
      }
      const after = ctx.state().units[ship.id];
      if (after && distance(ctx.state().map, after.tile, beach.land) === 1) {
        for (const c of cargoOf(ctx.state(), ship.id)) {
          if (c.movesLeft <= 0) continue;
          ctx.act({ type: 'moveUnit', player: view.player, unit: c.id, to: beach.land, reason: why(`landing before ${inv.target.name}`) });
        }
      }
      continue;
    }
    if (cargo.length > 0) {
      // No invasion any more: bring the troops home.
      const home = playerCities(ctx.state(), view.player).filter((c) => isCoastal(rules, ctx.state(), c.tile)).sort((a, b) => distance(ctx.state().map, a.tile, ship.tile) - distance(ctx.state().map, b.tile, ship.tile) || a.id - b.id)[0];
      if (cityAt(ctx.state(), ship.tile)?.owner === view.player) {
        for (const c of cargo) ctx.act({ type: 'unload', player: view.player, unit: c.id, reason: why('ashore again: no crossing planned') });
      } else if (home && ship.order?.type !== 'goto') ctx.act({ type: 'goto', player: view.player, unit: ship.id, to: home.tile, reason: why('bringing the troops home') });
      continue;
    }
    const port = inv?.staging ?? null;
    if (port && ship.tile !== port.tile && ship.movesLeft > 0 && (ship.order?.type !== 'goto' || ship.order.target !== port.tile)) {
      ctx.act({ type: 'goto', player: view.player, unit: ship.id, to: port.tile, reason: why(`to ${port.name} for the next crossing`) });
    } else if (!port && cityAt(ctx.state(), ship.tile)?.owner === view.player && ship.order === null && ship.movesLeft > 0) {
      ctx.act({ type: 'sentry', player: view.player, unit: ship.id, reason: why('in port') });
    }
  }
}

/**
 * The best site for a city on other land, near the coast so a ship can put settlers
 * ashore: searched around the AI's coastal cities. -1 when there is none.
 */
export function colonySite(view: View, state: GameState): number {
  const rules = view.rules;
  const coastal = playerCities(state, view.player).filter((c) => isCoastal(rules, state, c.tile));
  let best = -1;
  let bestScore = 0;
  const seen = new Set<number>();
  for (const c of coastal) {
    for (const t of tilesInRadius(state.map, c.tile, 14)) {
      if (seen.has(t)) continue;
      seen.add(t);
      if (view.masses[t] === view.masses[c.tile] || view.masses[t]! < 0 || !isExplored(view.me, t) || !isCoastal(rules, state, t)) continue;
      const base = siteScore(rules, state, view.player, t);
      if (base <= 0) continue;
      const score = base * 4 - distance(state.map, c.tile, t) * 4;
      if (score > bestScore || (score === bestScore && t < best)) {
        best = t;
        bestScore = score;
      }
    }
  }
  return best;
}

/** Settlers with nowhere to walk to board at the coastal city nearest the colony site. */
export function runColonists(ctx: Ctx, site: number): void {
  const { view } = ctx;
  const rules = view.rules;
  if (site < 0) return;
  const s = ctx.state();
  const port = playerCities(s, view.player)
    .filter((c) => isCoastal(rules, s, c.tile))
    .sort((a, b) => distance(s.map, a.tile, site) - distance(s.map, b.tile, site) || a.id - b.id)[0];
  if (!port) return;
  for (const u of playerUnits(s, view.player)) {
    if (!rules.unit(u.type).specialActions.includes('buildCity') || u.carriedBy !== null || u.routine) continue;
    const v = ctx.state().units[u.id];
    if (!v || v.movesLeft <= 0) continue;
    if (v.tile !== port.tile) {
      if (v.order?.type !== 'goto' || v.order.target !== port.tile) ctx.act({ type: 'goto', player: view.player, unit: v.id, to: port.tile, reason: why(`to ${port.name} to sail for new land`) });
      continue;
    }
    if (transportFor(rules, ctx.state(), v, v.tile)) ctx.act({ type: 'load', player: view.player, unit: v.id, reason: why('boarding for new land') });
  }
}

/** A ship with settlers aboard sails next to the colony site and puts them ashore there. */
function sailColonists(ctx: Ctx, ship: Unit, settlers: Unit[], site: number): boolean {
  const rules = ctx.view.rules;
  const s = ctx.state();
  if (site < 0) return false;
  const waters = neighbours(s.map, site)
    .filter((w) => rules.terrains[s.map.terrain[w]!]!.water && isExplored(ctx.view.me, w) && !Object.values(s.units).some((x) => x.tile === w && x.owner !== ship.owner))
    .sort((a, b) => distance(s.map, a, ship.tile) - distance(s.map, b, ship.tile) || a - b);
  const water = waters.find((w) => w === ship.tile || findPath(rules, s, ship, w));
  if (water === undefined) return false;
  if (ship.tile !== water && ship.movesLeft > 0 && (ship.order?.type !== 'goto' || ship.order.target !== water))
    ctx.act({ type: 'goto', player: ship.owner, unit: ship.id, to: water, reason: why('carrying settlers to new land') });
  if (ctx.state().units[ship.id]?.tile !== water) return true;
  for (const c of settlers) {
    if (c.movesLeft <= 0) continue;
    if (ctx.act({ type: 'moveUnit', player: c.owner, unit: c.id, to: site, reason: why('settlers ashore') }))
      ctx.act({ type: 'setRoutine', player: c.owner, unit: c.id, routine: 'autoSettle', reason: why('founding a colony') });
  }
  return true;
}

/** Transports the AI has afloat (one being built is asked for again, so the city keeps at it). */
export function transportCount(view: View, state: GameState): number {
  return playerUnits(state, view.player).filter((u) => isTransport(view.rules.unit(u.type))).length;
}

export { roleOf };
