import { describe, expect, it } from 'vitest';
import { opposite, resolveShot, samePercent, type TokenRef } from '../src/core/collapse/targeting';

const frac = (id: number, percent: number): TokenRef => ({ id, kind: 'fraction', percent });
const pct = (id: number, percent: number): TokenRef => ({ id, kind: 'percent', percent });

describe('opposite', () => {
  it('flips the gun', () => {
    expect(opposite('fraction')).toBe('percent');
    expect(opposite('percent')).toBe('fraction');
  });
});

describe('samePercent', () => {
  it('absorbs float noise but not real differences', () => {
    expect(samePercent(28, 28.0000000001)).toBe(true);
    expect(samePercent(12.5, 12.5)).toBe(true);
    expect(samePercent(12.5, 12.6)).toBe(false);
  });
});

describe('wrong gun', () => {
  it('fraction gun does not bite a percentage', () => {
    expect(resolveShot(null, pct(1, 50), 'fraction')).toEqual({ result: 'wrongGun' });
  });

  it('percent gun does not bite a fraction', () => {
    expect(resolveShot(null, frac(1, 50), 'percent')).toEqual({ result: 'wrongGun' });
  });

  it('is checked before anything else, even holding a match', () => {
    // Holding 50%, shooting the matching fraction with the WRONG gun.
    expect(resolveShot(pct(1, 50), frac(2, 50), 'percent')).toEqual({ result: 'wrongGun' });
  });
});

describe('arming', () => {
  it('arms an unheld token shot with its own gun', () => {
    expect(resolveShot(null, frac(1, 50), 'fraction')).toEqual({ result: 'armed' });
    expect(resolveShot(null, pct(1, 50), 'percent')).toEqual({ result: 'armed' });
  });

  it('re-arms when shooting another token of the held type', () => {
    expect(resolveShot(frac(1, 50), frac(2, 25), 'fraction')).toEqual({ result: 'rearmed' });
  });

  it('re-arms harmlessly when shooting the held token again', () => {
    expect(resolveShot(frac(1, 50), frac(1, 50), 'fraction')).toEqual({ result: 'rearmed' });
  });
});

describe('resolving a pair', () => {
  it('collapses on an equal counterpart, from the fraction side', () => {
    expect(resolveShot(frac(1, 50), pct(2, 50), 'percent')).toEqual({ result: 'collapse' });
  });

  it('collapses on an equal counterpart, from the percent side', () => {
    expect(resolveShot(pct(1, 37.5), frac(2, 37.5), 'fraction')).toEqual({ result: 'collapse' });
  });

  it('both arming directions are supported symmetrically', () => {
    const fromFraction = resolveShot(frac(1, 20), pct(2, 20), 'percent');
    const fromPercent = resolveShot(pct(2, 20), frac(1, 20), 'fraction');
    expect(fromFraction).toEqual(fromPercent);
    expect(fromFraction).toEqual({ result: 'collapse' });
  });

  it('reports a mismatch on an unequal counterpart', () => {
    expect(resolveShot(frac(1, 50), pct(2, 25), 'percent')).toEqual({ result: 'mismatch' });
    expect(resolveShot(pct(1, 12.5), frac(2, 87.5), 'fraction')).toEqual({ result: 'mismatch' });
  });

  it('tolerates float drift in stored percentages', () => {
    expect(resolveShot(frac(1, 28.000000000000004), pct(2, 28), 'percent')).toEqual({
      result: 'collapse',
    });
  });
});
