/**
 * Choosing the numbers a wave is made of.
 *
 * The formation decides what *class* each mote is; this decides which number
 * wears it. That split is the whole scheme — the shape of a wave is authored
 * and learnable, the arithmetic in it is generated and adapts — and it means
 * everything here is about the honesty of the item pool rather than the pacing.
 *
 * Two rules do the work, and both come from the same finding: under time
 * pressure people stop dividing and start glancing.
 *
 *   - A controlled share of every wave is heuristic-proof, so the parity and
 *     last-digit checks cannot answer it. Left alone, a pool fills up with odd
 *     non-multiples of four, and the mode ends up training and then measuring a
 *     shortcut instead of the skill it advertises.
 *   - Non-multiples are pulled toward the near misses. 85 is a far harder thing
 *     to keep off than 60 is, and difficulty that comes from the distance to the
 *     nearest multiple is difficulty about the arithmetic rather than about how
 *     many digits were on screen.
 *
 * Pure and seeded.
 */
import type { Rng } from '../rng';
import { classOf, isHeuristicProof, splitOf } from './divisors';
import type { MoteClass } from './signal';

export interface MoteRange {
  lo: number;
  hi: number;
}

export interface MotePoolConfig {
  /** Share of a wave whose membership the surface checks cannot settle. */
  heuristicProofShare: number;
  /** Share of the non-multiples that sit one or two steps off a multiple. */
  nearMissShare: number;
}

/** Every value in range of a class, split by whether the eye can shortcut it. */
export interface Candidates {
  proof: readonly number[];
  leaky: readonly number[];
}

/**
 * A value is heuristic-proof for a *pair* only when neither divisor's surface
 * check gives it away. An odd mote in a fours-and-sevens wave announces itself
 * to half the question before the player has read it.
 */
export function isProofForPair(value: number, a: number, b: number): boolean {
  return isHeuristicProof(value, a) && isHeuristicProof(value, b);
}

export function candidatesFor(cls: MoteClass, a: number, b: number, range: MoteRange): Candidates {
  const proof: number[] = [];
  const leaky: number[] = [];
  for (let v = range.lo; v <= range.hi; v++) {
    if (classOf(v, a, b) !== cls) continue;
    (isProofForPair(v, a, b) ? proof : leaky).push(v);
  }
  return { proof, leaky };
}

/** How close a non-multiple sits to the nearer of the two divisors' multiples. */
export function nearestSplit(value: number, a: number, b: number): number {
  return Math.min(splitOf(value, a), splitOf(value, b));
}

/**
 * Whether a pair can fill a formation at all, inside a value range.
 *
 * Bridge density is what usually fails: threes and fours meet every twelve, so
 * a two-digit range holds eight of them, while sixes and eights meet every
 * twenty-four and hold four. A formation wanting five bridges is unfillable for
 * the second pair and the wave has to be re-rolled — which is a generation
 * problem, not a player-facing one, so it is checked rather than discovered.
 */
export function isFillable(
  classes: readonly MoteClass[],
  a: number,
  b: number,
  range: MoteRange,
): boolean {
  const need = new Map<MoteClass, number>();
  for (const cls of classes) need.set(cls, (need.get(cls) ?? 0) + 1);
  for (const [cls, count] of need) {
    const { proof, leaky } = candidatesFor(cls, a, b, range);
    // Values repeat within a wave rather than being drawn without replacement,
    // so one of a class is enough — but none of a class is fatal.
    if (proof.length + leaky.length === 0) return false;
    if (count > 0 && proof.length + leaky.length === 0) return false;
  }
  return true;
}

/** Bias a draw of non-multiples toward the ones that sit next to a multiple. */
function pickNear(rng: Rng, pool: readonly number[], a: number, b: number): number {
  const near = pool.filter((v) => nearestSplit(v, a, b) <= 2);
  return near.length > 0 ? rng.pick(near) : rng.pick(pool);
}

/**
 * Fill a formation's slots with numbers.
 *
 * The proof share is met across the wave rather than rolled per mote, so a wave
 * is never accidentally all-easy: the count is worked out up front and spent as
 * the slots are walked. Where a class has no proof candidates in range the slot
 * takes a leaky one and the budget carries forward, which is the honest
 * failure — better a wave one item short of its target than a wave that lies
 * about the target being reachable.
 */
export function fillSlots(
  rng: Rng,
  classes: readonly MoteClass[],
  a: number,
  b: number,
  range: MoteRange,
  cfg: MotePoolConfig,
): number[] {
  let proofBudget = Math.round(classes.length * cfg.heuristicProofShare);
  let slotsLeft = classes.length;

  return classes.map((cls) => {
    const { proof, leaky } = candidatesFor(cls, a, b, range);
    // Spend the budget when it is running out of room to be spent.
    const mustBeProof = proofBudget >= slotsLeft;
    const wantProof = mustBeProof || (proofBudget > 0 && rng.chance(proofBudget / slotsLeft));
    slotsLeft -= 1;

    const pool = wantProof && proof.length > 0 ? proof : leaky.length > 0 ? leaky : proof;
    const value =
      cls === 'neither' && rng.chance(cfg.nearMissShare) ? pickNear(rng, pool, a, b) : rng.pick(pool);

    if (isProofForPair(value, a, b) && proofBudget > 0) proofBudget -= 1;
    return value;
  });
}
