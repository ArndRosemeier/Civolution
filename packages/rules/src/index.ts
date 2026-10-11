/**
 * The default rule set: our curated Conquests numbers (data/conquests.json), validated
 * against the schema on load.
 */
import { RuleSetSchema, type RuleSet } from '@civolution/data-schema';
import conquestsJson from '../data/conquests.json' with { type: 'json' };

export const conquests: RuleSet = RuleSetSchema.parse(conquestsJson);
export { curate, toId } from './curate.ts';
