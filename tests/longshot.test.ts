import { describe, expect, it } from 'vitest';
import { longShotBonus, longShotFor } from '../src/core/collapse/longshot';
import { CONFIG } from '../src/core/config';

const cfg = CONFIG.collapse.longShot;

describe('paying for distance', () => {
  it('pays nothing for an ordinary shot', () => {
    expect(longShotFor(0, cfg)).toBeUndefined();
    expect(longShotFor(cfg.tiers[0]!.minDistance - 1, cfg)).toBeUndefined();
    expect(longShotBonus(500, undefined)).toBe(0);
  });

  it('earns the longest tier the shot reaches', () => {
    const [first, second, third] = cfg.tiers;
    expect(longShotFor(first!.minDistance, cfg)?.label).toBe(first!.label);
    expect(longShotFor(second!.minDistance - 1, cfg)?.label).toBe(first!.label);
    expect(longShotFor(second!.minDistance, cfg)?.label).toBe(second!.label);
    expect(longShotFor(third!.minDistance + 5000, cfg)?.label).toBe(third!.label);
  });

  it('reports the tier index, so the callout can climb with it', () => {
    expect(longShotFor(cfg.tiers[0]!.minDistance, cfg)?.tier).toBe(0);
    expect(longShotFor(cfg.tiers[2]!.minDistance, cfg)?.tier).toBe(2);
  });

  it('pays a share of what the collapse already earned', () => {
    // Riding on the chain rather than beside it: a long shot into a hot chain
    // has to be worth more than the same shot cold, or the two systems compete.
    const shot = longShotFor(cfg.tiers[1]!.minDistance, cfg)!;
    expect(longShotBonus(1000, shot)).toBe(Math.round(1000 * shot.bonus));
    expect(longShotBonus(4000, shot)).toBe(4 * longShotBonus(1000, shot));
  });

  it('returns whole points', () => {
    const shot = longShotFor(cfg.tiers[0]!.minDistance, cfg)!;
    expect(Number.isInteger(longShotBonus(333, shot))).toBe(true);
  });

  it('survives a distance that is not a number', () => {
    expect(longShotFor(Number.NaN, cfg)).toBeUndefined();
    expect(longShotFor(Number.POSITIVE_INFINITY, cfg)?.tier).toBe(cfg.tiers.length - 1);
  });
});

describe('the tier table', () => {
  it('climbs in both distance and reward', () => {
    for (let i = 1; i < cfg.tiers.length; i++) {
      expect(cfg.tiers[i]!.minDistance).toBeGreaterThan(cfg.tiers[i - 1]!.minDistance);
      expect(cfg.tiers[i]!.bonus).toBeGreaterThan(cfg.tiers[i - 1]!.bonus);
    }
  });

  it('stays inside what the gun can actually reach', () => {
    // A tier past the bolt's own range would be unearnable, and nothing in the
    // game would ever say so.
    const c = CONFIG.collapse;
    const range = c.projectileSpeed * c.projectileLifeSeconds;
    for (const tier of cfg.tiers) {
      expect(tier.minDistance, `${tier.label} is beyond the bolt's range`).toBeLessThan(range);
    }
    // ...and the top tier should be near it, or "DEAD EYE" is just another
    // long shot rather than the edge of the envelope.
    expect(cfg.tiers[cfg.tiers.length - 1]!.minDistance).toBeGreaterThan(range * 0.8);
  });

  it('names every tier', () => {
    for (const tier of cfg.tiers) expect(tier.label.length).toBeGreaterThan(0);
  });
});
