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
 * Credits for one solved CAGES grid.
 *
 * The mode ranks on time, so `creditsForRun` cannot be used: it pays by score,
 * and a score that is a duration would pay most to whoever was slowest. Solving
 * is the bulk of it, being clean is worth real money, and speed pays on a slope
 * that runs out at par rather than a cliff — so a player who takes their time
 * over a hard grid still gets paid for finishing it.
 */
export function creditsForCages(
  timeMs: number,
  mistakes: number,
  cfg: { solveCredits: number; cleanCredits: number; parSeconds: number; speedCredits: number },
): number {
  const seconds = Math.max(0, timeMs) / 1000;
  const speed = Math.max(0, 1 - seconds / cfg.parSeconds) * cfg.speedCredits;
  return Math.floor(cfg.solveCredits + (mistakes === 0 ? cfg.cleanCredits : 0) + speed);
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
