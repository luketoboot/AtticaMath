import type { LongShotConfig } from '../config';

/**
 * Paying for distance.
 *
 * COLLAPSE is the only mode where the player aims. Everything else is typed,
 * and typing has no geometry — but here a bolt crosses real space to reach a
 * token, and crossing more of it is harder in a way nothing was noticing. A
 * point-blank tap and a shot threaded across the whole field scored the same,
 * which quietly told the player that closing the distance was strictly better.
 * It is not: closing the distance costs fuel, drift and time on the chain
 * clock, and the mode is more interesting when both are live options.
 *
 * Judged on distance the bolt actually travelled, not the gap between two
 * points. Bolts wrap the screen edges, so a shot that leaves the right side and
 * arrives from the left has covered the ground even though its endpoints are
 * neighbours — and it is by far the better shot of the two.
 *
 * Only the shot that *completes* a pair is judged. The arming shot scores
 * nothing, so a bonus on it would have nowhere to land.
 */

export interface LongShot {
  /** Callout, e.g. SNIPER. */
  label: string;
  /** Extra points as a fraction of what the collapse already paid. */
  bonus: number;
  /** 0-based tier, for pitching the callout and sizing the juice. */
  tier: number;
}

/**
 * The tier a shot of this length earns, or undefined for an ordinary one.
 *
 * Tiers are read longest-first so the table stays in ascending order, which is
 * the order anyone tuning it will want to read.
 */
export function longShotFor(distance: number, cfg: LongShotConfig): LongShot | undefined {
  // NaN compares false against everything, so it would silently fall through to
  // "ordinary shot" anyway; this only makes that deliberate. An absurd distance
  // is not rejected — it is the top tier, which is what it should be.
  if (Number.isNaN(distance)) return undefined;
  for (let i = cfg.tiers.length - 1; i >= 0; i--) {
    const tier = cfg.tiers[i]!;
    if (distance >= tier.minDistance) return { label: tier.label, bonus: tier.bonus, tier: i };
  }
  return undefined;
}

/** The extra points a long shot adds on top of a collapse. Whole numbers only. */
export function longShotBonus(points: number, shot: LongShot | undefined): number {
  if (!shot) return 0;
  return Math.round(points * shot.bonus);
}
