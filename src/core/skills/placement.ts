/**
 * Cold-start seeding. During placement waves, attempts update ratings normally
 * (with the provisional K multiplier). Afterwards, this pass infers a "falloff
 * tier" from where accuracy and response times degraded, and seeds every
 * UNATTEMPTED skill relative to that tier so the first real waves land close.
 */
import type { GameConfig } from '../config';
import { freshSkillState, targetLatencyMs } from './rating';
import type { SkillTable } from './rating';
import { getSkill, maxTier, SKILLS } from './taxonomy';

export interface PlacementAttempt {
  skillId: string;
  difficulty: number;
  correct: boolean;
  responseMs: number;
}

/** Per-tier performance score in [0,1]: accuracy weighted by speed vs target. */
function tierScores(attempts: readonly PlacementAttempt[], cfg: GameConfig): Map<number, number> {
  const sums = new Map<number, { total: number; n: number }>();
  for (const a of attempts) {
    const tier = getSkill(a.skillId).tier;
    const target = targetLatencyMs(a.difficulty, cfg.rating);
    const speed = Math.min(1, target / Math.max(1, a.responseMs));
    const score = a.correct ? 0.5 + 0.5 * speed : 0;
    const cur = sums.get(tier) ?? { total: 0, n: 0 };
    cur.total += score;
    cur.n += 1;
    sums.set(tier, cur);
  }
  const out = new Map<number, number>();
  for (const [tier, { total, n }] of sums) out.set(tier, total / n);
  return out;
}

/**
 * The falloff tier: first tier whose score drops below 0.5
 * (i.e. player is missing or grinding). If none, one past the highest tier.
 */
export function findFalloffTier(attempts: readonly PlacementAttempt[], cfg: GameConfig): number {
  const scores = tierScores(attempts, cfg);
  for (let t = 0; t <= maxTier(); t++) {
    const s = scores.get(t);
    if (s !== undefined && s < 0.5) return t;
  }
  return maxTier() + 1;
}

/**
 * Patch a table from before the taxonomy grew. Skills added to the game after
 * a profile finished placement are not keys in its table, and composeWave only
 * buckets what the table contains — so without this, a new skill is unreachable
 * for every existing profile, forever, and its Brain Scan row reads NO SIGNAL.
 *
 * The falloff tier is re-inferred from the ratings already in the table (the
 * profile IS a placement result, just an older one), and only the missing ids
 * are written. Idempotent: a table that already covers the taxonomy is
 * returned unchanged.
 */
export function reconcileTable(table: SkillTable, cfg: GameConfig): SkillTable {
  const missing = SKILLS.filter((s) => table[s.id] === undefined);
  if (missing.length === 0) return table;

  // Mean rating-vs-base gap per tier, over everything the table knows.
  const gaps = new Map<number, { total: number; n: number }>();
  for (const [id, state] of Object.entries(table)) {
    const skill = SKILLS.find((s) => s.id === id);
    if (!skill) continue; // a skill retired from the taxonomy rates nothing
    const cur = gaps.get(skill.tier) ?? { total: 0, n: 0 };
    cur.total += state.rating - skill.baseDifficulty;
    cur.n += 1;
    gaps.set(skill.tier, cur);
  }

  // First tier the profile sits below par in; an empty table pins it to 0 so a
  // profile with no signal seeds everything at or under base, never fluent.
  let falloff = gaps.size === 0 ? 0 : maxTier() + 1;
  for (let t = 0; t <= maxTier(); t++) {
    const g = gaps.get(t);
    if (g !== undefined && g.total / g.n < 0) {
      falloff = t;
      break;
    }
  }

  const next: SkillTable = { ...table };
  for (const skill of missing) {
    let rating: number;
    if (skill.tier < falloff) {
      rating = skill.baseDifficulty + cfg.waves.fluentMargin;
    } else if (skill.tier === falloff) {
      rating = skill.baseDifficulty;
    } else {
      rating = Math.max(cfg.rating.minRating, skill.baseDifficulty - cfg.waves.fluentMargin);
    }
    next[skill.id] = { ...freshSkillState(cfg.rating), rating };
  }
  return next;
}

/** Seed unattempted skills based on the falloff tier. Attempted skills keep their earned ratings. */
export function seedFromPlacement(
  table: SkillTable,
  attempts: readonly PlacementAttempt[],
  cfg: GameConfig,
): SkillTable {
  const falloff = findFalloffTier(attempts, cfg);
  const next: SkillTable = { ...table };
  for (const skill of SKILLS) {
    const state = next[skill.id];
    if (state && state.attempts > 0) continue;
    let rating: number;
    if (skill.tier < falloff) {
      rating = skill.baseDifficulty + cfg.waves.fluentMargin;
    } else if (skill.tier === falloff) {
      rating = skill.baseDifficulty;
    } else {
      rating = Math.max(cfg.rating.minRating, skill.baseDifficulty - cfg.waves.fluentMargin);
    }
    next[skill.id] = { ...freshSkillState(cfg.rating), rating };
  }
  return next;
}
