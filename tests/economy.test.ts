import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { creditsForRun, killScore, streakMultiplier } from '../src/core/economy/economy';

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

describe('killScore', () => {
  it('scales with difficulty', () => {
    expect(killScore(800, 1, false, score)).toBeGreaterThan(killScore(200, 1, false, score));
  });

  it('scales with the multiplier it is handed', () => {
    expect(killScore(500, 3, false, score)).toBe(3 * killScore(500, 1, false, score));
  });

  it('pays a speed bonus', () => {
    expect(killScore(500, 1, true, score)).toBeGreaterThan(killScore(500, 1, false, score));
  });
});

describe('streakMultiplier', () => {
  it('climbs with the streak', () => {
    expect(streakMultiplier(5, score)).toBeGreaterThan(streakMultiplier(0, score));
  });

  it('caps', () => {
    expect(streakMultiplier(500, score)).toBe(score.maxStreakMultiplier);
    expect(streakMultiplier(1000, score)).toBe(streakMultiplier(500, score));
  });
});
