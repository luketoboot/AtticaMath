/**
 * Elo-style rating engine with response-time weighting. Pure and deterministic.
 */
import type { RatingConfig } from '../config';
import type { SkillId } from './taxonomy';

export interface SkillState {
  rating: number;
  attempts: number;
  /** Wave counter of the last attempt (monotonic across a profile's lifetime). */
  lastAttemptWave: number;
}

export type SkillTable = Record<SkillId, SkillState>;

export interface AttemptResult {
  correct: boolean;
  /** Time from problem visible to correct answer (or to miss/landing). */
  responseMs: number;
  /** Difficulty of the problem attempted. */
  difficulty: number;
  /** Global wave counter at time of attempt. */
  wave: number;
}

/** Probability the player (rating r) answers a problem of given difficulty correctly. */
export function expectedScore(rating: number, difficulty: number, cfg: RatingConfig): number {
  return 1 / (1 + Math.pow(10, (difficulty - rating) / cfg.logisticScale));
}

/** Target latency for a difficulty, from configured bands. */
export function targetLatencyMs(difficulty: number, cfg: RatingConfig): number {
  for (const band of cfg.latencyBands) {
    if (difficulty <= band.maxDifficulty) return band.targetMs;
  }
  return cfg.fallbackTargetMs;
}

/**
 * Speed factor scales the magnitude of a *correct* update.
 * Faster than target -> up to maxSpeedFactor; slower -> down to minSpeedFactor.
 */
export function speedFactor(responseMs: number, targetMs: number, cfg: RatingConfig): number {
  if (responseMs <= 0) return cfg.maxSpeedFactor;
  const ratio = targetMs / responseMs;
  return Math.min(cfg.maxSpeedFactor, Math.max(cfg.minSpeedFactor, ratio));
}

/** Apply one attempt to one skill state, returning the new state. Pure. */
export function updateSkill(state: SkillState, attempt: AttemptResult, cfg: RatingConfig): SkillState {
  const provisional = state.attempts < cfg.provisionalAttempts;
  const k = cfg.kFactor * (provisional ? cfg.provisionalKMultiplier : 1);
  const expected = expectedScore(state.rating, attempt.difficulty, cfg);
  const actual = attempt.correct ? 1 : 0;
  let delta = k * (actual - expected);
  if (attempt.correct) {
    delta *= speedFactor(attempt.responseMs, targetLatencyMs(attempt.difficulty, cfg), cfg);
  }
  const rating = Math.min(cfg.maxRating, Math.max(cfg.minRating, state.rating + delta));
  return {
    rating,
    attempts: state.attempts + 1,
    lastAttemptWave: attempt.wave,
  };
}

/** Apply one attempt to every component skill of a problem. Returns a new table. */
export function applyAttempt(
  table: SkillTable,
  skillIds: readonly SkillId[],
  attempt: AttemptResult,
  cfg: RatingConfig,
): SkillTable {
  const next: SkillTable = { ...table };
  for (const id of skillIds) {
    const state = next[id] ?? freshSkillState(cfg);
    next[id] = updateSkill(state, attempt, cfg);
  }
  return next;
}

export function freshSkillState(cfg: RatingConfig): SkillState {
  return { rating: cfg.initialRating, attempts: 0, lastAttemptWave: -1 };
}

export function createSkillTable(ids: readonly SkillId[], cfg: RatingConfig): SkillTable {
  const table: SkillTable = {};
  for (const id of ids) table[id] = freshSkillState(cfg);
  return table;
}
