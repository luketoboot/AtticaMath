import { describe, expect, it } from 'vitest';
import { evaluateTokens, formatTokens } from '../src/core/expression/expression';
import { canMake, reachableTargets, solveTarget } from '../src/core/expression/solve';

describe('solver', () => {
  it('finds a two-chip solution and calls it par 2', () => {
    const info = solveTarget([3, 4, 9], 12, 4);
    expect(info).not.toBeNull();
    expect(info!.par).toBe(2);
    expect(evaluateTokens(info!.example)).toEqual({ ok: true, value: 12 });
  });

  it('every example it returns really evaluates to its target', () => {
    const hand = [2, 5, 7, 10];
    for (const [value, info] of reachableTargets(hand, 4)) {
      expect(evaluateTokens(info.example), formatTokens(info.example)).toEqual({
        ok: true,
        value,
      });
    }
  });

  it('examples use exactly par chips', () => {
    for (const info of reachableTargets([3, 6, 8, 11], 4).values()) {
      expect((info.example.length + 1) / 2).toBe(info.par);
    }
  });

  it('respects the chip ceiling', () => {
    const two = reachableTargets([1, 2, 3, 4], 2);
    for (const info of two.values()) expect(info.par).toBeLessThanOrEqual(2);
    // 1+2+3+4 = 10 needs four chips, so it is out of reach at a ceiling of two.
    expect(two.has(10)).toBe(false);
    expect(reachableTargets([1, 2, 3, 4], 4).has(10)).toBe(true);
  });

  it('honours the no-negative-intermediate rule', () => {
    // 3 - 9 is illegal, and there is no other route to it from this hand.
    expect(canMake([3, 9], -6, 2)).toBe(false);
    expect(reachableTargets([3, 9], 2).has(6)).toBe(true); // 9 - 3 is fine
  });

  it('allows a prefix that is illegal alone but legal once ÷ resolves first', () => {
    // "5 − 8" is negative, but "5 − 8 ÷ 2" is 1 and must be found.
    const info = solveTarget([5, 8, 2], 1, 3);
    expect(info).not.toBeNull();
    expect(evaluateTokens(info!.example)).toEqual({ ok: true, value: 1 });
  });

  it('only divides exactly', () => {
    // 7 ÷ 2 is not an integer, so 2 chips cannot reach it; nothing else can either.
    const reach = reachableTargets([7, 2], 2);
    expect([...reach.keys()].sort((a, b) => a - b)).toEqual([5, 9, 14]);
  });

  it('counts distinct expressions, not orderings of the same rendering', () => {
    // 2 + 3 and 3 + 2 render differently, so both count; there is no double
    // counting of one rendering.
    const info = solveTarget([2, 3], 5, 2);
    expect(info!.count).toBe(2);
  });

  it('canMake agrees with the full solve', () => {
    const hand = [4, 6, 9, 12];
    const reach = reachableTargets(hand, 3);
    for (const target of [10, 13, 24, 36, 100, 7]) {
      expect(canMake(hand, target, 3), `target ${target}`).toBe(reach.has(target));
    }
  });

  it('returns nothing for a hand too small to form an expression', () => {
    expect(reachableTargets([5], 4).size).toBe(0);
    expect(canMake([5], 5, 4)).toBe(false);
  });

  it('stays fast enough to run on every hand change', () => {
    const start = Date.now();
    reachableTargets([2, 3, 5, 7, 9, 11], 4);
    expect(Date.now() - start).toBeLessThan(250);
  });
});
