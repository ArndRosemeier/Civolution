/**
 * The committed rule set must match what curation produces from the local install,
 * so hand edits go through curate.ts and never drift silently. Skipped where the
 * install has not been imported (for example in CI).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ImportedRulesSchema } from '@civolution/data-schema';
import { conquests, curate } from '../src/index.ts';

const imported = resolve(import.meta.dirname, '../../../data/imported/conquests.json');

describe('curated Conquests rules', () => {
  it('reference only ids that exist', () => {
    const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
    const terrains = ids(conquests.terrains);
    const resources = ids(conquests.resources);
    const techs = ids(conquests.techs);
    const units = ids(conquests.units);
    const jobs = ids(conquests.workerJobs);
    const missing: string[] = [];
    const need = (set: Set<string>, id: string | undefined, where: string) => {
      if (id !== undefined && !set.has(id)) missing.push(`${where}: ${id}`);
    };
    for (const t of conquests.terrains) {
      t.possibleResources.forEach((r) => need(resources, r, t.id));
      need(jobs, t.transform?.job, t.id);
      need(terrains, t.transform?.result, t.id);
    }
    for (const r of conquests.resources) need(techs, r.revealedBy, r.id);
    for (const u of conquests.units) {
      need(techs, u.requiredTech, u.id);
      need(units, u.upgradeTo, u.id);
      u.jobs.forEach((j) => need(jobs, j, u.id));
      u.requiredResources.forEach((r) => need(resources, r, u.id));
    }
    for (const t of conquests.techs) t.prerequisites.forEach((p) => need(techs, p, t.id));
    conquests.general.startUnits.forEach((u) => need(units, u, 'startUnits'));
    expect(missing).toEqual([]);
    expect(new Set(conquests.units.map((u) => u.id)).size).toBe(conquests.units.length);
  });

  it('has the well-known values', () => {
    const grass = conquests.terrains.find((t) => t.id === 'grassland')!;
    expect([grass.food, grass.shields, grass.commerce, grass.irrigationFood]).toEqual([2, 0, 0, 1]);
    const warrior = conquests.units.find((u) => u.id === 'warrior')!;
    expect([warrior.attack, warrior.defence, warrior.movement]).toEqual([1, 1, 1]);
    expect(conquests.units.find((u) => u.id === 'worker')!.jobs).toContain('road');
    expect(conquests.worldSizes.map((w) => w.id)).toEqual(['tiny', 'small', 'standard', 'large', 'huge']);
  });

  it.skipIf(!existsSync(imported))('matches a fresh curation of the local install', () => {
    const raw = ImportedRulesSchema.parse(JSON.parse(readFileSync(imported, 'utf8')));
    expect(curate(raw)).toEqual(conquests);
  });
});
