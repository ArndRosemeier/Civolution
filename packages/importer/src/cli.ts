/**
 * `pnpm import`: reads the local Civ3 Complete install and writes data/imported/*.json.
 * The install path comes from CIV3_PATH (environment or the repo's .env file).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImport } from './run.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_INSTALL = "C:/Program Files (x86)/Steam/steamapps/common/Sid Meier's Civilization III Complete";

function readDotEnv(): Record<string, string> {
  const path = join(repoRoot, '.env');
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

const installDir = process.env['CIV3_PATH'] ?? readDotEnv()['CIV3_PATH'] ?? DEFAULT_INSTALL;
if (!existsSync(join(installDir, 'Conquests', 'conquests.biq'))) {
  console.error(`No Civ3 Complete install found at "${installDir}". Set CIV3_PATH in .env.`);
  process.exit(1);
}

const outDir = join(repoRoot, 'data', 'imported');
const report = runImport({ installDir, outDir });

for (const f of report.ruleFiles) {
  const counts = Object.entries(f.sections)
    .map(([tag, n]) => `${tag} ${n}`)
    .join(', ');
  console.log(`${f.file} (${f.edition} ${f.version}): ${counts}`);
  console.log(`  round trip: ${f.roundTrip ? 'identical bytes' : 'MISMATCH'}; undecoded records: ${f.undecoded.length}`);
}
console.log(`Civilopedia entries: ${report.civilopediaEntries}`);
console.log(`Wrote ${report.outputs.join(', ')} to ${outDir}`);

const failed =
  report.validationErrors.length > 0 || report.ruleFiles.some((f) => !f.roundTrip || f.undecoded.length > 0);
if (report.validationErrors.length > 0) {
  console.error(`Validation errors (${report.validationErrors.length}):`);
  for (const e of report.validationErrors.slice(0, 50)) console.error(`  ${e}`);
}
process.exit(failed ? 1 : 0);
