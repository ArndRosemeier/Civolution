import { describe, expect, it } from 'vitest';
import { debrisColours, STRIKE_AT, swingPhase, swingPose } from '../src/map/three/work.ts';

describe('worker swing', () => {
  it('starts and ends upright, so the loop has no jump', () => {
    expect(swingPose(0)).toEqual({ lean: -0, dip: 0 });
    const end = swingPose(0.9999);
    expect(Math.abs(end.lean)).toBeLessThan(1e-3);
    expect(Math.abs(end.dip)).toBeLessThan(1e-3);
  });

  it('winds up backwards, then strikes forward and down', () => {
    expect(swingPose(0.45).lean).toBeLessThan(0);
    const hit = swingPose(STRIKE_AT + 0.01);
    expect(hit.lean).toBeGreaterThan(0.3);
    expect(hit.dip).toBeLessThan(0);
  });

  it('moves smoothly through the strike', () => {
    for (let f = 0; f < 1; f += 0.01) {
      expect(Math.abs(swingPose(f + 0.01).lean - swingPose(f).lean)).toBeLessThan(0.12);
    }
  });

  it('keeps neighbouring workers out of step', () => {
    expect(swingPhase(1, 0) % 1).not.toBeCloseTo(swingPhase(2, 0) % 1, 2);
  });

  it('throws up water when irrigating and earth by default', () => {
    expect(debrisColours('irrigation')[1]).toBe(0x5aa0d8);
    expect(debrisColours('somethingNew')).toHaveLength(2);
  });
});
