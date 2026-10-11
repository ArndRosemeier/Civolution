import { describe, expect, it } from 'vitest';
import { rules } from '../src/rules.ts';
import { CATEGORIES, parseLinks, pediaEntries, pediaEntry, pediaKey } from '../src/pedia/index.ts';

describe('Civilopedia', () => {
  const entries = pediaEntries();

  it('has a written page for everything in the rules', () => {
    const missing: string[] = [];
    const need = (key: string) => {
      const e = pediaEntry(key);
      if (!e || e.text.trim().length < 40) missing.push(key);
    };
    for (const u of rules.set.units) need(pediaKey.unit(u.id));
    for (const b of rules.set.buildings) need(pediaKey.building(b.id));
    for (const t of rules.set.techs) need(`techs/${t.id}`);
    for (const g of rules.set.governments) need(`governments/${g.id}`);
    for (const t of rules.terrains) need(`terrains/${t.id}`);
    for (const r of rules.resources) need(`resources/${r.id}`);
    for (const j of rules.set.workerJobs) need(`workerJobs/${j.id}`);
    for (const c of rules.set.civs) {
      need(`civs/${c.id}`);
      for (const t of c.traits) need(`traits/${t}`);
    }
    for (const s of rules.set.specialists) need(`specialists/${s.id}`);
    for (const e of rules.set.eras) need(`eras/${e.id}`);
    expect(missing).toEqual([]);
  });

  it('explains every game concept the hints and contents point to', () => {
    for (const id of ['cities', 'tiles', 'production', 'trade', 'science', 'corruption', 'happiness', 'governments', 'culture', 'combat', 'workers', 'diplomacy', 'automation', 'victory', 'goldenAges', 'pollution'])
      expect(pediaEntry(`concepts/${id}`)?.text.length ?? 0, id).toBeGreaterThan(400);
  });

  it('only links to pages that exist', () => {
    const broken: string[] = [];
    for (const e of entries) {
      for (const p of parseLinks(e.text)) if (typeof p !== 'string' && !pediaEntry(p.to)) broken.push(`${e.key} -> ${p.to}`);
      for (const [, v] of e.facts) for (const p of Array.isArray(v) ? v : [v]) if (typeof p === 'object' && !pediaEntry(p.to)) broken.push(`${e.key} fact -> ${p.to}`);
    }
    expect(broken).toEqual([]);
  });

  it('files every page under a known category, once', () => {
    const cats = new Set(CATEGORIES.map((c) => c.id));
    expect(entries.every((e) => cats.has(e.category))).toBe(true);
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
  });

  it('sends numbered rule-file copies of a unit to the original page', () => {
    expect(pediaKey.unit('impi128')).toBe('units/impi');
    expect(pediaEntry('units/rifleman124')?.key).toBe('units/rifleman');
  });

  it('splits prose into text and links', () => {
    expect(parseLinks('Learn [Writing](pedia:techs/writing) first.')).toEqual(['Learn ', { label: 'Writing', to: 'techs/writing' }, ' first.']);
  });
});
