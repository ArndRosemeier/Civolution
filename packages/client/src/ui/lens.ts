/**
 * The automation lens (PLAN.md §10.2): a badge on every tile where automation is at work
 * for the human player, saying what it does. Units on one tile share a badge; a city
 * shows its governor and template, and also any threat the front routine sees.
 */
import { buildsAutomated, frontNeeds, governorFor, governorName, templateFor } from '@civolution/automation';
import { playerCities, playerUnits, type GameState, type Unit } from '@civolution/engine';
import type { MapMarker } from '../map/three/markers.ts';
import { rules } from '../rules.ts';

/** Short name of what a unit's routine does. */
export function routineLabel(u: Unit): string | null {
  const r = u.routine;
  if (!r) return u.order?.type === 'intercept' ? 'Intercept' : null;
  if (r === 'explore') return 'Explore';
  if (r === 'autoWorker') return u.order?.type === 'work' ? rules.job(u.order.job).name : 'Worker';
  if (r === 'autoSettle') return 'Settle';
  if (r === 'garrison') return 'Garrison';
  if (r === 'bombard') return 'Bombard';
  if (r === 'front') return 'Front';
  if (r === 'airDefence') return 'Air duty';
  if (r.startsWith('patrol:')) return 'Patrol';
  if (r.startsWith('rally:')) return 'Rally';
  if (r.startsWith('escort:')) return 'Escort';
  return r;
}

export function automationMarkers(snap: { state: GameState; human: number }): MapMarker[] {
  const { state, human } = snap;
  const out: MapMarker[] = [];
  const byTile = new Map<number, Map<string, number>>();
  for (const u of playerUnits(state, human)) {
    const label = routineLabel(u);
    if (!label) continue;
    const m = byTile.get(u.tile) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + 1);
    byTile.set(u.tile, m);
  }
  const cityTiles = new Set<number>();
  const pressed = new Map(frontNeeds(rules, state, human).map((f) => [f.city.id, f]));
  for (const c of playerCities(state, human)) {
    cityTiles.add(c.tile);
    const parts: string[] = [];
    const gov = governorFor(state, c);
    if (gov) parts.push(governorName(gov));
    if (buildsAutomated(state, c)) parts.push(templateFor(state, c)?.name ?? 'Auto builds');
    const front = pressed.get(c.id);
    if (front) parts.push(`${front.enemies} enemies near`);
    const units = byTile.get(c.tile);
    if (units) parts.push(...[...units].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)));
    if (parts.length > 0) out.push({ tile: c.tile, text: parts.join(' · '), kind: front ? 'city front' : 'city', title: `${c.name}: ${parts.join(', ')}` });
  }
  for (const [tile, units] of byTile) {
    if (cityTiles.has(tile)) continue;
    const text = [...units].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)).join(' · ');
    out.push({ tile, text, kind: 'unit' });
  }
  return out;
}
