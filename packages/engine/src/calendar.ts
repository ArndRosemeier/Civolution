/**
 * The game calendar (docs/rules/turns.md): turn 1 is the rule set's start year, and
 * each span of turns advances a fixed number of years per turn. After the last span the
 * calendar runs one year a turn, as Civ3 does: the rule file's spans cover 440 turns up to
 * AD 1951, and the last 100 turns of a 540-turn game end in AD 2050.
 */
import type { Rules } from './rules.ts';

/** Year at the start of `turn`; negative years are BC. There is no year 0. */
export function yearOf(rules: Rules, turn: number): number {
  const cal = rules.set.calendar;
  let year = cal.startYear;
  let left = turn - 1;
  for (const span of cal.spans) {
    if (left <= 0) break;
    const n = Math.min(left, span.turns);
    year += n * span.years;
    left -= n;
  }
  year += Math.max(0, left);
  // Skip the year 0 that the calendar does not have.
  return year >= 0 && cal.startYear < 0 ? year + 1 : year;
}

export function formatYear(year: number): string {
  return year < 0 ? `${-year} BC` : `AD ${year}`;
}

/** Years between two turns. */
export function yearsBetween(rules: Rules, fromTurn: number, toTurn: number): number {
  const a = yearOf(rules, fromTurn);
  const b = yearOf(rules, toTurn);
  // Crossing from BC to AD skips year 0.
  return b - a - (a < 0 && b > 0 ? 1 : 0);
}
