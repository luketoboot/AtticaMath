import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { creditsForRun, killScore, purchase, UPGRADES } from '../src/core/economy/economy';

const eco = CONFIG.economy;
const score = CONFIG.score;

describe('creditsForRun', () => {
  it('pays for score and waves', () => {
    const credits = creditsForRun(
      { score: 10000, wavesCleared: 5, kills: 40, misses: 3, bestStreak: 12 },
      eco,
    );
    expect(credits).toBe(Math.floor(10000 * eco.creditsPerScore + 5 * eco.creditsPerWave));
  });

  it('returns whole numbers', () => {
    const credits = creditsForRun({ score: 333, wavesCleared: 1, kills: 3, misses: 0, bestStreak: 3 }, eco);
    expect(Number.isInteger(credits)).toBe(true);
  });
});

describe('purchase', () => {
  it('deducts price and grants the upgrade', () => {
    const res = purchase('upgrade.hp', 500, [], eco);
    expect(res.ok).toBe(true);
    expect(res.credits).toBe(500 - eco.prices['upgrade.hp']!);
    expect(res.owned).toContain('upgrade.hp');
  });

  it('rejects when broke', () => {
    const res = purchase('upgrade.spread', 10, [], eco);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('insufficient');
    expect(res.credits).toBe(10);
  });

  it('rejects duplicate one-time purchases', () => {
    const res = purchase('upgrade.shield', 9999, ['upgrade.shield'], eco);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('already-owned');
  });

  it('rejects unknown upgrades', () => {
    const res = purchase('upgrade.nope', 9999, [], eco);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unknown-upgrade');
  });

  it('every defined upgrade has a price', () => {
    for (const u of UPGRADES) {
      expect(eco.prices[u.id], `no price for ${u.id}`).toBeGreaterThan(0);
    }
  });
});

describe('killScore', () => {
  it('scales with difficulty', () => {
    expect(killScore(800, 0, false, score)).toBeGreaterThan(killScore(200, 0, false, score));
  });

  it('scales with streak up to the cap', () => {
    const none = killScore(500, 0, false, score);
    const some = killScore(500, 5, false, score);
    const capped = killScore(500, 500, false, score);
    expect(some).toBeGreaterThan(none);
    expect(capped).toBe(killScore(500, 1000, false, score));
  });

  it('pays a speed bonus', () => {
    expect(killScore(500, 0, true, score)).toBeGreaterThan(killScore(500, 0, false, score));
  });
});
