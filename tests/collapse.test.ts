import { describe, expect, it } from 'vitest';
import {
  formatFraction,
  formatPercent,
  generateWave,
  matchesPercent,
  poolSize,
  reduce,
  scaleFraction,
  toPercent,
} from '../src/core/collapse/equiv';
import { createRng } from '../src/core/rng';

describe('matchesPercent', () => {
  it('matches lowest-terms pairs', () => {
    expect(matchesPercent({ num: 1, den: 2 }, 50)).toBe(true);
    expect(matchesPercent({ num: 3, den: 4 }, 75)).toBe(true);
    expect(matchesPercent({ num: 1, den: 10 }, 10)).toBe(true);
  });

  it('matches unreduced equivalents — the whole teaching point', () => {
    expect(matchesPercent({ num: 2, den: 4 }, 50)).toBe(true);
    expect(matchesPercent({ num: 3, den: 6 }, 50)).toBe(true);
    expect(matchesPercent({ num: 50, den: 100 }, 50)).toBe(true);
    expect(matchesPercent({ num: 9, den: 12 }, 75)).toBe(true);
  });

  it('handles non-integer percentages exactly', () => {
    expect(matchesPercent({ num: 1, den: 8 }, 12.5)).toBe(true);
    expect(matchesPercent({ num: 3, den: 8 }, 37.5)).toBe(true);
    expect(matchesPercent({ num: 1, den: 16 }, 6.25)).toBe(true);
    expect(matchesPercent({ num: 2, den: 16 }, 12.5)).toBe(true);
  });

  it('rejects near misses', () => {
    expect(matchesPercent({ num: 1, den: 2 }, 51)).toBe(false);
    expect(matchesPercent({ num: 1, den: 8 }, 12)).toBe(false);
    expect(matchesPercent({ num: 3, den: 4 }, 34)).toBe(false);
  });
});

describe('fraction helpers', () => {
  it('reduces to lowest terms', () => {
    expect(reduce({ num: 2, den: 4 })).toEqual({ num: 1, den: 2 });
    expect(reduce({ num: 9, den: 12 })).toEqual({ num: 3, den: 4 });
    expect(reduce({ num: 1, den: 2 })).toEqual({ num: 1, den: 2 });
  });

  it('scaling preserves value', () => {
    const base = { num: 3, den: 5 };
    for (const k of [2, 3, 7]) {
      expect(toPercent(scaleFraction(base, k))).toBeCloseTo(toPercent(base), 10);
    }
  });

  it('formats without trailing noise', () => {
    expect(formatFraction({ num: 3, den: 8 })).toBe('3/8');
    expect(formatPercent(50)).toBe('50%');
    expect(formatPercent(12.5)).toBe('12.5%');
    expect(formatPercent(6.25)).toBe('6.25%');
  });
});

describe('generateWave', () => {
  it('every generated fraction matches its paired percentage', () => {
    for (let seed = 0; seed < 60; seed++) {
      const wave = generateWave(createRng(seed), {
        pairs: 6,
        maxTier: 3,
        unreducedChance: 0.5,
      });
      for (const pair of wave) {
        expect(matchesPercent(pair.fraction, pair.percent)).toBe(true);
      }
    }
  });

  it('keeps percentages unique so every fraction has exactly one home', () => {
    for (let seed = 0; seed < 60; seed++) {
      const wave = generateWave(createRng(seed), {
        pairs: 7,
        maxTier: 3,
        unreducedChance: 0.4,
      });
      const percents = wave.map((p) => p.percent);
      expect(new Set(percents).size).toBe(percents.length);
    }
  });

  it('no fraction matches a percentage other than its own', () => {
    for (let seed = 0; seed < 40; seed++) {
      const wave = generateWave(createRng(seed), {
        pairs: 7,
        maxTier: 3,
        unreducedChance: 0.5,
      });
      wave.forEach((pair, i) => {
        wave.forEach((other, j) => {
          if (i === j) return;
          expect(matchesPercent(pair.fraction, other.percent)).toBe(false);
        });
      });
    }
  });

  it('respects the tier cap', () => {
    // Tier 1 is the benchmark set; none of its percentages are fractional.
    for (let seed = 0; seed < 30; seed++) {
      const wave = generateWave(createRng(seed), {
        pairs: 8,
        maxTier: 1,
        unreducedChance: 0,
      });
      for (const pair of wave) {
        expect(Number.isInteger(pair.percent)).toBe(true);
      }
    }
  });

  it('never asks for more pairs than the pool holds', () => {
    const wave = generateWave(createRng(7), { pairs: 999, maxTier: 1, unreducedChance: 0 });
    expect(wave).toHaveLength(poolSize(1));
    expect(poolSize(1)).toBeLessThan(poolSize(3));
  });

  it('is deterministic for a given seed', () => {
    const opts = { pairs: 5, maxTier: 3, unreducedChance: 0.5 };
    expect(generateWave(createRng(99), opts)).toEqual(generateWave(createRng(99), opts));
  });

  it('produces unreduced forms when asked, never when not', () => {
    const none = generateWave(createRng(3), { pairs: 8, maxTier: 3, unreducedChance: 0 });
    for (const pair of none) {
      expect(reduce(pair.fraction)).toEqual(pair.fraction);
    }
    let unreducedSeen = 0;
    for (let seed = 0; seed < 30; seed++) {
      const wave = generateWave(createRng(seed), { pairs: 8, maxTier: 3, unreducedChance: 1 });
      unreducedSeen += wave.filter((p) => reduce(p.fraction).num !== p.fraction.num).length;
    }
    expect(unreducedSeen).toBeGreaterThan(0);
  });

  it('pool contains only terminating equivalents (no 1/3-style values)', () => {
    const wave = generateWave(createRng(1), { pairs: 999, maxTier: 3, unreducedChance: 0 });
    for (const pair of wave) {
      // A terminating percent survives a round trip through 4 decimal places.
      expect(Number(pair.percent.toFixed(4))).toBe(pair.percent);
    }
  });
});
