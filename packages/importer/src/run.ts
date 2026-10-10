/**
 * The import: reads rule files and text from a local Civ3 Complete install and
 * writes JSON to an output folder that is gitignored (the data is copyrighted
 * and only used to derive our own rule set).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blast, looksImploded } from './blast.ts';
import { readBiq, writeBiq } from './biq/index.ts';
import { toImportedRules } from './rules.ts';
import { decode1252 } from './text1252.ts';
import { parseCivilopedia, parseDiplomacy, parseLabels, parsePediaIcons } from './text.ts';
import { validateImportedRules } from './validate.ts';

export interface ImportOptions {
  /** Root of the Civ3 Complete install. */
  installDir: string;
  /** Output folder, normally data/imported. */
  outDir: string;
}

export interface RuleFileReport {
  file: string;
  edition: string;
  version: string;
  sections: Record<string, number>;
  /** Records whose layout did not decode, or left bytes unexplained. */
  undecoded: string[];
  roundTrip: boolean;
}

export interface ImportReport {
  ruleFiles: RuleFileReport[];
  validationErrors: string[];
  civilopediaEntries: number;
  outputs: string[];
}

const RULE_FILES = [
  { file: 'Conquests/conquests.biq', out: 'conquests.json' },
  { file: 'civ3PTW/civ3X.bix', out: 'ptw.json' },
  { file: 'civ3mod.bic', out: 'vanilla.json' },
] as const;

const TEXT_DIR = 'Conquests/Text';

function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export function runImport({ installDir, outDir }: ImportOptions): ImportReport {
  mkdirSync(outDir, { recursive: true });
  const report: ImportReport = { ruleFiles: [], validationErrors: [], civilopediaEntries: 0, outputs: [] };

  for (const { file, out } of RULE_FILES) {
    const raw = new Uint8Array(readFileSync(join(installDir, file)));
    const biq = readBiq(raw);
    const plain = looksImploded(raw) ? blast(raw) : raw;
    const back = writeBiq(biq);
    const undecoded: string[] = [];
    for (const s of biq.sections) {
      s.records.forEach((r, i) => {
        if (r['error'] !== undefined || r['raw'] !== undefined || r['unparsed'] !== undefined) {
          undecoded.push(`${s.tag}[${i}]`);
        }
      });
    }
    const rules = toImportedRules(biq, file);
    report.ruleFiles.push({
      file,
      edition: biq.edition,
      version: (rules['source'] as { version: string }).version,
      sections: Object.fromEntries(biq.sections.map((s) => [s.tag, s.records.length])),
      undecoded,
      roundTrip: back.length === plain.length && back.every((b, i) => b === plain[i]),
    });
    if (biq.edition === 'conquests') {
      report.validationErrors = validateImportedRules(rules).errors;
    }
    writeJson(join(outDir, out), rules);
    report.outputs.push(out);
  }

  const text = (name: string) => decode1252(new Uint8Array(readFileSync(join(installDir, TEXT_DIR, name))));
  const civilopedia = parseCivilopedia(text('Civilopedia.txt'));
  report.civilopediaEntries = Object.keys(civilopedia).length;
  writeJson(join(outDir, 'text.json'), {
    civilopedia,
    pediaIcons: parsePediaIcons(text('PediaIcons.txt')),
    labels: parseLabels(text('labels.txt')),
    diplomacy: parseDiplomacy(text('diplomacy.txt')),
  });
  report.outputs.push('text.json');
  writeJson(join(outDir, 'report.json'), report);
  report.outputs.push('report.json');
  return report;
}
