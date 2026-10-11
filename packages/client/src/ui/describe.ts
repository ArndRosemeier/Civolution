/**
 * Plain-language text for engine events (the turn log), and small formatting helpers.
 */
import type { GameEvent, GameState } from '@civolution/engine';
import { rules } from '../rules.ts';

export function unitName(state: GameState, id: number): string {
  const u = state.units[id];
  return u ? rules.unit(u.type).name : 'A unit';
}

/** Movement thirds as Civ3 shows them: "1 1/3". */
export function formatMoves(thirds: number): string {
  const whole = Math.floor(thirds / 3);
  const rest = thirds % 3;
  if (rest === 0) return `${whole}`;
  return whole === 0 ? `${rest}/3` : `${whole} ${rest}/3`;
}

export function describeEvent(s: { state: GameState; human: number }, e: GameEvent): string | null {
  const st = s.state;
  switch (e.type) {
    case 'turnStarted':
      return `Turn ${e.turn} begins.`;
    case 'hutEntered': {
      const o = e.outcome;
      const who = unitName(st, e.unit);
      if (o.kind === 'gold') return `${who} found ${o.amount} gold in a tribal village.`;
      if (o.kind === 'map') return `The villagers shared their maps: ${o.tiles} tiles revealed.`;
      if (o.kind === 'unit') return `A band of warriors from the village joins you.`;
      return 'The village was abandoned.';
    }
    case 'workCompleted':
      return `${rules.job(e.job).name} finished.`;
    case 'workStarted':
      return `${unitName(st, e.unit)} starts: ${rules.job(e.job).name} (${e.turns} turns).`;
    case 'forestCleared':
      return `Forest cleared (${e.shields} shields will go to the nearest city once cities exist).`;
    case 'zoneOfControl':
      return `${unitName(st, e.unit)} passed through an enemy zone of control.`;
    case 'unitWoke':
      return `${unitName(st, e.unit)} woke up: foreign units in sight.`;
    case 'gotoFinished':
      return e.arrived ? null : `${unitName(st, e.unit)} could not continue its route.`;
    case 'unitDisbanded':
      return 'Unit disbanded.';
    default:
      return null;
  }
}
