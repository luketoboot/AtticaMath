/**
 * Signal detection for POLARITY.
 *
 * Every mote the player meets is a yes/no judgement — "is this a multiple of
 * the divisor I am currently wearing?" — and any one of them is a coin flip.
 * Feeding those to the Elo engine one at a time would inflate every rating in
 * the mode, because `expectedScore` has no floor and a guesser scores half.
 *
 * So nothing is rated per mote. Each divisor keeps a ledger of the four
 * signal-detection cells and, once it holds enough of both kinds of trial, is
 * cashed for a single sensitivity figure: d' = z(H) − z(FA). Sensitivity is
 * guess-free by construction, which is worth more here than any correction
 * bolted onto a hit rate:
 *
 *   - absorb everything and H = FA, so d' = 0
 *   - dodge everything and H = FA again, so d' = 0
 *
 * Both degenerate strategies land on exactly zero for any number of trials,
 * which is why the mode needs no separate mashing detector. The number already
 * says it.
 *
 * A passed mote is a response, not an absence of one. That matters: letting the
 * player abstain would turn a forced choice into a free-response task, and d'
 * over a self-selected subset of trials is not d'. Deciding to stay away from a
 * number is an assertion about it, and it is scored as one.
 *
 * Pure. No clock, no randomness.
 */

/** What a mote's value makes it, under the wave's divisor pair. */
export type MoteClass = 'aOnly' | 'bOnly' | 'bridge' | 'neither';

/** What became of a mote. Every mote ends as exactly one of these. */
export type Resolution = 'absorbedA' | 'absorbedB' | 'passed';

/** Which half of the pair a ledger is keeping score for. */
export type DivisorRole = 'a' | 'b';

export interface SdtCounts {
  /** Multiple of this divisor, and the player took it. */
  hits: number;
  /** Multiple of this divisor, and the player did not. */
  misses: number;
  /** Not a multiple, and the player took it anyway. */
  falseAlarms: number;
  /** Not a multiple, and the player stayed off it. */
  correctRejections: number;
}

export function emptyCounts(): SdtCounts {
  return { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
}

/** Which of the four cells a resolved mote falls in, or none. */
export type Cell = keyof SdtCounts | 'excluded';

/**
 * The truth table, as one function.
 *
 * The `excluded` case is the one worth stating aloud: a bridge absorbed under
 * the *other* divisor is a multiple of this one too, but the player never made
 * this divisor's call — they were somewhere else, correctly. Scoring it as a
 * miss would punish a right answer, and scoring it as a hit would hand out
 * discriminability for an item that carries none. It is not evidence, so it is
 * not counted.
 */
export function cellFor(cls: MoteClass, res: Resolution, role: DivisorRole): Cell {
  const isMultiple = cls === 'bridge' || cls === (role === 'a' ? 'aOnly' : 'bOnly');
  const tookIt = res === (role === 'a' ? 'absorbedA' : 'absorbedB');
  const tookTheOther = res !== 'passed' && !tookIt;

  if (cls === 'bridge' && tookTheOther) return 'excluded';
  if (isMultiple) return tookIt ? 'hits' : 'misses';
  return tookIt ? 'falseAlarms' : 'correctRejections';
}

/** Fold one resolved mote into a ledger's counts. Returns a new object. */
export function record(
  counts: SdtCounts,
  cls: MoteClass,
  res: Resolution,
  role: DivisorRole,
): SdtCounts {
  const cell = cellFor(cls, res, role);
  if (cell === 'excluded') return counts;
  return { ...counts, [cell]: counts[cell] + 1 };
}

export function signalTrials(counts: SdtCounts): number {
  return counts.hits + counts.misses;
}

export function noiseTrials(counts: SdtCounts): number {
  return counts.falseAlarms + counts.correctRejections;
}

/** Motes the player took, whatever they turned out to be. */
export function yesResponses(counts: SdtCounts): number {
  return counts.hits + counts.falseAlarms;
}

/** Motes the player stayed off. */
export function noResponses(counts: SdtCounts): number {
  return counts.misses + counts.correctRejections;
}

/**
 * Sensitivity, with the log-linear correction — half a count added to each of
 * the hit and false-alarm cells and one to each total. A flawless batch would
 * otherwise put a rate at exactly 1, and z(1) is infinite; the correction is
 * the standard way to keep a clean run finite rather than unrepresentable.
 */
export function dPrime(counts: SdtCounts): number {
  const h = (counts.hits + 0.5) / (signalTrials(counts) + 1);
  const f = (counts.falseAlarms + 0.5) / (noiseTrials(counts) + 1);
  return z(h) - z(f);
}

/**
 * Sensitivity as a graded outcome the rating engine can score against.
 *
 * The 2AFC identity, Pc = Φ(d'/√2), is already the guess-corrected proportion
 * correct, so no hand-tuned rescale is needed and none should be added: d' = 0
 * maps to exactly 0.5, which against a problem at the player's own rating is
 * the expected score and moves the rating nowhere. Any other mapping would
 * quietly put these skills on a different scale from the rest of the taxonomy,
 * and everything downstream reads them as if they shared one.
 */
export function partialFor(d: number): number {
  return phi(d / Math.SQRT2);
}

/** Standard normal CDF. Abramowitz & Stegun 7.1.26, error under 1.5e-7. */
export function phi(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * erf);
}

const Z_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
] as const;
const Z_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
] as const;
const Z_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
] as const;
const Z_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416] as const;
const Z_LOW = 0.02425;

/** Probit: the inverse of `phi`. Acklam's approximation, error under 1.2e-9. */
export function z(p: number): number {
  // Callers pass corrected rates, which are strictly inside (0,1) by
  // construction. Clamping rather than throwing keeps a rounding artefact at
  // the boundary from taking down a run.
  const q = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, p));

  if (q < Z_LOW || q > 1 - Z_LOW) {
    const tail = q < Z_LOW ? q : 1 - q;
    const r = Math.sqrt(-2 * Math.log(tail));
    const num = ((((Z_C[0] * r + Z_C[1]) * r + Z_C[2]) * r + Z_C[3]) * r + Z_C[4]) * r + Z_C[5];
    const den = (((Z_D[0] * r + Z_D[1]) * r + Z_D[2]) * r + Z_D[3]) * r + 1;
    // The lower tail comes out negative already; the upper is its reflection.
    return (q < Z_LOW ? 1 : -1) * (num / den);
  }

  const w = q - 0.5;
  const r = w * w;
  const num = ((((Z_A[0] * r + Z_A[1]) * r + Z_A[2]) * r + Z_A[3]) * r + Z_A[4]) * r + Z_A[5];
  const den = ((((Z_B[0] * r + Z_B[1]) * r + Z_B[2]) * r + Z_B[3]) * r + Z_B[4]) * r + 1;
  return (w * num) / den;
}

export interface LedgerConfig {
  /** Trials of each kind a ledger needs before it is worth cashing. */
  minSignalTrials: number;
  minNoiseTrials: number;
  /**
   * Responses of each kind — taken and not taken — the ledger needs as well.
   *
   * d' measures the gap between how a player answers signal and how they answer
   * noise. Give the same answer to everything and there is no gap to measure,
   * and what comes back is not a reading but an artefact of the log-linear
   * correction, whose two denominators drift apart as the trial counts do. A
   * player parked in one polarity for a whole ledger would otherwise post a
   * small positive d' on the divisor they never once engaged.
   *
   * So an undiscriminating ledger is refused rather than scored. It is the same
   * ruling the mode makes everywhere else: no evidence is not the same as
   * evidence of nothing.
   */
  minResponsesEachWay: number;
}

/**
 * One divisor's running tally.
 *
 * It flushes on an evidence budget rather than at the end of a wave, and the
 * reason is that d' is sensitive to how many trials it was measured over:
 * identical flawless play scores about 2.9 across twelve motes and about 3.5
 * across twenty-four. Cashing at a fixed trial count instead means every
 * attempt the mode emits carries comparable weight, which is the assumption a
 * single K factor is already making.
 */
export class SignalLedger {
  private counts: SdtCounts = emptyCounts();

  add(cls: MoteClass, res: Resolution, role: DivisorRole): void {
    this.counts = record(this.counts, cls, res, role);
  }

  peek(): SdtCounts {
    return { ...this.counts };
  }

  ready(cfg: LedgerConfig): boolean {
    return (
      signalTrials(this.counts) >= cfg.minSignalTrials &&
      noiseTrials(this.counts) >= cfg.minNoiseTrials &&
      yesResponses(this.counts) >= cfg.minResponsesEachWay &&
      noResponses(this.counts) >= cfg.minResponsesEachWay
    );
  }

  /**
   * Cash the ledger and start over. Returns undefined when there is not enough
   * of both kinds of trial — a run that ends mid-ledger throws the remainder
   * away rather than rating a handful of motes, because a d' over three trials
   * is noise wearing a number's clothes.
   */
  flush(cfg: LedgerConfig): number | undefined {
    if (!this.ready(cfg)) return undefined;
    const d = dPrime(this.counts);
    this.counts = emptyCounts();
    return d;
  }
}
