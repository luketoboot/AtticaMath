import { describe, expect, it } from 'vitest';
import {
  containsPoint,
  generateAsteroid,
  hitsCircle,
  maxRadius,
  minRadius,
  normalizeAngle,
  outline,
  radiusAt,
  type AsteroidOptions,
  type AsteroidShape,
} from '../src/core/shapes/asteroid';
import { createRng } from '../src/core/rng';

const OPTS: AsteroidOptions = {
  minVertices: 9,
  maxVertices: 14,
  jitter: 0.24,
  notchChance: 0.28,
  notchDepth: 0.3,
};

/** A deliberately lopsided shape: far out at angle 0, pinched at angle π. */
const LOPSIDED: AsteroidShape = { radii: [100, 50, 20, 50], baseRadius: 50 };

describe('generateAsteroid', () => {
  it('respects the vertex count range', () => {
    for (let seed = 0; seed < 40; seed++) {
      const shape = generateAsteroid(createRng(seed), 40, OPTS);
      expect(shape.radii.length).toBeGreaterThanOrEqual(OPTS.minVertices);
      expect(shape.radii.length).toBeLessThanOrEqual(OPTS.maxVertices);
    }
  });

  it('never collapses a vertex through the centre', () => {
    const harsh: AsteroidOptions = { ...OPTS, jitter: 0.9, notchChance: 1, notchDepth: 3 };
    for (let seed = 0; seed < 40; seed++) {
      const shape = generateAsteroid(createRng(seed), 40, harsh);
      expect(minRadius(shape)).toBeGreaterThan(0);
      expect(minRadius(shape)).toBeGreaterThanOrEqual(40 * 0.35 - 1e-9);
    }
  });

  it('actually produces an irregular outline, not a circle', () => {
    const shape = generateAsteroid(createRng(7), 40, OPTS);
    expect(maxRadius(shape) - minRadius(shape)).toBeGreaterThan(1);
  });

  it('is deterministic for a seed', () => {
    expect(generateAsteroid(createRng(11), 40, OPTS)).toEqual(
      generateAsteroid(createRng(11), 40, OPTS),
    );
  });
});

describe('normalizeAngle', () => {
  it('wraps into [0, 2π)', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0, 9);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(1.5 * Math.PI, 9);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
  });
});

describe('radiusAt', () => {
  it('returns the stored radius exactly at each vertex angle', () => {
    const step = (Math.PI * 2) / LOPSIDED.radii.length;
    LOPSIDED.radii.forEach((r, i) => {
      expect(radiusAt(LOPSIDED, i * step)).toBeCloseTo(r, 9);
    });
  });

  it('interpolates between neighbours', () => {
    const step = (Math.PI * 2) / 4;
    expect(radiusAt(LOPSIDED, step * 0.5)).toBeCloseTo(75, 9); // between 100 and 50
  });

  it('wraps around the seam', () => {
    expect(radiusAt(LOPSIDED, Math.PI * 2)).toBeCloseTo(100, 9);
    expect(radiusAt(LOPSIDED, -Math.PI * 2)).toBeCloseTo(100, 9);
  });
});

describe('outline', () => {
  it('emits one point per vertex at the stored radius', () => {
    const points = outline(LOPSIDED);
    expect(points).toHaveLength(4);
    expect(Math.hypot(points[0]!.x, points[0]!.y)).toBeCloseTo(100, 9);
    expect(Math.hypot(points[2]!.x, points[2]!.y)).toBeCloseTo(20, 9);
  });

  it('rotation turns the outline without changing its radii', () => {
    const spun = outline(LOPSIDED, Math.PI / 2);
    // The long spike started at +x; a quarter turn puts it at +y.
    expect(spun[0]!.x).toBeCloseTo(0, 6);
    expect(spun[0]!.y).toBeCloseTo(100, 6);
  });
});

describe('hitsCircle — the hitbox follows the silhouette', () => {
  it('hits along a long spike but misses at the same distance on a pinch', () => {
    // 60px out along +x is inside the 100px spike...
    expect(hitsCircle(LOPSIDED, 0, 0, 0, 60, 0, 0)).toBe(true);
    // ...and outside the 20px pinch on the opposite side.
    expect(hitsCircle(LOPSIDED, 0, 0, 0, -60, 0, 0)).toBe(false);
  });

  it('rotating the rock moves which side is dangerous', () => {
    // Half a turn swaps the spike and the pinch.
    expect(hitsCircle(LOPSIDED, 0, 0, Math.PI, 60, 0, 0)).toBe(false);
    expect(hitsCircle(LOPSIDED, 0, 0, Math.PI, -60, 0, 0)).toBe(true);
  });

  it('accounts for the other body radius', () => {
    expect(hitsCircle(LOPSIDED, 0, 0, 0, -30, 0, 0)).toBe(false);
    expect(hitsCircle(LOPSIDED, 0, 0, 0, -30, 0, 12)).toBe(true);
  });

  it('rejects anything past the widest point', () => {
    expect(hitsCircle(LOPSIDED, 0, 0, 0, 101, 0, 0)).toBe(false);
    expect(hitsCircle(LOPSIDED, 0, 0, 1.2, 400, 400, 5)).toBe(false);
  });

  it('accepts anything inside the narrowest point, whatever the angle', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const r = minRadius(LOPSIDED) - 1;
      expect(hitsCircle(LOPSIDED, 0, 0, 0, Math.cos(a) * r, Math.sin(a) * r, 0)).toBe(true);
    }
  });

  it('respects the asteroid centre offset', () => {
    expect(hitsCircle(LOPSIDED, 500, 300, 0, 560, 300, 0)).toBe(true);
    expect(hitsCircle(LOPSIDED, 500, 300, 0, 440, 300, 0)).toBe(false);
  });

  it('agrees with radiusAt on generated shapes', () => {
    for (let seed = 0; seed < 25; seed++) {
      const shape = generateAsteroid(createRng(seed), 40, OPTS);
      for (let a = 0; a < Math.PI * 2; a += 0.4) {
        const r = radiusAt(shape, a);
        const inside = { x: Math.cos(a) * (r - 0.5), y: Math.sin(a) * (r - 0.5) };
        const outside = { x: Math.cos(a) * (r + 0.5), y: Math.sin(a) * (r + 0.5) };
        expect(hitsCircle(shape, 0, 0, 0, inside.x, inside.y, 0)).toBe(true);
        expect(hitsCircle(shape, 0, 0, 0, outside.x, outside.y, 0)).toBe(false);
      }
    }
  });
});

describe('containsPoint', () => {
  it('is hitsCircle with no radius', () => {
    expect(containsPoint(LOPSIDED, 0, 0, 0, 60, 0)).toBe(true);
    expect(containsPoint(LOPSIDED, 0, 0, 0, -60, 0)).toBe(false);
  });
});
