import { describe, expect, it } from 'vitest';
import { directionTo, distance, neighbour, neighbours, tileCount, tileIndex, tileX, tileY, tilesInRadius, wrapTile } from '../src/index.ts';

const g = { width: 20, height: 10, wrapX: true };

describe('diamond grid', () => {
  it('maps indices and coordinates both ways', () => {
    expect(tileCount(g)).toBe(100);
    for (let i = 0; i < tileCount(g); i++) {
      const x = tileX(g, i);
      const y = tileY(g, i);
      expect((x + y) % 2).toBe(0);
      expect(tileIndex(g, x, y)).toBe(i);
    }
  });

  it('has eight neighbours inside the map and wraps east-west', () => {
    expect(neighbours(g, tileIndex(g, 4, 4))).toHaveLength(8);
    const east = wrapTile(g, 0, 0);
    expect(neighbour(g, tileIndex(g, 18, 0), 2)).toBe(east);
    expect(neighbours(g, tileIndex(g, 0, 0))).toHaveLength(3 + 0 + 2); // top row: E, W, SE, SW, S
  });

  it('measures distance as king moves on the rotated grid', () => {
    const a = tileIndex(g, 4, 4);
    expect(distance(g, a, tileIndex(g, 6, 4))).toBe(1);
    expect(distance(g, a, tileIndex(g, 5, 5))).toBe(1);
    expect(distance(g, a, tileIndex(g, 4, 8))).toBe(2);
    expect(distance(g, a, tileIndex(g, 8, 4))).toBe(2);
    expect(distance(g, tileIndex(g, 0, 0), tileIndex(g, 18, 0))).toBe(1);
  });

  it('lists tiles in a radius', () => {
    expect(tilesInRadius(g, tileIndex(g, 6, 4), 1)).toHaveLength(9);
    expect(tilesInRadius(g, tileIndex(g, 6, 4), 2)).toHaveLength(25);
  });

  it('finds directions between neighbours', () => {
    const a = tileIndex(g, 6, 4);
    expect(directionTo(g, a, tileIndex(g, 7, 3))).toBe(1);
    expect(directionTo(g, a, tileIndex(g, 6, 8))).toBe(-1);
  });
});
