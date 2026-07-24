/**
 * Wave composition: ~70% fluent / 20% frontier / 10% decayed review
 * (shares are config tunables), plus stealth placement waves at cold start.
 */
import type { GameConfig } from '../config';
import type { Rng } from '../rng';
import { generateProblem, hasRecipe } from '../generator/generate';
import type { Problem } from '../generator/problem';
import type { SkillTable } from '../skills/rating';
import { getSkill, maxTier, skillsInTier, type SkillId } from '../skills/taxonomy';

export type SkillCategory = 'fluent' | 'frontier' | 'review';

export interface WavePlan {
  wave: number;
  problems: Problem[];
  /** Which bucket each problem was drawn from (for tests and debug). */
  categories: SkillCategory[];
}

/** Classify every known skill for a given wave. */
export function categorizeSkills(
  table: SkillTable,
  wave: number,
  cfg: GameConfig,
): Record<SkillCategory, SkillId[]> {
  const fluent: SkillId[] = [];
  const frontier: SkillId[] = [];
  const review: SkillId[] = [];

  for (const [id, state] of Object.entries(table)) {
    if (!hasRecipe(id)) continue;
    const gap = state.rating - getSkill(id).baseDifficulty;
    const decayed =
      state.attempts > 0 && wave - state.lastAttemptWave >= cfg.waves.decayedAfterWaves;
    if (decayed) review.push(id);
    else if (gap >= cfg.waves.fluentMargin) fluent.push(id);
    else if (gap > -cfg.waves.frontierWindow) frontier.push(id);
    // Skills far below rating are excluded until frontier progress pulls them in.
  }
  return { fluent, frontier, review };
}

function problemsForWave(wave: number, cfg: GameConfig): number {
  const n = cfg.waves.baseProblemsPerWave + (wave - 1) * cfg.waves.problemsPerWaveGrowth;
  return Math.min(cfg.waves.maxProblemsPerWave, n);
}

/**
 * Compose a normal (post-placement) wave.
 * coachedSkill, if present, is overweighted per config.
 */
export function composeWave(
  table: SkillTable,
  wave: number,
  cfg: GameConfig,
  rng: Rng,
  coachedSkill?: SkillId,
): WavePlan {
  const buckets = categorizeSkills(table, wave, cfg);
  const count = problemsForWave(wave, cfg);
  const problems: Problem[] = [];
  const categories: SkillCategory[] = [];

  const order: SkillCategory[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng.next();
    if (r < cfg.waves.fluentShare) order.push('fluent');
    else if (r < cfg.waves.fluentShare + cfg.waves.frontierShare) order.push('frontier');
    else order.push('review');
  }

  const fallback: Record<SkillCategory, SkillCategory[]> = {
    fluent: ['fluent', 'frontier', 'review'],
    frontier: ['frontier', 'fluent', 'review'],
    review: ['review', 'frontier', 'fluent'],
  };

  for (const want of order) {
    let pool: SkillId[] = [];
    let used: SkillCategory = want;
    for (const cat of fallback[want]) {
      if (buckets[cat].length > 0) {
        pool = buckets[cat];
        used = cat;
        break;
      }
    }
    if (pool.length === 0) {
      // Empty table edge case: fall back to tier-0 skills.
      pool = skillsInTier(0).map((s) => s.id);
      used = 'frontier';
    }
    const weighted =
      coachedSkill && pool.includes(coachedSkill)
        ? pool.concat(Array(cfg.waves.coachedSkillWeight - 1).fill(coachedSkill))
        : pool;
    const skillId = rng.pick(weighted);
    problems.push(generateProblem(skillId, rng));
    categories.push(used);
  }

  return { wave, problems, categories };
}

/** True while the profile is still in the stealth placement sweep. */
export function isPlacementWave(wave: number, cfg: GameConfig): boolean {
  return wave <= cfg.waves.placementWaves;
}

/**
 * Placement wave: sweep difficulty tiers from trivial to hard across the
 * configured number of placement waves. Wave 1 probes the lowest tiers,
 * the final placement wave probes the highest.
 */
export function composePlacementWave(wave: number, cfg: GameConfig, rng: Rng): WavePlan {
  const tiers = maxTier() + 1;
  const perWave = Math.ceil(tiers / cfg.waves.placementWaves);
  const firstTier = (wave - 1) * perWave;
  const lastTier = Math.min(tiers - 1, firstTier + perWave - 1);

  const pool: SkillId[] = [];
  for (let t = firstTier; t <= lastTier; t++) {
    for (const s of skillsInTier(t)) if (hasRecipe(s.id)) pool.push(s.id);
  }

  const problems: Problem[] = [];
  const categories: SkillCategory[] = [];
  const shuffled = rng.shuffle(pool);
  for (let i = 0; i < cfg.waves.placementProblems; i++) {
    const skillId = shuffled[i % shuffled.length];
    if (skillId === undefined) break;
    problems.push(generateProblem(skillId, rng));
    categories.push('frontier');
  }
  return { wave, problems, categories };
}
