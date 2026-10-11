/**
 * Where a picture for a unit lives (generated art, docs/assets.md). A king uses its
 * civilization's leader portrait, and the rule file's numbered copies of a unit
 * (impi128, f15132, …) use the original's portrait.
 */
import { rules } from '../rules.ts';

const base = (path: string) => `${import.meta.env.BASE_URL}art/${path}`;

let kings: Map<string, string> | null = null;

/** The civilization whose king this unit type is, if any. */
export function kingCiv(type: string): string | undefined {
  kings ??= new Map(rules.set.civs.filter((c) => c.kingUnit).map((c) => [c.kingUnit!, c.id]));
  return kings.get(type);
}

export function unitArt(type: string): string {
  const civ = kingCiv(type);
  if (civ) return base(`leaders/${civ}.jpg`);
  const original = type.replace(/\d{3}$/, '');
  return base(`units/${original && rules.hasUnit(original) ? original : type}.png`);
}
