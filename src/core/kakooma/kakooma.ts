import type { Rng } from '../rng';

/**
 * Kakooma: find the number that is the sum of two others.
 *
 * Every other mode in this game asks the same question — here is a problem,
 * produce the answer. This one inverts it. The player is given a field of
 * numbers and has to *find* the relationship hiding in it, which means testing
 * pair after pair until one lands. A single nine-number cell costs dozens of
 * mental sums; a full grid costs hundreds. The player experiences it as
 * searching, and the arithmetic is a side effect.
 *
 * That makes it the complement to Meteor Defense rather than a variant of it.
 * Knowing 7 + 8 = 15 on cue and spotting that a 15 is sitting near a 7 and an 8
 * are different skills, and only the first has anywhere to live in this game so
 * far. Recognition is the one that fires when someone looks at a real number
 * and sees structure in it.
 *
 * The grid nests: nine cells are solved, and their nine answers are themselves
 * a cell — the puzzle-in-a-puzzle. Which is why generation runs backwards, the
 * final cell first and each sub-cell built to land on one of its numbers.
 *
 * The invariant everything rests on: a cell has **exactly one** number that is
 * the sum of two others. Two answers would make it ungradeable, and a player
 * who found the other one would be right and marked wrong. `relationships`
 * exists to check that, and the generator rejects until it holds.
 *
 * Pure and seedable, like the rest of core/.
 */

export type KakoomaOp = 'add' | 'mul';

/** One found relationship, as indices into a cell's values. `a < b` always. */
export interface KakoomaTriple {
  a: number;
  b: number;
  /** Index of the value the other two combine to make. */
  answer: number;
}

/** A group of numbers with exactly one relationship hidden in it. */
export interface KakoomaCell {
  values: readonly number[];
  /** Index of the number that is the sum (or product) of two others. */
  answer: number;
  /** The two that make it. */
  parts: readonly [number, number];
}

/** Nine cells and the tenth their answers spell out. */
export interface KakoomaPuzzle {
  op: KakoomaOp;
  cells: readonly KakoomaCell[];
  /** Built from the cells' answers, in cell order. */
  final: KakoomaCell;
}

export interface KakoomaOptions {
  op: KakoomaOp;
  /**
   * Every number in a cell, the answer included, lives in `2..max`. Bounding
   * the sum rather than the addends is what stops the answer being findable by
   * picking the largest number on screen — the whole cell has to be searched.
   */
  max: number;
  /** Numbers per cell. Tang runs 4, 6, 7 and 9. */
  cellSize: number;
  /** Cells in the grid. Their answers become the final cell, so this is its size. */
  gridSize: number;
}

const MAX_ATTEMPTS = 200;

function combine(op: KakoomaOp, a: number, b: number): number {
  return op === 'add' ? a + b : a * b;
}

/**
 * Every relationship in a group, as canonical triples.
 *
 * Canonical means `a < b`, so a pair is counted once rather than twice. A
 * number is never allowed to be its own part — `4 + 4 = 8` is a relationship
 * only when there are two fours on the table, which is why this indexes
 * positions rather than values.
 */
export function relationships(values: readonly number[], op: KakoomaOp): KakoomaTriple[] {
  const found: KakoomaTriple[] = [];
  for (let a = 0; a < values.length; a++) {
    for (let b = a + 1; b < values.length; b++) {
      const total = combine(op, values[a]!, values[b]!);
      for (let answer = 0; answer < values.length; answer++) {
        if (answer === a || answer === b) continue;
        if (values[answer] === total) found.push({ a, b, answer });
      }
    }
  }
  return found;
}

/** Whether a group poses exactly one question with exactly one answer. */
export function isWellFormed(values: readonly number[], op: KakoomaOp): boolean {
  return relationships(values, op).length === 1;
}

/**
 * Pairs whose combination stays inside the range, as `[a, b, result]`.
 *
 * Built once per generation rather than sampled blindly: at the tight end —
 * products under 25, say — most random pairs overflow, and rejection sampling
 * would spend its whole attempt budget discovering that.
 */
function viablePairs(op: KakoomaOp, max: number): [number, number, number][] {
  const pairs: [number, number, number][] = [];
  for (let a = op === 'add' ? 1 : 2; a <= max; a++) {
    for (let b = a; b <= max; b++) {
      const total = combine(op, a, b);
      if (total <= max) pairs.push([a, b, total]);
    }
  }
  return pairs;
}

/**
 * One cell, optionally forced to land on a given answer.
 *
 * Built constructively rather than by rejecting whole random groups: the
 * relationship is planted first, then distractors are offered one at a time and
 * any that would create a second relationship is refused. Nine random numbers
 * under twenty collide constantly, so sampling whole groups and testing them
 * almost never terminates.
 *
 * Returns undefined when the range is too cramped to hide a single
 * relationship in — the caller decides whether that is worth retrying.
 */
export function generateCell(
  rng: Rng,
  opts: KakoomaOptions,
  requiredAnswer?: number,
): KakoomaCell | undefined {
  const pairs = viablePairs(opts.op, opts.max).filter(
    (p) => requiredAnswer === undefined || p[2] === requiredAnswer,
  );
  if (pairs.length === 0) return undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [a, b, total] = rng.pick(pairs);
    const values: number[] = [a, b, total];
    // A planted pair can already be degenerate: 2 + 2 = 4 is fine, but 2 + 4 = 6
    // alongside a 2 that also pairs with the 4 is not. Check before filling.
    if (!isWellFormed(values, opts.op)) continue;

    // Offer every number in range, in a random order, and keep the ones that do
    // not introduce a second relationship.
    const pool = rng.shuffle(
      Array.from({ length: opts.max - 1 }, (_, i) => i + 2).filter((v) => !values.includes(v)),
    );
    for (const candidate of pool) {
      if (values.length >= opts.cellSize) break;
      values.push(candidate);
      if (!isWellFormed(values, opts.op)) values.pop();
    }
    if (values.length < opts.cellSize) continue;

    const shuffled = rng.shuffle(values);
    const only = relationships(shuffled, opts.op)[0];
    if (!only) continue;
    return { values: shuffled, answer: only.answer, parts: [only.a, only.b] };
  }
  return undefined;
}

/**
 * A full grid, generated from the top down.
 *
 * The final cell is made first and each sub-cell is then built to answer one of
 * its numbers. Doing it the other way — nine cells, then hoping their answers
 * happen to form a legal cell — would almost never land, because "exactly one
 * relationship" is a property of the whole set and nothing about generating the
 * cells independently aims at it.
 */
export function generatePuzzle(rng: Rng, opts: KakoomaOptions): KakoomaPuzzle | undefined {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const final = generateCell(rng, { ...opts, cellSize: opts.gridSize });
    if (!final) return undefined;

    const cells: KakoomaCell[] = [];
    for (const value of final.values) {
      const cell = generateCell(rng, opts, value);
      if (!cell) break;
      cells.push(cell);
    }
    if (cells.length === final.values.length) return { op: opts.op, cells, final };
  }
  return undefined;
}

/** The number a cell is asking for. */
export function answerValue(cell: KakoomaCell): number {
  return cell.values[cell.answer]!;
}
