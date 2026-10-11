/**
 * Plain-language text for engine events (the turn log), and small formatting helpers.
 */
import { buildName, formatYear, yearOf, type GameEvent, type GameState } from '@civolution/engine';
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

function cityName(state: GameState, id: number): string {
  return state.cities[id]?.name ?? 'A city';
}

export function describeEvent(s: { state: GameState; human: number }, e: GameEvent): string | null {
  const st = s.state;
  switch (e.type) {
    case 'turnStarted':
      return `Turn ${e.turn} begins (${formatYear(yearOf(rules, e.turn))}).`;
    case 'cityFounded':
      return `${e.name} is founded.`;
    case 'cityJoined':
      return `New citizens join ${cityName(st, e.city)} (size ${e.size}).`;
    case 'cityGrew':
      return `${cityName(st, e.city)} grows to size ${e.size}.`;
    case 'cityStarved':
      return `${cityName(st, e.city)} is starving${e.size > 0 ? ` (size ${e.size})` : ''}.`;
    case 'cityCapped':
      return `${cityName(st, e.city)} cannot grow without ${e.needs}.`;
    case 'cityBuilt':
      return `${cityName(st, e.city)} completes ${buildName(rules, e.build)}.`;
    case 'cityBuildBlocked':
      return `${cityName(st, e.city)} cannot finish ${buildName(rules, e.build)}: ${e.why}`;
    case 'cityHurried':
      return e.gold > 0 ? `${cityName(st, e.city)}: production bought for ${e.gold} gold.` : `${cityName(st, e.city)}: ${e.citizens} citizen${e.citizens === 1 ? '' : 's'} driven to forced labour.`;
    case 'cityDisorder':
      return `Civil disorder in ${cityName(st, e.city)}${e.turns > 1 ? ` (${e.turns} turns)` : ''}!`;
    case 'cityOrderRestored':
      return `Order is restored in ${cityName(st, e.city)}.`;
    case 'cityCelebrating':
      return e.started ? `${cityName(st, e.city)} celebrates We Love the King Day!` : `The celebrations in ${cityName(st, e.city)} are over.`;
    case 'bordersGrew':
      return `The borders of ${cityName(st, e.city)} expand.`;
    case 'wonderBuilt':
      return `${cityName(st, e.city)} completes the wonder ${rules.building(e.building).name}!`;
    case 'buildingSold':
      return `${rules.building(e.building).name} in ${cityName(st, e.city)} was sold: ${e.why}`;
    case 'techDiscovered':
      return `Your scholars discover ${rules.tech(e.tech).name}.`;
    case 'eraEntered':
      return `Your civilization enters the ${rules.set.eras.find((x) => x.id === e.era)?.name ?? e.era}.`;
    case 'anarchyStarted':
      return `Revolution! Anarchy for ${e.turns} turn${e.turns === 1 ? '' : 's'}, then ${rules.government(e.target).name}.`;
    case 'governmentChanged':
      return `Your civilization is now a ${rules.government(e.government).name}.`;
    case 'treasury':
      return null;
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
      return e.city !== undefined ? `Forest cleared: ${e.shields} shields of timber for ${cityName(st, e.city)}.` : 'Forest cleared.';
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
