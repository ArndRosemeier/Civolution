import { indexRules } from '@civolution/engine';
import { conquests } from '@civolution/rules';

/** The rule set on the UI thread, for queries and explanations (the worker has its own copy). */
export const rules = indexRules(conquests);
