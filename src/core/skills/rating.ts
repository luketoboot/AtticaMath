/**
 * Elo-style rating engine with response-time weighting. Pure and deterministic.
 */
import type { RatingConfig } from '../config';
import type { SkillId } from './taxonomy';

export interface SkillState {
  rating: number;
  attempts: number;
  /**
   * Correct answers only. Mastery counts these rather than attempts, so
   * repeatedly missing a skill can never grind out a milestone.
   */
  correct: number;
  /**
   * Running average of answer speed, as a multiple of the target latency for
   * the difficulty attempted: 1 is exactly on target, 2 is twice as fast.
   *
   * Rating alone cannot carry this. A skill whose base difficulty sits below
   * the seed rating starts above its own mastery line, so for easy facts the
   * rating gate is satisfied before the player has answered anything — the
   * clock is the only remaining evidence that a fact is recalled rather than
   * worked out. Zero means no correct answer has been timed yet.
   */
  fluency: number;
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
  /**
   * The clock on this attempt carries no information — set by modes that are
   * deliberately not races, like Exercise. Such an attempt still moves the
   * rating, but at its unscaled size, and it leaves fluency untouched: a mode
   * that invites the player to take their time cannot also read their pace as
   * evidence they are slow.
   */
  untimed?: boolean;
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

/**
 * How fast one answer was, relative to what that difficulty should take.
 * Uncapped by the rating engine's speed bounds — those exist to limit how far
 * one answer can shove a rating, whereas fluency is the raw measurement.
 */
export function fluencySample(responseMs: number, targetMs: number, cfg: RatingConfig): number {
  if (responseMs <= 0) return cfg.maxFluencySample;
  return Math.min(cfg.maxFluencySample, targetMs / responseMs);
}

/** Apply one attempt to one skill state, returning the new state. Pure. */
export function updateSkill(state: SkillState, attempt: AttemptResult, cfg: RatingConfig): SkillState {
  const provisional = state.attempts < cfg.provisionalAttempts;
  const k = cfg.kFactor * (provisional ? cfg.provisionalKMultiplier : 1);
  const expected = expectedScore(state.rating, attempt.difficulty, cfg);
  const actual = attempt.correct ? 1 : 0;
  const target = targetLatencyMs(attempt.difficulty, cfg);
  const timed = attempt.untimed !== true;
  let delta = k * (actual - expected);
  if (attempt.correct && timed) delta *= speedFactor(attempt.responseMs, target, cfg);
  const rating = Math.min(cfg.maxRating, Math.max(cfg.minRating, state.rating + delta));

  // Only correct answers carry speed information: the clock on a miss measures
  // how long the player stared at it, which says nothing about recall.
  let fluency = state.fluency;
  if (attempt.correct && timed) {
    const sample = fluencySample(attempt.responseMs, target, cfg);
    // Seed on the first timed answer rather than easing up from zero, or a
    // skill would spend its opening dozen answers climbing out of a hole that
    // reflects no evidence at all.
    fluency = state.correct === 0 ? sample : fluency + cfg.fluencyAlpha * (sample - fluency);
  }

  return {
    rating,
    attempts: state.attempts + 1,
    correct: state.correct + (attempt.correct ? 1 : 0),
    fluency,
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
  return { rating: cfg.initialRating, attempts: 0, correct: 0, fluency: 0, lastAttemptWave: -1 };
}

export function createSkillTable(ids: readonly SkillId[], cfg: RatingConfig): SkillTable {
  const table: SkillTable = {};
  for (const id of ids) table[id] = freshSkillState(cfg);
  return table;
}
