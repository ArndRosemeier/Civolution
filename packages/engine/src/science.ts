/**
 * Research (docs/rules/science.md): tech costs, what can be researched, and eras.
 * Conquests splits the tech tree by era: a tech of a later era becomes available once
 * every required tech of the eras before it is known.
 */
import type { Rules } from './rules.ts';
import type { GameState, Player } from './state.ts';

/** Share of a tech's cost saved when every other civilization the player has met knows it. */
export const KNOWN_TECH_DISCOUNT = 30;
/** Research cost factor of human players (Regent's; the difficulty's factor applies to AI players). */
export const HUMAN_COST_FACTOR = 10;

/**
 * Beakers for `player` to research `tech` (docs/rules/science.md): cost factor × the
 * difficulty's AI cost factor (humans pay Regent's) × world-size rate, less a share for
 * each civilization met that already knows it. Without a player, the human cost.
 */
export function techCost(rules: Rules, state: GameState, tech: string, player?: number): number {
  const t = rules.tech(tech);
  const p = player === undefined ? undefined : state.players[player];
  const factor = p && !p.human ? rules.difficulty(state.difficulty).costFactor : HUMAN_COST_FACTOR;
  const ws = rules.set.worldSizes.find((w) => w.id === state.settings.worldSize);
  const rate = ws?.techRate ?? 240;
  let cost = Math.floor((t.costFactor * factor * rate) / 100);
  if (p) {
    const others = state.players.filter((o) => o.alive && !o.barbarian && o.id !== p.id).length;
    const knowing = p.contacts.filter((o) => state.players[o]?.alive && state.players[o].techs.includes(tech)).length;
    if (others > 0 && knowing > 0) cost = Math.floor((cost * (100 * others - KNOWN_TECH_DISCOUNT * knowing)) / (100 * others));
  }
  return Math.max(1, cost);
}

/** Techs an era needs before the next era opens. */
export function requiredTechs(rules: Rules, era: string): string[] {
  return rules.set.techs.filter((t) => t.era === era && !t.flags.includes('notRequiredForEraAdvance')).map((t) => t.id);
}

/** The era a player with these techs is in: the first era whose required techs are not all known. */
export function eraFor(rules: Rules, techs: readonly string[]): number {
  const known = new Set(techs);
  const eras = rules.set.eras;
  for (let i = 0; i < eras.length - 1; i++) {
    if (!requiredTechs(rules, eras[i]!.id).every((t) => known.has(t))) return i;
  }
  return eras.length - 1;
}

/** Why the player cannot research `tech` now, or null if they can. */
export function researchBlocker(rules: Rules, p: Player, tech: string): string | null {
  const t = rules.tech(tech);
  if (p.techs.includes(tech)) return `${t.name} is already known.`;
  const missing = t.prerequisites.filter((x) => !p.techs.includes(x));
  if (missing.length > 0) return `Requires ${missing.map((x) => rules.tech(x).name).join(' and ')}.`;
  const era = rules.eraIndex(t.era);
  if (era > p.era) return `Belongs to the ${rules.set.eras[era]!.name}; finish the required techs of the ${rules.set.eras[p.era]!.name} first.`;
  return null;
}

export function researchableTechs(rules: Rules, p: Player): string[] {
  return rules.set.techs.filter((t) => researchBlocker(rules, p, t.id) === null).map((t) => t.id);
}

/** Beakers per turn the whole empire would need to finish within the minimum research time. */
export function minimumTurns(rules: Rules): number {
  return Math.max(1, rules.set.general.minimumResearchTime);
}
