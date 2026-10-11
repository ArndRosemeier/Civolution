/**
 * `pnpm rules:curate`: regenerates data/conquests.json from data/imported/conquests.json
 * (run `pnpm run import` first). Review the diff before committing.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImportedRulesSchema, RuleSetSchema } from '@civolution/data-schema';
import { curate } from '../src/curate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(here, '../../../data/imported/conquests.json');
const output = join(here, '../data/conquests.json');

if (!existsSync(input)) {
  console.error(`Missing ${input}; run \`pnpm run import\` first.`);
  process.exit(1);
}
const raw = ImportedRulesSchema.parse(JSON.parse(readFileSync(input, 'utf8')));
const rules = RuleSetSchema.parse(curate(raw));
writeFileSync(output, `${JSON.stringify(rules, null, 2)}\n`);
console.log(`Wrote ${output}: ${rules.terrains.length} terrains, ${rules.units.length} units, ${rules.techs.length} techs`);
