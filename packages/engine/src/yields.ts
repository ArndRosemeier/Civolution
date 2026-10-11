/**
 * Tile yields with their breakdown, so every number the UI shows can explain itself
 * (PLAN.md §10.2). Government tile penalties and city effects join in Phase 2.
 */
import type { Rules } from './rules.ts';
import {
  FLAG_BONUS_GRASSLAND,
  FLAG_LAKE,
  IMP_CRATER,
  IMP_IRRIGATION,
  IMP_MINE,
  IMP_POLLUTION,
  IMP_RAIL,
  IMP_ROAD,
  type GameState,
} from './state.ts';

export interface Part {
  label: string;
  amount: number;
}

export interface Explained {
  value: number;
  parts: Part[];
}

export interface TileYield {
  food: Explained;
  shields: Explained;
  commerce: Explained;
}

function sum(parts: Part[]): Explained {
  const value = Math.max(0, parts.reduce((a, p) => a + p.amount, 0));
  return { value, parts: parts.filter((p) => p.amount !== 0) };
}

/**
 * Yields of a tile if worked. `seesResource` hides strategic resources the viewing
 * player cannot see yet.
 */
export function tileYield(rules: Rules, state: GameState, tile: number, seesResource: (res: number) => boolean = () => true): TileYield {
  const m = state.map;
  const t = rules.terrains[m.terrain[tile]!]!;
  const imp = m.improvements[tile]!;
  const flags = m.flags[tile]!;
  const food: Part[] = [{ label: t.name, amount: t.food }];
  const shields: Part[] = [{ label: t.name, amount: t.shields }];
  const commerce: Part[] = [{ label: t.name, amount: t.commerce }];

  if (flags & FLAG_LAKE) food.push({ label: 'Fresh water lake', amount: 1 });
  if (flags & FLAG_BONUS_GRASSLAND) shields.push({ label: 'Outcropping', amount: 1 });
  const res = m.resource[tile]!;
  if (res >= 0 && seesResource(res)) {
    const r = rules.resources[res]!;
    food.push({ label: r.name, amount: r.food });
    shields.push({ label: r.name, amount: r.shields });
    commerce.push({ label: r.name, amount: r.commerce });
  }
  if (imp & IMP_IRRIGATION) food.push({ label: 'Irrigation', amount: t.irrigationFood });
  if (imp & IMP_MINE) shields.push({ label: 'Mine', amount: t.mineShields });
  if (imp & IMP_ROAD) commerce.push({ label: 'Road', amount: t.roadCommerce });
  if (m.rivers[tile] !== 0 && !t.water) commerce.push({ label: 'River', amount: 1 });
  if (imp & IMP_RAIL) {
    const base = shields.reduce((a, p) => a + p.amount, 0);
    if (base > 0) shields.push({ label: 'Railroad', amount: 1 });
  }
  if (imp & (IMP_POLLUTION | IMP_CRATER)) {
    const label = imp & IMP_POLLUTION ? 'Pollution' : 'Crater';
    food.push({ label, amount: -1 });
    shields.push({ label, amount: -1 });
    commerce.push({ label, amount: -1 });
  }
  return { food: sum(food), shields: sum(shields), commerce: sum(commerce) };
}

/** Whether a player can see a resource (strategic resources need their revealing tech). */
export function resourceVisibleTo(rules: Rules, state: GameState, player: number, res: number): boolean {
  const r = rules.resources[res]!;
  return !r.revealedBy || state.players[player]!.techs.includes(r.revealedBy);
}
