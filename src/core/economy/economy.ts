/**
 * Currency and upgrades. Pure math; prices and rates come from config.
 */
import type { EconomyConfig, ScoreConfig } from '../config';

export interface RunStats {
  score: number;
  wavesCleared: number;
  kills: number;
  misses: number;
  bestStreak: number;
}

/**
 * Credits earned by a run.
 *
 * Credits buy cosmetics and nothing else — see core/cosmetics. Nothing
 * purchasable touches the numbers below, which is what keeps two runs
 * comparable on a board.
 */
export function creditsForRun(stats: RunStats, cfg: EconomyConfig): number {
  return Math.floor(stats.score * cfg.creditsPerScore + stats.wavesCleared * cfg.creditsPerWave);
}

/**
 * Score for one kill.
 *
 * The multiplier is passed in rather than derived from a streak, because the
 * modes disagree about where it comes from: meteor mode uses the tiered combo
 * meter, the others still run a plain streak through `streakMultiplier`.
 */
export function killScore(
  difficulty: number,
  multiplier: number,
  beatTargetLatency: boolean,
  cfg: ScoreConfig,
): number {
  const speedMult = beatTargetLatency ? cfg.speedBonusMultiplier : 1;
  return Math.floor((cfg.killBase + difficulty * cfg.difficultyBonus) * multiplier * speedMult);
}

/** Smooth streak multiplier, capped. Used by the modes without a combo meter. */
export function streakMultiplier(streak: number, cfg: ScoreConfig): number {
  return Math.min(cfg.maxStreakMultiplier, 1 + streak * cfg.streakStep);
}
