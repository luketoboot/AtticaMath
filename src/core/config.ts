/**
 * Every tunable in the game lives here. No magic numbers scattered in code.
 */

export interface RatingConfig {
  /** Starting rating for every skill before placement. */
  initialRating: number;
  /** Rating floor/ceiling. */
  minRating: number;
  maxRating: number;
  /** Base K factor for rating updates. */
  kFactor: number;
  /** K multiplier while a skill has few attempts (fast convergence early). */
  provisionalKMultiplier: number;
  /** Attempts below which a skill is considered provisional. */
  provisionalAttempts: number;
  /** Elo logistic scale (rating gap that maps to ~10x expected odds). */
  logisticScale: number;
  /** Speed factor bounds applied to correct-answer updates. */
  minSpeedFactor: number;
  maxSpeedFactor: number;
  /** Target answer latency (ms) per difficulty band; bands are difficulty thresholds. */
  latencyBands: readonly { maxDifficulty: number; targetMs: number }[];
  /** Fallback target latency for anything above the last band. */
  fallbackTargetMs: number;
}

export interface WaveConfig {
  /** Portion of a wave drawn from fluent skills (rating comfortably above problem difficulty). */
  fluentShare: number;
  /** Portion drawn from frontier skills (near the rating edge). */
  frontierShare: number;
  /** Portion drawn from decayed skills (not seen recently). */
  reviewShare: number;
  /** Problems per wave, ramping over the run. */
  baseProblemsPerWave: number;
  problemsPerWaveGrowth: number;
  maxProblemsPerWave: number;
  /** Rating margin defining "fluent": rating - difficulty >= this. */
  fluentMargin: number;
  /** Rating window defining "frontier": |rating - difficulty| < this. */
  frontierWindow: number;
  /** A skill counts as decayed if not attempted in this many waves. */
  decayedAfterWaves: number;
  /** Number of stealth placement waves at cold start. */
  placementWaves: number;
  /** Problems per placement wave. */
  placementProblems: number;
  /** Weight multiplier applied to the coached skill in the wave after a tip. */
  coachedSkillWeight: number;
}

export interface MeteorConfig {
  /** Seconds a meteor takes to cross the screen at wave 1, difficulty floor. */
  baseFallSeconds: number;
  /** Fall time shrinks by this factor per wave (compounding). */
  fallSpeedupPerWave: number;
  /** Minimum fall seconds regardless of wave. */
  minFallSeconds: number;
  /** Extra fall time granted per difficulty point above player's rating (harder = slower). */
  difficultySlowdownMs: number;
  /** Delay between meteor spawns within a wave (seconds). */
  baseSpawnGapSeconds: number;
  minSpawnGapSeconds: number;
  spawnGapShrinkPerWave: number;
  /** Base HP; meteors that land subtract 1. */
  baseHp: number;
  /** Breather between waves (seconds). */
  breatherSeconds: number;
  /** Max meteors simultaneously on screen. */
  maxConcurrentMeteors: number;
}

export interface ScoreConfig {
  /** Base points for a kill. */
  killBase: number;
  /** Extra points per difficulty point of the problem. */
  difficultyBonus: number;
  /** Streak multiplier step per consecutive kill (1.0, 1.1, 1.2, ...). */
  streakStep: number;
  maxStreakMultiplier: number;
  /** Bonus multiplier for answering faster than target latency. */
  speedBonusMultiplier: number;
}

export interface EconomyConfig {
  /** Currency per point of score, end of run. */
  creditsPerScore: number;
  /** Flat bonus per wave survived. */
  creditsPerWave: number;
  /** Purchasable upgrade prices keyed by upgrade id. */
  prices: Readonly<Record<string, number>>;
}

export interface GameConfig {
  rating: RatingConfig;
  waves: WaveConfig;
  meteors: MeteorConfig;
  score: ScoreConfig;
  economy: EconomyConfig;
}

export const CONFIG: GameConfig = {
  rating: {
    initialRating: 500,
    minRating: 0,
    maxRating: 3000,
    kFactor: 24,
    provisionalKMultiplier: 2.5,
    provisionalAttempts: 8,
    logisticScale: 400,
    minSpeedFactor: 0.4,
    maxSpeedFactor: 1.6,
    latencyBands: [
      { maxDifficulty: 400, targetMs: 2500 },
      { maxDifficulty: 700, targetMs: 4000 },
      { maxDifficulty: 1000, targetMs: 6000 },
      { maxDifficulty: 1400, targetMs: 9000 },
    ],
    fallbackTargetMs: 12000,
  },
  waves: {
    fluentShare: 0.7,
    frontierShare: 0.2,
    reviewShare: 0.1,
    baseProblemsPerWave: 8,
    problemsPerWaveGrowth: 1,
    maxProblemsPerWave: 16,
    fluentMargin: 150,
    frontierWindow: 100,
    decayedAfterWaves: 6,
    placementWaves: 3,
    placementProblems: 8,
    coachedSkillWeight: 3,
  },
  meteors: {
    baseFallSeconds: 14,
    fallSpeedupPerWave: 0.94,
    minFallSeconds: 6,
    difficultySlowdownMs: 8,
    baseSpawnGapSeconds: 3.2,
    minSpawnGapSeconds: 1.4,
    spawnGapShrinkPerWave: 0.93,
    baseHp: 5,
    breatherSeconds: 6,
    maxConcurrentMeteors: 4,
  },
  score: {
    killBase: 100,
    difficultyBonus: 0.25,
    streakStep: 0.1,
    maxStreakMultiplier: 3,
    speedBonusMultiplier: 1.5,
  },
  economy: {
    creditsPerScore: 0.01,
    creditsPerWave: 15,
    prices: {
      'upgrade.hp': 200,
      'upgrade.slowfield': 350,
      'upgrade.shield': 400,
      'upgrade.spread': 500,
    },
  },
};
