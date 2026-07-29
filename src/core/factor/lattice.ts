/**
 * A number drawn as the rectangle it can make.
 *
 * Factor Storm asks the player to name a factor of a rock, and the rock has
 * only ever been a numeral — so the question "what goes into 24" is answered
 * from memory or not at all. But a number *is* a shape: 24 counters lay out as
 * 4 by 6, and once they are on the table the factors are something you can see
 * rather than recall.
 *
 * This is Euclid's own definition rather than a teaching aid bolted on. A
 * composite number is one that can be arranged as a proper rectangle; a prime
 * is one that is stuck as a single line, however you push the counters around.
 * In a mode whose whole subject is primes, that is the definition made visible
 * at a glance and it costs nothing but the drawing.
 *
 * Quantity is the thing being conserved: the counters do not multiply or
 * vanish when a rock is worked on, they only regroup.
 *
 * Pure. The scene decides how big a counter is; this decides how many and in
 * what arrangement.
 */

export interface CellRect {
  /** Always the longer side, so a rock is drawn wider than it is tall. */
  cols: number;
  rows: number;
}

/**
 * Above this a grid of counters stops reading as a quantity and becomes
 * texture — nobody sees forty-nine of anything. The binding limit is physical
 * rather than perceptual, though: rock radius runs from 26 up, and every rock
 * small enough to be worth drawing this way sits near that floor, so past two
 * dozen the counters are a few pixels each and say nothing.
 *
 * Bigger rocks keep the numeral they have always had, which turns the mode's
 * own difficulty curve into an abstraction ladder: quantity while quantity is
 * legible, symbols after.
 */
export const MAX_CELLS = 24;

/**
 * The most square arrangement of `n` counters.
 *
 * Squarest rather than any factor pair, because a long thin block reads as a
 * line and hides its own structure — 24 as 2 by 12 is barely more informative
 * than 24 in a row, while 4 by 6 shows both factors at once.
 */
export function bestRect(n: number): CellRect {
  if (n <= 0) return { cols: 0, rows: 0 };
  let rows = 1;
  for (let d = 1; d * d <= n; d++) {
    if (n % d === 0) rows = d;
  }
  return { cols: n / rows, rows };
}

/** Whether this rock is small enough to be worth drawing as counters. */
export function drawsAsCells(n: number): boolean {
  return n >= 2 && n <= MAX_CELLS;
}

/**
 * Whether the counters can make a proper rectangle — which is to say, whether
 * the number is composite. A prime has only the one-by-n arrangement.
 */
export function isRectangular(n: number): boolean {
  return bestRect(n).rows > 1;
}

/** How a rock comes apart when a factor is named. */
export interface Grouping {
  /** How many piles, which is the factor that was typed. */
  groups: number;
  /** How many counters in each, which is what is left. */
  size: number;
}

/**
 * Naming `factor` at `n` cuts the counters into that many equal piles.
 *
 * Typing 3 at a 6 makes three twos, which is what division means before it is
 * a procedure. The two fragments the mode then deals — the count of piles and
 * the size of one — are the rectangle's own two sides.
 */
export function groupingFor(n: number, factor: number): Grouping | undefined {
  if (factor <= 0 || n <= 0 || n % factor !== 0) return undefined;
  return { groups: factor, size: n / factor };
}
