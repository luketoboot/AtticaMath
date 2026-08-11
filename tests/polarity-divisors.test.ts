import { describe, expect, it } from 'vitest';
import {
  DIVISORS,
  UNRATED_DIVISORS,
  classOf,
  difficultyFor,
  isHeuristicProof,
  isLegalPair,
  lcm,
  legalPairs,
  skillIdsFor,
  splitOf,
  valuesOfClass,
} from '../src/core/polarity/divisors';
import { allSkillIds } from '../src/core/skills/taxonomy';

describe('legal pairs', () => {
  it('refuses a pair where one divides the other', () => {
    // The B-only class would be empty: every multiple of four is a multiple of
    // two, so a third of the field could never be filled.
    for (const [a, b] of [[3, 9], [4, 8], [3, 6], [4, 4], [3, 3], [5, 5]]) {
      expect(isLegalPair(a!, b!), `${a}/${b}`).toBe(false);
      expect(isLegalPair(b!, a!), `${b}/${a}`).toBe(false);
    }
  });

  it('accepts pairs that genuinely carve four ways', () => {
    for (const [a, b] of [[3, 4], [4, 7], [6, 8], [7, 8], [8, 9], [6, 9], [5, 7]]) {
      expect(isLegalPair(a!, b!), `${a}/${b}`).toBe(true);
    }
  });

  it('refuses a divisor paired with itself, or one off the roster', () => {
    expect(isLegalPair(7, 7)).toBe(false);
    expect(isLegalPair(7, 13)).toBe(false);
  });

  it('every listed pair produces all four classes in the playable range', () => {
    for (const [a, b] of legalPairs()) {
      for (const cls of ['aOnly', 'bOnly', 'bridge', 'neither'] as const) {
        expect(valuesOfClass(cls, a, b, 12, 480).length, `${a}/${b} ${cls}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('classOf', () => {
  it('partitions the range exactly — every value lands in one class', () => {
    for (const [a, b] of legalPairs()) {
      for (let v = 1; v <= 500; v++) {
        const cls = classOf(v, a, b);
        const inA = v % a === 0;
        const inB = v % b === 0;
        const expected = inA && inB ? 'bridge' : inA ? 'aOnly' : inB ? 'bOnly' : 'neither';
        expect(cls).toBe(expected);
      }
    }
  });

  it('makes the bridges exactly the multiples of the lowest common multiple', () => {
    for (const [a, b] of legalPairs()) {
      const bridges = valuesOfClass('bridge', a, b, 1, 500);
      const byLcm: number[] = [];
      for (let v = lcm(a, b); v <= 500; v += lcm(a, b)) byLcm.push(v);
      expect(bridges).toEqual(byLcm);
    }
  });

  it('is symmetric under swapping the pair', () => {
    expect(classOf(24, 3, 4)).toBe('bridge');
    expect(classOf(24, 4, 3)).toBe('bridge');
    expect(classOf(9, 3, 4)).toBe('aOnly');
    expect(classOf(9, 4, 3)).toBe('bOnly');
  });
});

describe('skill credit', () => {
  it('files composites under the method that actually does the work', () => {
    expect(skillIdsFor(6)).toEqual(['div.by.3']);
    expect(skillIdsFor(9)).toEqual(['div.by.3']);
    expect(skillIdsFor(8)).toEqual(['div.by.4']);
  });

  it('deals single digits only, because the divisor is the trigger', () => {
    // The key you press to fire is the number you wear, and a two-digit
    // divisor is not a key. Eleven keeps its skill everywhere else.
    for (const d of DIVISORS) {
      expect(d, `divisor ${d}`).toBeGreaterThanOrEqual(3);
      expect(d, `divisor ${d}`).toBeLessThanOrEqual(9);
    }
    // Parity is the read every player already has, and the one the heuristic
    // rules exist to route around. A wave built on it asks nothing.
    expect(DIVISORS).not.toContain(2);
    expect(skillIdsFor(11)).toEqual([]);
    expect(skillIdsFor(12)).toEqual([]);
  });

  it('rates nothing for the divisors the last digit settles', () => {
    for (const d of UNRATED_DIVISORS) {
      expect(skillIdsFor(d), `divisor ${d}`).toEqual([]);
    }
  });

  it('only ever names skills the taxonomy has', () => {
    const known = new Set(allSkillIds());
    for (const d of DIVISORS) {
      for (const id of skillIdsFor(d)) expect(known.has(id), id).toBe(true);
    }
  });

  it('leaves no divisor on the roster unruled', () => {
    // Silence would be a decision by default; every divisor is either credited
    // or explicitly listed as uncredited.
    for (const d of DIVISORS) {
      const rated = skillIdsFor(d).length > 0;
      expect(rated || UNRATED_DIVISORS.includes(d), `divisor ${d}`).toBe(true);
    }
  });
});

describe('heuristic proofing', () => {
  it('marks an odd number as a giveaway for any even divisor', () => {
    expect(isHeuristicProof(85, 4)).toBe(false);
    expect(isHeuristicProof(85, 6)).toBe(false);
    expect(isHeuristicProof(84, 4)).toBe(true);
  });

  it('leaves the odd divisors alone, where parity says nothing either way', () => {
    for (const v of [84, 85, 78, 82]) {
      expect(isHeuristicProof(v, 7), `${v} for 7s`).toBe(true);
      expect(isHeuristicProof(v, 3), `${v} for 3s`).toBe(true);
    }
  });

  it('marks anything not ending in nought or five as a giveaway for fives', () => {
    expect(isHeuristicProof(84, 5)).toBe(false);
    expect(isHeuristicProof(85, 5)).toBe(true);
  });
});

describe('difficulty', () => {
  it('rides the split — a near miss beats a far one', () => {
    // 85 is one off 84; 88 is three off. Both are non-multiples of seven.
    expect(splitOf(85, 7)).toBe(1);
    expect(difficultyFor(7, 85)).toBeGreaterThan(difficultyFor(7, 88));
  });

  it('discounts an item the parity check already answered', () => {
    expect(difficultyFor(4, 85)).toBeLessThan(difficultyFor(4, 86));
  });

  it('rates the sevens above the threes, as the taxonomy does', () => {
    expect(difficultyFor(7, 84)).toBeGreaterThan(difficultyFor(3, 84));
  });

  it('never returns something the rating engine cannot use', () => {
    for (const d of DIVISORS) {
      for (let v = 10; v <= 480; v++) {
        const diff = difficultyFor(d, v);
        expect(Number.isFinite(diff)).toBe(true);
        expect(diff).toBeGreaterThan(0);
      }
    }
  });
});
