/**
 * Tests against a local Civ3 Complete install. They are skipped where the game is
 * not installed (for example in CI), since its files are never committed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blast } from '../src/blast.ts';
import { readBiq, section, writeBiq } from '../src/biq/index.ts';
import { toImportedRules } from '../src/rules.ts';
import { validateImportedRules } from '../src/validate.ts';

const INSTALL =
  process.env['CIV3_PATH'] ?? "C:/Program Files (x86)/Steam/steamapps/common/Sid Meier's Civilization III Complete";
const hasInstall = existsSync(join(INSTALL, 'Conquests', 'conquests.biq'));

const FILES = [
  ['Conquests/conquests.biq', 'conquests'],
  ['civ3PTW/civ3X.bix', 'ptw'],
  ['civ3mod.bic', 'vanilla'],
] as const;

describe.skipIf(!hasInstall)('rule files from the local install', () => {
  for (const [file, edition] of FILES) {
    describe(file, () => {
      const load = () => {
        const raw = new Uint8Array(readFileSync(join(INSTALL, file)));
        return { raw, biq: readBiq(raw) };
      };

      it(`is detected as ${edition}`, () => {
        expect(load().biq.edition).toBe(edition);
      });

      it('decodes every record completely', () => {
        const leftovers = load().biq.sections.flatMap((s) =>
          s.records.flatMap((r, i) => ('raw' in r || 'error' in r || 'unparsed' in r ? [`${s.tag}[${i}]`] : [])),
        );
        expect(leftovers).toEqual([]);
      });

      it('re-encodes to identical bytes', () => {
        const { raw, biq } = load();
        expect(Buffer.from(writeBiq(biq)).equals(Buffer.from(blast(raw)))).toBe(true);
      });
    });
  }

  it('produces valid Conquests rules with sane spot values', () => {
    const biq = readBiq(new Uint8Array(readFileSync(join(INSTALL, 'Conquests/conquests.biq'))));
    const { rules, errors } = validateImportedRules(toImportedRules(biq, 'conquests.biq'));
    expect(errors).toEqual([]);
    expect(rules).toBeDefined();
    const warrior = rules!.units.find((u) => u.civilopediaEntry === 'PRTO_Warrior')!;
    expect([warrior.attack, warrior.defence, warrior.movement, warrior.shieldCost]).toEqual([1, 1, 1, 10]);
    expect(warrior.traits.abilities).toContain('footSoldier');
    expect(rules!.civs).toHaveLength(32);
    expect(rules!.governments.map((g) => g.name)).toContain('Feudalism');
    expect(rules!.terrains).toHaveLength(14);
    expect(rules!.generalRules.citySizeNames).toEqual(['Town', 'City', 'Metropolis']);
    expect(section(biq, 'TECH')).toHaveLength(rules!.techs.length);
  });
});
