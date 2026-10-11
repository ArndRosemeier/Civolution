import { describe, expect, it } from 'vitest';
import changelog from '../src/changelog.json';

describe('version history', () => {
  it('starts at 0.001 and rises by exactly 0.001 per build, newest first', () => {
    const versions = changelog.map((r) => Math.round(Number(r.version) * 1000));
    expect(versions.at(-1)).toBe(1);
    versions.forEach((v, i) => {
      if (i > 0) expect(versions[i - 1]! - v).toBe(1);
    });
    for (const r of changelog) {
      expect(r.version).toMatch(/^\d+\.\d{3}$/);
      expect(r.items.length).toBeGreaterThan(0);
    }
  });
});
