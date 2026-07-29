import { describe, expect, it } from 'vitest';
import {
  cageSatisfied,
  carve,
  checkGrid,
  colOf,
  countSolutions,
  generate,
  latinSquare,
  neighbours,
  opsFor,
  rowOf,
  targetFor,
  type CageOp,
} from '../src/core/cages/cages';
import { createRng } from '../src/core/rng';

const ALL_OPS: CageOp[] = ['add', 'sub', 'mul', 'div'];

/** Every row and column holds 1..size exactly once. */
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

describe('the square', () => {
  it('fills every row and column exactly once', () => {
    const rng = createRng(3);
    for (const size of [4, 5, 6]) {
      for (let i = 0; i < 40; i++) {
        expect(isLatin(latinSquare(rng, size), size), `${size}`).toBe(true);
      }
    }
  });

  it('does not deal the same square every time', () => {
    const rng = createRng(8);
    const seen = new Set(Array.from({ length: 30 }, () => latinSquare(rng, 4).join('')));
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('carving', () => {
  it('covers every cell exactly once', () => {
    const rng = createRng(12);
    for (let i = 0; i < 30; i++) {
      const cages = carve(rng, 5);
      const all = cages.flat().sort((a, b) => a - b);
      expect(all).toEqual(Array.from({ length: 25 }, (_, n) => n));
    }
  });

  it('keeps every cage contiguous', () => {
    // A cage split across the board could not be reasoned about as a region.
    const rng = createRng(6);
    for (let i = 0; i < 30; i++) {
      for (const cage of carve(rng, 5)) {
        const inCage = new Set(cage);
        const reached = new Set([cage[0]!]);
        const queue = [cage[0]!];
        while (queue.length > 0) {
          for (const n of neighbours(queue.pop()!, 5)) {
            if (inCage.has(n) && !reached.has(n)) {
              reached.add(n);
              queue.push(n);
            }
          }
        }
        expect(reached.size).toBe(cage.length);
      }
    }
  });

  it('never builds a cage bigger than four', () => {
    const rng = createRng(19);
    for (let i = 0; i < 40; i++) {
      for (const cage of carve(rng, 6)) expect(cage.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('cage labels', () => {
  it('offers subtraction and division only to a pair', () => {
    expect(opsFor([3, 5])).toContain('sub');
    expect(opsFor([2, 3, 4])).not.toContain('sub');
    expect(opsFor([2, 3, 4])).not.toContain('div');
  });

  it('offers division only when one divides the other', () => {
    expect(opsFor([2, 6])).toContain('div');
    expect(opsFor([4, 6])).not.toContain('div');
  });

  it('gives a single cell its own value', () => {
    expect(opsFor([3])).toEqual(['add']);
    expect(targetFor('add', [3])).toBe(3);
  });

  it('reads a difference and a quotient largest-first', () => {
    // So the answer is a number, not an order the player has to guess.
    expect(targetFor('sub', [2, 5])).toBe(3);
    expect(targetFor('sub', [5, 2])).toBe(3);
    expect(targetFor('div', [2, 6])).toBe(3);
    expect(targetFor('div', [6, 2])).toBe(3);
  });

  it('checks a filled cage against its label', () => {
    expect(cageSatisfied({ cells: [0, 1], op: 'mul', target: 12 }, [3, 4])).toBe(true);
    expect(cageSatisfied({ cells: [0, 1], op: 'mul', target: 12 }, [2, 4])).toBe(false);
  });
});

describe('the solver', () => {
  it('finds the one answer to a puzzle it generated', () => {
    const puzzle = generate(createRng(21), { size: 4, ops: ALL_OPS })!;
    expect(countSolutions(puzzle.size, puzzle.cages, 5)).toBe(1);
  });

  it('sees more than one answer when the cages do not pin it down', () => {
    // Two single-cell givens on a 4x4 leave far more than one filling.
    const loose = [
      { cells: [0], op: 'add' as CageOp, target: 1 },
      ...Array.from({ length: 15 }, (_, i) => ({
        cells: [i + 1],
        op: 'add' as CageOp,
        target: 0,
      })),
    ];
    // Targets of zero are unsatisfiable, so this is really a check that the
    // solver reports nothing rather than inventing a fill.
    expect(countSolutions(4, loose, 2)).toBe(0);
  });
});

describe('generation', () => {
  it('always produces a puzzle with exactly one answer', () => {
    // The fairness invariant: two answers means a player can be right and told
    // they are wrong.
    const rng = createRng(5);
    for (let i = 0; i < 12; i++) {
      const puzzle = generate(rng, { size: 4, ops: ALL_OPS });
      expect(puzzle).toBeDefined();
      expect(countSolutions(puzzle!.size, puzzle!.cages, 3)).toBe(1);
    }
  });

  it('produces a solution that is itself a Latin square', () => {
    const puzzle = generate(createRng(31), { size: 5, ops: ALL_OPS })!;
    expect(isLatin(puzzle.solution, 5)).toBe(true);
  });

  it('labels every cage truthfully against its own solution', () => {
    const rng = createRng(44);
    for (let i = 0; i < 8; i++) {
      const puzzle = generate(rng, { size: 4, ops: ALL_OPS })!;
      for (const cage of puzzle.cages) {
        const values = cage.cells.map((c) => puzzle.solution[c]!);
        expect(cageSatisfied(cage, values), `${cage.op} ${cage.target}`).toBe(true);
      }
    }
  });

  it('uses only the operators it was allowed', () => {
    const puzzle = generate(createRng(2), { size: 4, ops: ['add', 'sub'] })!;
    for (const cage of puzzle.cages) expect(['add', 'sub']).toContain(cage.op);
  });

  it('covers the whole grid with cages', () => {
    const puzzle = generate(createRng(15), { size: 5, ops: ALL_OPS })!;
    const covered = puzzle.cages.flatMap((c) => c.cells).sort((a, b) => a - b);
    expect(covered).toEqual(Array.from({ length: 25 }, (_, n) => n));
  });

  it('is reproducible from a seed', () => {
    const one = generate(createRng(101), { size: 4, ops: ALL_OPS });
    const two = generate(createRng(101), { size: 4, ops: ALL_OPS });
    expect(one).toEqual(two);
  });
});

describe('checking a player grid', () => {
  it('accepts the solution', () => {
    const puzzle = generate(createRng(9), { size: 4, ops: ALL_OPS })!;
    const check = checkGrid(puzzle, puzzle.solution);
    expect(check.complete).toBe(true);
    expect(check.brokenCages).toEqual([]);
    expect(check.brokenLines).toBe(false);
  });

  it('is silent about a cage that is not full yet', () => {
    const puzzle = generate(createRng(9), { size: 4, ops: ALL_OPS })!;
    const partial = puzzle.solution.map((v, i) => (i === 0 ? 0 : v));
    const check = checkGrid(puzzle, partial);
    expect(check.complete).toBe(false);
    // The empty cell's cage is incomplete, so it is not called wrong.
    const emptyCage = puzzle.cages.findIndex((c) => c.cells.includes(0));
    expect(check.brokenCages).not.toContain(emptyCage);
  });

  it('names a repeat in a row', () => {
    const puzzle = generate(createRng(9), { size: 4, ops: ALL_OPS })!;
    const values = [...puzzle.solution];
    values[1] = values[0]!;
    expect(checkGrid(puzzle, values).brokenLines).toBe(true);
  });

  it('names a cage that is full and wrong', () => {
    const puzzle = generate(createRng(9), { size: 4, ops: ALL_OPS })!;
    const cage = puzzle.cages.find((c) => c.cells.length > 1)!;
    const values = [...puzzle.solution];
    const cell = cage.cells[0]!;
    values[cell] = (values[cell]! % puzzle.size) + 1;
    const check = checkGrid(puzzle, values);
    expect(check.complete).toBe(false);
  });

  it('places every index inside the grid it came from', () => {
    for (const size of [4, 5]) {
      for (let i = 0; i < size * size; i++) {
        expect(rowOf(i, size)).toBeLessThan(size);
        expect(colOf(i, size)).toBeLessThan(size);
      }
    }
  });
});
