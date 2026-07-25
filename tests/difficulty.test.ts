import { describe, expect, it } from 'vitest';
import { applyDifficulty, CONFIG, type DifficultyId } from '../src/core/config';

const IDS = CONFIG.difficulty.levels.map((l) => l.id);

describe('difficulty levels', () => {
  it('declares three distinct levels and a valid fallback', () => {
    expect(IDS).toHaveLength(3);
    expect(new Set(IDS).size).toBe(3);
    expect(IDS).toContain(CONFIG.difficulty.fallback);
  });

  it('euclid is the identity: same game as an unadjusted config', () => {
    const tuned = applyDifficulty(CONFIG, 'euclid');
    expect(tuned.meteors).toEqual(CONFIG.meteors);
    expect(tuned.waves).toEqual(CONFIG.waves);
  });

  it('never touches anything but pacing', () => {
    for (const id of IDS) {
      const tuned = applyDifficulty(CONFIG, id);
      // The adaptive model owns WHAT the problems are; pace owns only when.
      expect(tuned.rating).toBe(CONFIG.rating);
      expect(tuned.score).toBe(CONFIG.score);
      expect(tuned.economy).toBe(CONFIG.economy);
      expect(tuned.meteors.baseHp).toBe(CONFIG.meteors.baseHp);
      expect(tuned.waves.fluentShare).toBe(CONFIG.waves.fluentShare);
      expect(tuned.waves.placementWaves).toBe(CONFIG.waves.placementWaves);
    }
  });

  it('each step up falls faster, spawns tighter, ramps harder, throws more', () => {
    const order: DifficultyId[] = ['euclid', 'gauss', 'euler'];
    for (let i = 1; i < order.length; i++) {
      const softer = applyDifficulty(CONFIG, order[i - 1]!);
      const harder = applyDifficulty(CONFIG, order[i]!);
      expect(harder.meteors.baseFallSeconds).toBeLessThan(softer.meteors.baseFallSeconds);
      expect(harder.meteors.minFallSeconds).toBeLessThan(softer.meteors.minFallSeconds);
      expect(harder.meteors.baseSpawnGapSeconds).toBeLessThan(softer.meteors.baseSpawnGapSeconds);
      expect(harder.meteors.minSpawnGapSeconds).toBeLessThan(softer.meteors.minSpawnGapSeconds);
      // Ramp factors are per-wave multipliers below 1 — smaller compounds faster.
      expect(harder.meteors.fallSpeedupPerWave).toBeLessThan(softer.meteors.fallSpeedupPerWave);
      expect(harder.meteors.spawnGapShrinkPerWave).toBeLessThan(
        softer.meteors.spawnGapShrinkPerWave,
      );
      expect(harder.waves.baseProblemsPerWave).toBeGreaterThanOrEqual(
        softer.waves.baseProblemsPerWave,
      );
      expect(harder.waves.problemsPerWaveGrowth).toBeGreaterThanOrEqual(
        softer.waves.problemsPerWaveGrowth,
      );
    }
  });

  it('keeps every pacing number sane at the hardest level', () => {
    const tuned = applyDifficulty(CONFIG, 'euler').meteors;
    expect(tuned.minFallSeconds).toBeGreaterThan(1); // typeable at all
    expect(tuned.minSpawnGapSeconds).toBeGreaterThan(0.2);
    expect(tuned.fallSpeedupPerWave).toBeGreaterThan(0.5);
    expect(tuned.baseFallSeconds).toBeGreaterThan(tuned.minFallSeconds);
  });

  it('an unknown id degrades to the first level rather than exploding', () => {
    const tuned = applyDifficulty(CONFIG, 'archimedes' as DifficultyId);
    expect(tuned.meteors).toEqual(applyDifficulty(CONFIG, IDS[0]!).meteors);
  });
});
