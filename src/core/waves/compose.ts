/**
 * Wave composition: ~70% fluent / 20% frontier / 10% decayed review
 * (shares are config tunables), plus stealth placement waves at cold start.
 */
import type { GameConfig } from '../config';
import type { Rng } from '../rng';
import { generateProblem, hasRecipe } from '../generator/generate';
import type { Problem } from '../generator/problem';
import type { SkillTable } from '../skills/rating';
import {
  getSkill,
  skillMatchesFilter,
  SKILLS,
  type SkillFilter,
  type SkillId,
} from '../skills/taxonomy';

/** The unrestricted default: every family, up to four digits, fractions in. */
export const OPEN_FILTER: SkillFilter = { op: 'all', maxDigits: 4, fractions: true };

/** Skills admitted by a filter that also have generator recipes. */
function poolFor(filter: SkillFilter): SkillId[] {
  return SKILLS.filter((s) => skillMatchesFilter(s, filter) && hasRecipe(s.id)).map((s) => s.id);
}

export type SkillCategory = 'fluent' | 'frontier' | 'review';

/**
 * What a meteor is carrying, decided at composition time.
 *
 * `hot` is worth a multiple if killed early and is only ever attached to a
 * frontier problem, so the score chase and the practice schedule point the same
 * way. `carrier` drops a power-up. A meteor is never both: two marks on one
 * rock and the player cannot read either at speed.
 */
export type MeteorPayload = 'none' | 'hot' | 'carrier';

export interface WavePlan {
  wave: number;
  problems: Problem[];
  /** Which bucket each problem was drawn from (for tests and debug). */
  categories: SkillCategory[];
  /** Parallel to `problems`. */
  payloads: MeteorPayload[];
}

/**
 * Mark the hot and carrier meteors for a wave. Hot goes on frontier problems
 * only; carriers take any unmarked slot.
 */
function assignPayloads(
  categories: readonly SkillCategory[],
  cfg: GameConfig,
  rng: Rng,
): MeteorPayload[] {
  const payloads: MeteorPayload[] = categories.map(() => 'none');

  const frontier = categories.flatMap((c, i) => (c === 'frontier' ? [i] : []));
  for (const i of rng.shuffle(frontier).slice(0, cfg.meteors.hotPerWave)) {
    payloads[i] = 'hot';
  }

  const free = payloads.flatMap((p, i) => (p === 'none' ? [i] : []));
  for (const i of rng.shuffle(free).slice(0, cfg.drops.carriersPerWave)) {
    payloads[i] = 'carrier';
  }
  return payloads;
}

/** Classify every known skill for a given wave. */
export function categorizeSkills(
  table: SkillTable,
  wave: number,
  cfg: GameConfig,
  filter: SkillFilter = OPEN_FILTER,
): Record<SkillCategory, SkillId[]> {
  const fluent: SkillId[] = [];
  const frontier: SkillId[] = [];
  const review: SkillId[] = [];

  for (const [id, state] of Object.entries(table)) {
    if (!hasRecipe(id)) continue;
    if (!skillMatchesFilter(getSkill(id), filter)) continue;
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
  filter: SkillFilter = OPEN_FILTER,
): WavePlan {
  const buckets = categorizeSkills(table, wave, cfg, filter);
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
      // Empty table edge case: fall back to the easiest tier within the filter.
      const allowed = poolFor(filter);
      const easiest = Math.min(...allowed.map((id) => getSkill(id).tier));
      pool = allowed.filter((id) => getSkill(id).tier === easiest);
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

  return { wave, problems, categories, payloads: assignPayloads(categories, cfg, rng) };
}

/**
 * Compose a daily-challenge wave: the same problems for everyone, everywhere.
 *
 * This is the one composer that never reads a skill table, and that omission is
 * the whole feature. A shared board only means something if the runs on it were
 * the same run, and an adaptive wave is by definition a different wave for
 * every player — a veteran's wave 5 and a beginner's wave 5 would share a
 * number and nothing else, so comparing their scores would be theatre. The
 * daily therefore ladders difficulty by wave alone, out of a seed the date
 * decides, and the only thing that differs between two players' runs is how
 * they played it.
 *
 * `coachedSkill` is deliberately not a parameter. Overweighting a skill for one
 * player is exactly the drift this composer exists to prevent.
 */
export function composeDailyWave(
  wave: number,
  cfg: GameConfig,
  rng: Rng,
  filter: SkillFilter = cfg.daily.filter,
): WavePlan {
  const allowed = poolFor(filter);
  const tiers = [...new Set(allowed.map((id) => getSkill(id).tier))].sort((a, b) => a - b);
  const count = problemsForWave(wave, cfg);

  // The band's top edge climbs with the wave; its bottom trails behind by a
  // fixed width. Easy skills keep appearing rather than being retired, because
  // a wave made only of your ceiling is an exam, not an arcade run — but they
  // stop being the bulk of it, which is what makes the run escalate.
  const top = Math.min(tiers.length - 1, Math.floor((wave - 1) * cfg.daily.tiersPerWave));
  const bottom = Math.max(0, top - cfg.daily.bandTiers + 1);
  const band = new Set(tiers.slice(bottom, top + 1));
  const topTier = tiers[top];

  let pool = allowed.filter((id) => band.has(getSkill(id).tier));
  if (pool.length === 0) pool = allowed;

  const problems: Problem[] = [];
  const categories: SkillCategory[] = [];
  for (let i = 0; i < count; i++) {
    const skillId = rng.pick(pool);
    problems.push(generateProblem(skillId, rng));
    // Category is relative to the wave's own band rather than to a player:
    // the hardest tier on offer is this wave's frontier. That keeps the hot
    // meteor pointed at the hardest rock on screen, so the score chase still
    // rewards reaching for the difficult one.
    categories.push(getSkill(skillId).tier === topTier ? 'frontier' : 'fluent');
  }

  return { wave, problems, categories, payloads: assignPayloads(categories, cfg, rng) };
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
export function composePlacementWave(
  wave: number,
  cfg: GameConfig,
  rng: Rng,
  filter: SkillFilter = OPEN_FILTER,
): WavePlan {
  const allowed = poolFor(filter);
  const tiersPresent = [...new Set(allowed.map((id) => getSkill(id).tier))].sort((a, b) => a - b);
  const perWave = Math.ceil(tiersPresent.length / cfg.waves.placementWaves);
  const slice = tiersPresent.slice((wave - 1) * perWave, wave * perWave);

  let pool: SkillId[] = allowed.filter((id) => slice.includes(getSkill(id).tier));
  if (pool.length === 0) {
    // Fewer distinct tiers than placement waves: re-probe the hardest tier.
    const hardest = Math.max(...allowed.map((id) => getSkill(id).tier));
    pool = allowed.filter((id) => getSkill(id).tier === hardest);
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
  // Placement stays plain: the sweep is measuring the player, and a bonus
  // target would distort both the timings and the choice of what to shoot.
  return { wave, problems, categories, payloads: problems.map(() => 'none') };
}
