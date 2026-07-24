import { describe, expect, it } from 'vitest';
import { createRng, seedFromString } from '../src/core/rng';

describe('seeded rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('differs across seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('int stays in inclusive bounds', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('int hits both endpoints', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(0, 3));
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });

  it('shuffle preserves elements', () => {
    const rng = createRng(9);
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = rng.shuffle(items);
    expect([...shuffled].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]); // input untouched
  });

  it('seedFromString is stable', () => {
    expect(seedFromString('2026-07-23')).toBe(seedFromString('2026-07-23'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });
});
