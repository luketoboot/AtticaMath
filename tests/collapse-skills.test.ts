import { describe, expect, it } from 'vitest';
import { generateWave } from '../src/core/collapse/equiv';
import { collapseAttempt } from '../src/core/collapse/skills';
import { createRng } from '../src/core/rng';
import { getSkill } from '../src/core/skills/taxonomy';

describe('collapseAttempt', () => {
  it('rates equivalence, and reduction too when the fraction was scaled up', () => {
    expect(collapseAttempt(1, false).skillIds).toEqual(['frac.percent']);
    expect(collapseAttempt(1, true).skillIds).toEqual(['frac.percent', 'frac.reduce']);
  });

  it('gets harder with the band and harder again when unreduced', () => {
    const bench = collapseAttempt(1, false).difficulty;
    const awkward = collapseAttempt(3, false).difficulty;
    expect(awkward).toBeGreaterThan(bench);
    expect(collapseAttempt(1, true).difficulty).toBeGreaterThan(bench);
  });

  it('falls back to the benchmark band rather than producing nonsense', () => {
    expect(collapseAttempt(99, false).difficulty).toBe(collapseAttempt(1, false).difficulty);
  });

  it('sits near the rated difficulty of the skill it moves', () => {
    // If these drifted apart, a benchmark collapse would swing the rating as if
    // it were a much harder or easier question than the taxonomy says it is.
    const base = getSkill('frac.percent').baseDifficulty;
    expect(Math.abs(collapseAttempt(1, false).difficulty - base)).toBeLessThan(120);
  });
});

describe('collapse waves carry their own band', () => {
  it('reports the pool tier of each pair, not the wave cap', () => {
    const wave = generateWave(createRng(3), { pairs: 8, maxTier: 3, unreducedChance: 0.5 });
    expect(wave.some((p) => p.tier === 1)).toBe(true);
    for (const pair of wave) {
      expect(pair.tier).toBeGreaterThanOrEqual(1);
      expect(pair.tier).toBeLessThanOrEqual(3);
    }
  });

  it('flags the pairs that were written unreduced', () => {
    const always = generateWave(createRng(4), { pairs: 6, maxTier: 3, unreducedChance: 1 });
    expect(always.every((p) => p.unreduced)).toBe(true);
    const never = generateWave(createRng(4), { pairs: 6, maxTier: 3, unreducedChance: 0 });
    expect(never.every((p) => !p.unreduced)).toBe(true);
  });
});
