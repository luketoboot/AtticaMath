import { describe, expect, it } from 'vitest';
import {
  cageSatisfied,
  colOf,
  countSolutions,
  generate,
  neighbours,
  rowOf,
  targetFor,
  type Cage,
  type CageOp,
} from '../src/core/cages/cages';
import { CONFIG } from '../src/core/config';
import { createRng } from '../src/core/rng';

/**
 * Can every puzzle the game deals actually be finished?
 *
 * The other cages tests check the pieces. This one sweeps what a player would
 * really meet — hundreds of dealt grids at every size the mode can deal — and
 * holds each to the two promises the mode makes: there is an answer, and there
 * is only one. A puzzle that fails either is not a hard puzzle, it is a broken
 * one, and the player has no way to tell the difference from the inside.
 *
 * It also pins the rule that makes some legal cages *look* broken: a digit may
 * repeat inside a cage. "5+" over three cells is impossible with three
 * different digits and perfectly ordinary as 1+2+2, so long as the two 2s sit
 * in different rows and different columns.
 */

const ALL_OPS: CageOp[] = ['add', 'sub', 'mul', 'div'];
/** Sizes the mode can deal. 4 is what it deals today; the rest must not rot. */
const SIZES = [4, 5, 6];

function isLatin(grid: readonly number[], size: number): boolean {
  for (let i = 0; i < size; i++) {
    const row = new Set<number>();
    const col = new Set<number>();
    for (let j = 0; j < size; j++) {
      row.add(grid[i * size + j]!);
      col.add(grid[j * size + i]!);
    }
    if (row.size !== size || col.size !== size) return false;
  }
  return true;
}

function isContiguous(cells: readonly number[], size: number): boolean {
  const inCage = new Set(cells);
  const seen = new Set([cells[0]!]);
  const queue = [cells[0]!];
  while (queue.length > 0) {
    for (const n of neighbours(queue.pop()!, size)) {
      if (inCage.has(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size === cells.length;
}

/** True when every cell of the cage shares one row, or every cell shares one column. */
function isStraight(cage: Cage, size: number): boolean {
  const rows = new Set(cage.cells.map((c) => rowOf(c, size)));
  const cols = new Set(cage.cells.map((c) => colOf(c, size)));
  return rows.size === 1 || cols.size === 1;
}

/** The smallest and largest a cage of this shape could possibly total. */
function addRange(cage: Cage, size: number): { min: number; max: number } {
  const n = cage.cells.length;
  if (isStraight(cage, size)) {
    // One line, so every digit differs: 1+2+3... at the bottom, size+... at the top.
    let min = 0;
    let max = 0;
    for (let i = 0; i < n; i++) {
      min += i + 1;
      max += size - i;
    }
    return { min, max };
  }
  // Bent, so digits may repeat — but never two in the same row or column, and a
  // cage of four or fewer cells can hold at most two of any one digit.
  return { min: n, max: size * n };
}

describe('every puzzle the game deals', () => {
  const puzzles = SIZES.flatMap((size) => {
    const rng = createRng(20260802 + size);
    // Enough grids that a one-in-a-hundred generation fault cannot hide, and
    // still fast: the solver stops counting at two.
    const runs = size === 4 ? 400 : 60;
    return Array.from({ length: runs }, () => {
      const puzzle = generate(rng, { size, ops: ALL_OPS });
      expect(puzzle, `generation gave up at size ${size}`).toBeDefined();
      return puzzle!;
    });
  });

  it('deals a grid every time it is asked', () => {
    expect(puzzles.length).toBe(400 + 60 + 60);
  });

  it('can be completed — the answer it was built from fits every cage', () => {
    for (const puzzle of puzzles) {
      expect(isLatin(puzzle.solution, puzzle.size), 'solution is not a Latin square').toBe(true);
      for (const cage of puzzle.cages) {
        const values = cage.cells.map((c) => puzzle.solution[c]!);
        expect(
          cageSatisfied(cage, values),
          `${cage.target} ${cage.op} over [${cage.cells}] cannot be made by ${values}`,
        ).toBe(true);
      }
    }
  });

  it('can be completed exactly one way', () => {
    for (const puzzle of puzzles) {
      expect(
        countSolutions(puzzle.size, puzzle.cages, 2),
        `a ${puzzle.size}x${puzzle.size} with cages ${JSON.stringify(puzzle.cages)}`,
      ).toBe(1);
    }
  });

  it('covers the grid with contiguous cages of at most four cells', () => {
    for (const puzzle of puzzles) {
      const covered = puzzle.cages.flatMap((c) => c.cells).sort((a, b) => a - b);
      expect(covered).toEqual(Array.from({ length: puzzle.size * puzzle.size }, (_, i) => i));
      for (const cage of puzzle.cages) {
        expect(cage.cells.length).toBeGreaterThan(0);
        expect(cage.cells.length).toBeLessThanOrEqual(4);
        expect(isContiguous(cage.cells, puzzle.size), `[${cage.cells}] is not one region`).toBe(true);
      }
    }
  });

  it('never asks for a total its own shape cannot reach', () => {
    // The reading a stuck player makes: "5+ over three cells, that needs three
    // different digits, the smallest three are 1+2+3=6, so this is broken."
    // That reasoning is right for a cage in one line and wrong for a bent one,
    // and this is the assertion that the generator only ever prints the second.
    for (const puzzle of puzzles) {
      for (const cage of puzzle.cages) {
        if (cage.op !== 'add') continue;
        const { min, max } = addRange(cage, puzzle.size);
        expect(
          cage.target,
          `${cage.target}+ over ${cage.cells.length} ${isStraight(cage, puzzle.size) ? 'in-line' : 'bent'} cells`,
        ).toBeGreaterThanOrEqual(min);
        expect(cage.target).toBeLessThanOrEqual(max);
      }
    }
  });

  it('never labels a straight cage with a total only a repeat could make', () => {
    for (const puzzle of puzzles) {
      for (const cage of puzzle.cages) {
        if (!isStraight(cage, puzzle.size)) continue;
        const values = cage.cells.map((c) => puzzle.solution[c]!);
        // A row or a column cannot hold the same digit twice, so a cage lying
        // along one has to be solved with all-different digits.
        expect(new Set(values).size, `[${cage.cells}] repeats a digit in one line`).toBe(
          values.length,
        );
      }
    }
  });

  it('deals the size the mode is configured for', () => {
    const rng = createRng(7);
    const puzzle = generate(rng, { size: CONFIG.cages.defaultSize, ops: ALL_OPS })!;
    expect(puzzle.size).toBe(CONFIG.cages.defaultSize);
  });
});

describe('a digit repeated inside a cage', () => {
  it('is legal, and is how a bent cage reaches a small total', () => {
    // 1 + 2 + 2 = 5 with the two 2s in different rows and different columns.
    const cage: Cage = { cells: [1, 5, 4], op: 'add', target: 5 };
    expect(targetFor('add', [1, 2, 2])).toBe(cage.target);
    expect(cageSatisfied(cage, [1, 2, 2])).toBe(true);
  });

  it('is something the generator really does produce, so it must be taught', () => {
    const rng = createRng(1234);
    let bentRepeats = 0;
    for (let i = 0; i < 200; i++) {
      const puzzle = generate(rng, { size: 4, ops: ALL_OPS })!;
      for (const cage of puzzle.cages) {
        if (cage.cells.length < 2 || isStraight(cage, puzzle.size)) continue;
        const values = cage.cells.map((c) => puzzle.solution[c]!);
        if (new Set(values).size < values.length) bentRepeats += 1;
      }
    }
    // Common enough that a player meets one early — which is why the briefing
    // page says so in as many words.
    expect(bentRepeats).toBeGreaterThan(20);
  });
});
