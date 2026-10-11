/**
 * Which family a unit type belongs to, for its combat sound and its map effects:
 * melee, archery, mounted, gunpowder, modern infantry, armour, artillery, naval or air.
 */
import type { Rules } from '@civolution/engine';

export type UnitFamily = 'melee' | 'archery' | 'mounted' | 'gunpowder' | 'rifle' | 'armour' | 'artillery' | 'naval' | 'air';

export function unitFamily(rules: Rules, type: string): UnitFamily {
  const u = rules.unit(type);
  if (u.domain === 'sea') return 'naval';
  if (u.domain === 'air' || u.abilities.includes('cruiseMissile') || u.abilities.includes('nuclearWeapon')) return 'air';
  if (u.attack === 0 && u.bombardStrength > 0) return 'artillery';
  const era = u.requiredTech ? rules.eraIndex(rules.tech(u.requiredTech).era) : 0;
  const foot = u.abilities.includes('footSoldier');
  if (!foot && era >= 3) return 'armour';
  if (!foot && !u.abilities.includes('army')) return 'mounted';
  if (era >= 3 || (era === 2 && u.abilities.includes('rangedAttackAnimations'))) return 'rifle';
  if (u.abilities.includes('rangedAttackAnimations') && u.requiredTech === 'gunpowder') return 'gunpowder';
  if (u.abilities.includes('rangedAttackAnimations') || u.bombardStrength > 0) return 'archery';
  return 'melee';
}
