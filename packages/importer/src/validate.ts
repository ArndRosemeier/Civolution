/**
 * Validates imported rules: shape via the Zod schema, then every index
 * reference against the list it points into.
 */
import { ImportedRulesSchema, type ImportedRules } from '@civolution/data-schema';

type ListName =
  | 'buildings'
  | 'eras'
  | 'governments'
  | 'resources'
  | 'techs'
  | 'units'
  | 'workerJobs'
  | 'terrains';

/** (list, field, target list) triples; array fields are checked element-wise. */
const REFS: [keyof ImportedRules, string, ListName][] = [
  ['units', 'requiredTech', 'techs'],
  ['units', 'upgradeTo', 'units'],
  ['units', 'reqResource1', 'resources'],
  ['units', 'reqResource2', 'resources'],
  ['units', 'reqResource3', 'resources'],
  ['units', 'stealthTargets', 'units'],
  ['units', 'enslaveResults', 'units'],
  ['units', 'otherStrategy', 'units'],
  ['buildings', 'doublesHappinessOf', 'buildings'],
  ['buildings', 'gainInEveryCity', 'buildings'],
  ['buildings', 'gainOnContinent', 'buildings'],
  ['buildings', 'reqImprovement', 'buildings'],
  ['buildings', 'reqAdvance', 'techs'],
  ['buildings', 'obsoleteBy', 'techs'],
  ['buildings', 'reqResource1', 'resources'],
  ['buildings', 'reqResource2', 'resources'],
  ['buildings', 'reqGovernment', 'governments'],
  ['buildings', 'unitProduced', 'units'],
  ['techs', 'prerequisites', 'techs'],
  ['techs', 'era', 'eras'],
  ['civs', 'freeTechs', 'techs'],
  ['civs', 'shunnedGovernment', 'governments'],
  ['civs', 'favoriteGovernment', 'governments'],
  ['civs', 'kingUnit', 'units'],
  ['governments', 'prerequisiteTech', 'techs'],
  ['resources', 'prerequisite', 'techs'],
  ['workerJobs', 'requiredTech', 'techs'],
  ['workerJobs', 'reqResource1', 'resources'],
  ['workerJobs', 'reqResource2', 'resources'],
  ['terrains', 'possibleResources', 'resources'],
  // pollutionEffect looks like a terrain index (Grassland -> Plains -> Desert) but Forest and
  // Jungle hold 14, one past the last terrain; its meaning is open, so it is not checked.
];

const RULE_UNIT_REFS = [
  'advancedBarbarian',
  'basicBarbarian',
  'barbarianSeaUnit',
  'battleCreatedUnit',
  'buildArmyUnit',
  'scoutUnit',
  'slaveUnit',
  'startUnit1',
  'startUnit2',
  'flagUnit',
] as const;

export interface ValidationResult {
  rules?: ImportedRules;
  errors: string[];
}

export function validateImportedRules(data: unknown): ValidationResult {
  const parsed = ImportedRulesSchema.safeParse(data);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  const rules = parsed.data;
  const errors: string[] = [];
  const check = (where: string, value: number, target: ListName) => {
    if (value !== -1 && (value < 0 || value >= rules[target].length)) {
      errors.push(`${where} = ${value} is not a valid ${target} index`);
    }
  };
  for (const [list, field, target] of REFS) {
    const items = rules[list] as unknown as Record<string, unknown>[];
    items.forEach((item, i) => {
      const v = item[field];
      const where = `${list}[${i}].${field}`;
      if (Array.isArray(v)) {
        v.forEach((x: number, j) => {
          check(`${where}[${j}]`, x, target);
        });
      }
      else if (typeof v === 'number') check(where, v, target);
    });
  }
  for (const field of RULE_UNIT_REFS) check(`generalRules.${field}`, rules.generalRules[field], 'units');
  return { rules, errors };
}
