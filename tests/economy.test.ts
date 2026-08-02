import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  creditsForCages,
  creditsForRun,
  killScore,
  streakMultiplier,
} from '../src/core/economy/economy';

const eco = CONFIG.economy;
const score = CONFIG.score;
const cages = CONFIG.cages;

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

describe('creditsForCages', () => {
  it('pays for solving, before anything about speed', () => {
    // The floor matters: a mode where a slow solve pays nothing would push a
    // stuck player to quit and reroll rather than finish the grid.
    const slow = creditsForCages(cages.parSeconds * 4000, 3, cages);
    expect(slow).toBe(cages.solveCredits);
  });

  it('pays a clean grid more than a scrappy one at the same time', () => {
    const time = 90_000;
    expect(creditsForCages(time, 0, cages) - creditsForCages(time, 2, cages)).toBe(
      cages.cleanCredits,
    );
  });

  it('pays more the faster it was, on a slope that runs out at par', () => {
    expect(creditsForCages(30_000, 0, cages)).toBeGreaterThan(creditsForCages(90_000, 0, cages));
    expect(creditsForCages(cages.parSeconds * 1000, 0, cages)).toBe(
      cages.solveCredits + cages.cleanCredits,
    );
    expect(creditsForCages(0, 0, cages)).toBe(
      cages.solveCredits + cages.cleanCredits + cages.speedCredits,
    );
  });

  it('returns whole numbers', () => {
    expect(Number.isInteger(creditsForCages(41_777, 1, cages))).toBe(true);
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
