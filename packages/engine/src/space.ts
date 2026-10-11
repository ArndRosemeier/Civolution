/**
 * The space race (docs/rules/spaceship.md): each civilization with its own Apollo Program
 * builds the ten spaceship parts, launches the ship from its capital, and wins when it
 * arrives. Losing the capital loses the ship, in flight or not.
 */
import type { CommandError } from './commands.ts';
import { empireInfo } from './empire.ts';
import type { Rules } from './rules.ts';
import type { GameState, Spaceship } from './state.ts';
import { playerCities } from './territory.ts';
import type { Tx } from './tx.ts';

/** Turns from launch to arrival at Alpha Centauri. */
export const FLIGHT_TURNS = 12;

export function emptySpaceship(): Spaceship {
  return { parts: {}, launched: null, arrives: null };
}

/** Spaceship parts the rule set has, with the copies a ship needs. */
export function spaceshipParts(rules: Rules): { id: string; needed: number }[] {
  return rules.set.buildings.filter((b) => b.spaceshipParts > 0).map((b) => ({ id: b.id, needed: b.spaceshipParts }));
}

function hasApollo(rules: Rules, state: GameState, player: number): boolean {
  for (const c of playerCities(state, player)) {
    for (const b of Object.keys(c.buildings)) if (rules.building(b).effects.includes('buildSpaceshipParts')) return true;
  }
  return false;
}

/** Why `player` may not build the spaceship part `id` now, or null. */
export function spaceshipPartBlocker(rules: Rules, state: GameState, player: number, id: string): string | null {
  if (!state.options.victories.space) return 'The space race is off in this game.';
  const p = state.players[player]!;
  if (p.spaceship.launched !== null) return 'Your spaceship has already launched.';
  if (!hasApollo(rules, state, player)) return 'Requires your own Apollo Program.';
  const needed = rules.building(id).spaceshipParts;
  if ((p.spaceship.parts[id] ?? 0) >= needed) return `Your spaceship has every ${rules.building(id).name} it needs.`;
  return null;
}

/** Whether every part is built. */
export function spaceshipComplete(rules: Rules, state: GameState, player: number): boolean {
  const ship = state.players[player]!.spaceship;
  return spaceshipParts(rules).every((p) => (ship.parts[p.id] ?? 0) >= p.needed);
}

/** A finished part joins the ship instead of standing in the city. */
export function addSpaceshipPart(tx: Tx, player: number, id: string): void {
  const ship = tx.state.players[player]!.spaceship;
  tx.player(player).spaceship = { ...ship, parts: { ...ship.parts, [id]: (ship.parts[id] ?? 0) + 1 } };
}

export function launchBlocker(rules: Rules, state: GameState, player: number): string | null {
  const p = state.players[player]!;
  if (p.spaceship.launched !== null) return 'The spaceship has already launched.';
  if (!spaceshipComplete(rules, state, player)) return 'The spaceship is not finished.';
  if (!empireInfo(rules, state, player).capital) return 'A spaceship launches from the capital.';
  return null;
}

export function launchSpaceship(rules: Rules, tx: Tx, player: number): CommandError | null {
  const why = launchBlocker(rules, tx.state, player);
  if (why) return { code: 'invalid', message: why };
  const ship = tx.state.players[player]!.spaceship;
  const arrives = tx.state.turn + FLIGHT_TURNS;
  tx.player(player).spaceship = { ...ship, launched: tx.state.turn, arrives };
  tx.emit({ type: 'spaceshipLaunched', player, arrives });
  return null;
}

/** The capital fell: the ship and every part are lost. */
export function loseSpaceship(tx: Tx, player: number, by: number): void {
  const ship = tx.state.players[player]?.spaceship;
  if (!ship || (Object.keys(ship.parts).length === 0 && ship.launched === null)) return;
  tx.player(player).spaceship = emptySpaceship();
  tx.emit({ type: 'spaceshipLost', player, by });
}

/** The first ship to arrive, if any arrives this turn (the earliest launch wins ties). */
export function arrivedSpaceship(state: GameState): number | null {
  const arrived = state.players.filter((p) => p.alive && p.spaceship.arrives !== null && p.spaceship.arrives <= state.turn);
  arrived.sort((a, b) => a.spaceship.arrives! - b.spaceship.arrives! || a.spaceship.launched! - b.spaceship.launched! || a.id - b.id);
  return arrived[0]?.id ?? null;
}
