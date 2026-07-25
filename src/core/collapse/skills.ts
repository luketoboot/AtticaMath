/**
 * What a collapse says about the player, in the taxonomy's terms.
 *
 * Collapse asks one question — is this fraction this percentage — so it rates
 * one skill, plus a second when the fraction was written unreduced and had to
 * be seen through first. Keeping the mapping here rather than in the scene is
 * what lets it be tested, and what stops the mode inventing skill ids that no
 * other screen knows about.
 *
 * A mismatch is a genuine wrong answer and is rated as one. A wrong-gun shot is
 * not: firing the fraction cannon at a percentage is a fumble, and rating it
 * would teach the model that a player who cannot aim cannot do fractions.
 */
import type { SkillId } from '../skills/taxonomy';

/** Rough difficulty of the pool bands, on the rating scale. */
const TIER_DIFFICULTY: Readonly<Record<number, number>> = {
  1: 430, // halves, quarters, fifths, tenths — the benchmarks
  2: 700, // eighths and twentieths
  3: 900, // sixteenths, twenty-fifths, awkward twentieths
};

/** Reading through 6/8 to reach 75% is a second step, and a harder one. */
const UNREDUCED_PENALTY = 140;

export interface CollapseAttempt {
  skillIds: SkillId[];
  difficulty: number;
}

export function collapseAttempt(tier: number, unreduced: boolean): CollapseAttempt {
  const skillIds: SkillId[] = ['frac.percent'];
  if (unreduced) skillIds.push('frac.reduce');
  const base = TIER_DIFFICULTY[tier] ?? TIER_DIFFICULTY[1]!;
  return { skillIds, difficulty: base + (unreduced ? UNREDUCED_PENALTY : 0) };
}
