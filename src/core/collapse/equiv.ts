/**
 * Collapse: fraction ↔ percent equivalence.
 *
 * The mode's whole teaching claim is recognition, not computation — a player
 * should come to see 3/8 and 37.5% as the same object. So the pure layer owns
 * two things: what counts as a match, and how to build a wave whose pairs are
 * unambiguous.
 *
 * Only terminating equivalents are in the pool. 1/3 is 33.333…%, and a mode
 * built on "push it into the exact match" cannot afford a value that has no
 * exact match to push into. Repeating fractions want a different mechanic.
 */
import type { Rng } from '../rng';

export interface Fraction {
  num: number;
  den: number;
}

export interface CollapsePair {
  fraction: Fraction;
  percent: number;
}

/** A pair as fielded in a wave: which band it came from, and how it is written. */
export interface WavePair extends CollapsePair {
  /** Pool tier of the underlying pair, not of the wave that fielded it. */
  tier: number;
  /** True when the fraction was scaled up, e.g. 2/4 standing in for 1/2. */
  unreduced: boolean;
}

export interface PoolEntry extends CollapsePair {
  /** 1 = benchmark, 2 = common, 3 = awkward. Difficulty band. */
  tier: number;
}

/**
 * Source pairs in lowest terms. Tier 1 is the set fluent adults have memorised
 * and everyone else does not — the real gap this mode aims at.
 */
const POOL: readonly PoolEntry[] = [
  // Tier 1 — benchmarks.
  { fraction: { num: 1, den: 2 }, percent: 50, tier: 1 },
  { fraction: { num: 1, den: 4 }, percent: 25, tier: 1 },
  { fraction: { num: 3, den: 4 }, percent: 75, tier: 1 },
  { fraction: { num: 1, den: 5 }, percent: 20, tier: 1 },
  { fraction: { num: 2, den: 5 }, percent: 40, tier: 1 },
  { fraction: { num: 3, den: 5 }, percent: 60, tier: 1 },
  { fraction: { num: 4, den: 5 }, percent: 80, tier: 1 },
  { fraction: { num: 1, den: 10 }, percent: 10, tier: 1 },
  { fraction: { num: 3, den: 10 }, percent: 30, tier: 1 },
  { fraction: { num: 7, den: 10 }, percent: 70, tier: 1 },
  { fraction: { num: 9, den: 10 }, percent: 90, tier: 1 },
  // Tier 2 — eighths and twentieths.
  { fraction: { num: 1, den: 8 }, percent: 12.5, tier: 2 },
  { fraction: { num: 3, den: 8 }, percent: 37.5, tier: 2 },
  { fraction: { num: 5, den: 8 }, percent: 62.5, tier: 2 },
  { fraction: { num: 7, den: 8 }, percent: 87.5, tier: 2 },
  { fraction: { num: 1, den: 20 }, percent: 5, tier: 2 },
  { fraction: { num: 3, den: 20 }, percent: 15, tier: 2 },
  { fraction: { num: 7, den: 20 }, percent: 35, tier: 2 },
  { fraction: { num: 9, den: 20 }, percent: 45, tier: 2 },
  // Tier 3 — awkward denominators.
  { fraction: { num: 11, den: 20 }, percent: 55, tier: 3 },
  { fraction: { num: 13, den: 20 }, percent: 65, tier: 3 },
  { fraction: { num: 17, den: 20 }, percent: 85, tier: 3 },
  { fraction: { num: 19, den: 20 }, percent: 95, tier: 3 },
  { fraction: { num: 1, den: 16 }, percent: 6.25, tier: 3 },
  { fraction: { num: 3, den: 16 }, percent: 18.75, tier: 3 },
  { fraction: { num: 5, den: 16 }, percent: 31.25, tier: 3 },
  { fraction: { num: 1, den: 25 }, percent: 4, tier: 3 },
  { fraction: { num: 7, den: 25 }, percent: 28, tier: 3 },
  { fraction: { num: 9, den: 25 }, percent: 36, tier: 3 },
];

/** Every pool value is a terminating decimal, so exact compare needs only slack for float noise. */
const EPSILON = 1e-9;

/**
 * The pairs, for anything that needs them outside this mode.
 *
 * Meteor Defense generates fraction→percent problems from the same list rather
 * than keeping a second one: two pools would drift, and a player drilled on one
 * set in one mode and rated on another set in another mode is being told
 * something untrue about what they know.
 */
export const EQUIV_POOL: readonly PoolEntry[] = POOL;

/**
 * Pairs whose percentage is a whole number. The input buffer takes digits only,
 * so eighths and sixteenths — 12.5%, 6.25% — can be *recognised* in Collapse
 * but cannot be *typed* as a meteor answer.
 */
export function wholePercentPairs(maxTier = 3): PoolEntry[] {
  return POOL.filter((e) => e.tier <= maxTier && Number.isInteger(e.percent));
}

export function fractionValue(f: Fraction): number {
  return f.num / f.den;
}

export function toPercent(f: Fraction): number {
  return (f.num / f.den) * 100;
}

export function formatFraction(f: Fraction): string {
  return `${f.num}/${f.den}`;
}

/** 12.5 -> '12.5%', 50 -> '50%'. No trailing zeroes. */
export function formatPercent(percent: number): string {
  return `${Number(percent.toFixed(4))}%`;
}

/**
 * Does this fraction equal this percentage? Cross-multiplied rather than
 * divided, so unreduced forms (2/4 against 50) match without rounding drift.
 */
export function matchesPercent(f: Fraction, percent: number): boolean {
  return Math.abs(f.num * 100 - percent * f.den) < EPSILON;
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function reduce(f: Fraction): Fraction {
  const g = gcd(f.num, f.den) || 1;
  return { num: f.num / g, den: f.den / g };
}

export function scaleFraction(f: Fraction, k: number): Fraction {
  return { num: f.num * k, den: f.den * k };
}

export interface WaveOptions {
  /** How many fraction/percent pairs to field. */
  pairs: number;
  /** Highest pool tier allowed (1–3). */
  maxTier: number;
  /**
   * Probability a fraction is shown unreduced (2/4 for 50%). This is where
   * equivalence gets taught — the percent is the canonical form, and any
   * equivalent fraction reaches it.
   */
  unreducedChance: number;
}

/**
 * Build one wave. Percent values are unique within a wave, so every fraction
 * has exactly one home and a mis-push is unambiguously the player's read of the
 * maths rather than a coin flip between two valid targets.
 */
export function generateWave(rng: Rng, opts: WaveOptions): WavePair[] {
  const eligible = POOL.filter((entry) => entry.tier <= opts.maxTier);
  const count = Math.min(opts.pairs, eligible.length);
  const chosen = rng.shuffle(eligible).slice(0, count);

  return chosen.map((entry) => {
    const scale = rng.chance(opts.unreducedChance) ? rng.int(2, 3) : 1;
    return {
      fraction: scaleFraction(entry.fraction, scale),
      percent: entry.percent,
      // The pair's own band, which is what a rating update should be told
      // about. The wave's tier cap says what was *allowed*, not what was dealt.
      tier: entry.tier,
      unreduced: scale > 1,
    };
  });
}

/** Pool size available at a tier cap — the ceiling on pairs per wave. */
export function poolSize(maxTier: number): number {
  return POOL.filter((entry) => entry.tier <= maxTier).length;
}
