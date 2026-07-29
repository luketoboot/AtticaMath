import { describe, expect, it } from 'vitest';
import { isPrime } from '../src/core/factor/factor';
import {
  bestRect,
  drawsAsCells,
  groupingFor,
  isRectangular,
  MAX_CELLS,
} from '../src/core/factor/lattice';

describe('a number as a rectangle', () => {
  it('lays counters out as squarely as the number allows', () => {
    expect(bestRect(12)).toEqual({ cols: 4, rows: 3 });
    expect(bestRect(16)).toEqual({ cols: 4, rows: 4 });
    expect(bestRect(24)).toEqual({ cols: 6, rows: 4 });
    expect(bestRect(36)).toEqual({ cols: 6, rows: 6 });
  });

  it('never loses or invents a counter', () => {
    for (let n = 1; n <= 200; n++) {
      const { cols, rows } = bestRect(n);
      expect(cols * rows, `${n}`).toBe(n);
    }
  });

  it('draws wider than tall, so the long side is along the screen', () => {
    for (let n = 1; n <= 200; n++) {
      const { cols, rows } = bestRect(n);
      expect(cols, `${n}`).toBeGreaterThanOrEqual(rows);
    }
  });

  it('gives a prime the one arrangement it has, and nothing else', () => {
    // Euclid's definition, drawn: a prime cannot be made into a rectangle.
    for (let n = 2; n <= 200; n++) {
      expect(isRectangular(n), `${n}`).toBe(!isPrime(n));
    }
    expect(bestRect(7)).toEqual({ cols: 7, rows: 1 });
    expect(bestRect(13)).toEqual({ cols: 13, rows: 1 });
  });

  it('picks the squarest pair, not merely a pair', () => {
    // 24 is 2x12, 3x8 and 4x6. A long thin block hides the structure the
    // counters are there to show, so the squarest wins.
    const { cols, rows } = bestRect(24);
    expect(rows).toBe(4);
    expect(cols).toBe(6);
    expect(Math.abs(cols - rows)).toBeLessThanOrEqual(2);
  });

  it('stops drawing counters where they stop reading as a quantity', () => {
    expect(drawsAsCells(6)).toBe(true);
    expect(drawsAsCells(MAX_CELLS)).toBe(true);
    expect(drawsAsCells(MAX_CELLS + 1)).toBe(false);
    // A rock of 1 has nothing to say and never occurs anyway.
    expect(drawsAsCells(1)).toBe(false);
  });
});

describe('naming a factor', () => {
  it('cuts the counters into that many equal piles', () => {
    expect(groupingFor(6, 3)).toEqual({ groups: 3, size: 2 });
    expect(groupingFor(24, 4)).toEqual({ groups: 4, size: 6 });
  });

  it('conserves the counters, whatever is named', () => {
    for (let n = 2; n <= 120; n++) {
      for (let f = 1; f <= n; f++) {
        const grouping = groupingFor(n, f);
        if (grouping === undefined) continue;
        expect(grouping.groups * grouping.size, `${n} by ${f}`).toBe(n);
      }
    }
  });

  it('refuses a number that does not divide', () => {
    expect(groupingFor(6, 4)).toBeUndefined();
    expect(groupingFor(7, 2)).toBeUndefined();
    expect(groupingFor(6, 0)).toBeUndefined();
  });

  it('gives the whole rock as one pile when its own value is named', () => {
    // Which is how a prime dies: named by itself, one pile of one.
    expect(groupingFor(7, 7)).toEqual({ groups: 7, size: 1 });
  });
});
