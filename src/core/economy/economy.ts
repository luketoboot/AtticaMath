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

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  /** MVP upgrades are one-time purchases. */
  repeatable: boolean;
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'upgrade.hp',
    name: 'REINFORCED CORE',
    description: '+2 base HP. The ground forgives more.',
    repeatable: false,
  },
  {
    id: 'upgrade.slowfield',
    name: 'SLOW FIELD',
    description: 'Meteors fall 15% slower. Time is a weapon.',
    repeatable: false,
  },
  {
    id: 'upgrade.shield',
    name: 'MISS SHIELD',
    description: 'First meteor to land each run deals no damage.',
    repeatable: false,
  },
  {
    id: 'upgrade.spread',
    name: 'SPREAD CANNON',
    description: 'A fired answer hits every meteor that shares it.',
    repeatable: false,
  },
] as const;

export function creditsForRun(stats: RunStats, cfg: EconomyConfig): number {
  return Math.floor(stats.score * cfg.creditsPerScore + stats.wavesCleared * cfg.creditsPerWave);
}

export interface PurchaseResult {
  ok: boolean;
  credits: number;
  owned: string[];
  reason?: 'insufficient' | 'already-owned' | 'unknown-upgrade';
}

export function purchase(
  upgradeId: string,
  credits: number,
  owned: readonly string[],
  cfg: EconomyConfig,
): PurchaseResult {
  const price = cfg.prices[upgradeId];
  const def = UPGRADES.find((u) => u.id === upgradeId);
  if (price === undefined || !def) {
    return { ok: false, credits, owned: [...owned], reason: 'unknown-upgrade' };
  }
  if (!def.repeatable && owned.includes(upgradeId)) {
    return { ok: false, credits, owned: [...owned], reason: 'already-owned' };
  }
  if (credits < price) {
    return { ok: false, credits, owned: [...owned], reason: 'insufficient' };
  }
  return { ok: true, credits: credits - price, owned: [...owned, upgradeId] };
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
