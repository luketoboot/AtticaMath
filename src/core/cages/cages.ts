import type { Rng } from '../rng';

/**
 * CAGES: a grid you can only fill by computing.
 *
 * Every row and column holds each digit from 1 to the grid's width exactly
 * once, and the grid is carved into cages — regions carrying a target and an
 * operator. "These three cells multiply to 24." "These two differ by 3."
 *
 * The reason this mode exists is a test the last one failed: *can you play it
 * without doing arithmetic?* A packing game shows you the shapes and lets you
 * pick by eye, so its numbers are decoration. Here nothing is shown but the
 * targets. To place a single digit you have to work out which factorisations
 * of 24 fit a three-cell cage, then which of those survive the digits already
 * committed in that row. There is no looking; there is only working it out.
 *
 * It is also the one puzzle form where arithmetic and deduction reinforce each
 * other: the sums narrow the possibilities, the Latin-square rule narrows them
 * further, and neither alone is enough.
 *
 * The invariant that makes it fair is uniqueness. A puzzle with two solutions
 * punishes a player for being right, so generation keeps going until the solver
 * says there is exactly one.
 *
 * Pure and seedable.
 */

export type CageOp = 'add' | 'sub' | 'mul' | 'div';

export interface Cage {
  /** Cell indices, row-major. Always contiguous on the grid. */
  cells: readonly number[];
  op: CageOp;
  target: number;
}

export interface CagePuzzle {
  size: number;
  cages: readonly Cage[];
  /** The unique answer, kept for checking and for the coach. */
  solution: readonly number[];
}

export const OP_SIGN: Readonly<Record<CageOp, string>> = {
  add: '+',
  sub: '−',
  mul: '×',
  div: '÷',
};

/** How many cells a cage may hold. Bigger cages are more arithmetic, less deduction. */
const MAX_CAGE = 4;
const MAX_ATTEMPTS = 60;

// --- the grid ---

export function rowOf(index: number, size: number): number {
  return Math.floor(index / size);
}

export function colOf(index: number, size: number): number {
  return index % size;
}

/**
 * A random Latin square.
 *
 * Built from the cyclic square and then shuffled by rows, columns and symbol
 * names — all three operations preserve the property, and together they reach
 * a wide enough spread of squares that puzzles do not feel related.
 */
export function latinSquare(rng: Rng, size: number): number[] {
  const base = Array.from({ length: size * size }, (_, i) => {
    return ((rowOf(i, size) + colOf(i, size)) % size) + 1;
  });
  const rows = rng.shuffle(Array.from({ length: size }, (_, i) => i));
  const cols = rng.shuffle(Array.from({ length: size }, (_, i) => i));
  const symbols = rng.shuffle(Array.from({ length: size }, (_, i) => i + 1));

  const out = new Array<number>(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const value = base[rows[r]! * size + cols[c]!]!;
      out[r * size + c] = symbols[value - 1]!;
    }
  }
  return out;
}

/** One side of one cell that wants a heavy line drawn along it. */
export interface CageEdge {
  cell: number;
  /** Offsets from the cell's top-left corner, in cell widths. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Where a cage's outline runs: every side whose neighbour is in another cage,
 * plus the outside of the grid.
 *
 * Geometry rather than drawing, so the board and the worked example draw the
 * same boxes from the same rule instead of two loops that can drift apart.
 */
export function cageEdges(size: number, cages: readonly Cage[]): CageEdge[] {
  const cageOf = new Array<number>(size * size).fill(-1);
  cages.forEach((cage, i) => {
    for (const cell of cage.cells) cageOf[cell] = i;
  });

  const out: CageEdge[] = [];
  for (let i = 0; i < size * size; i++) {
    const r = rowOf(i, size);
    const c = colOf(i, size);
    if (r === 0 || cageOf[i - size] !== cageOf[i]) out.push({ cell: i, x1: 0, y1: 0, x2: 1, y2: 0 });
    if (r === size - 1 || cageOf[i + size] !== cageOf[i]) {
      out.push({ cell: i, x1: 0, y1: 1, x2: 1, y2: 1 });
    }
    if (c === 0 || cageOf[i - 1] !== cageOf[i]) out.push({ cell: i, x1: 0, y1: 0, x2: 0, y2: 1 });
    if (c === size - 1 || cageOf[i + 1] !== cageOf[i]) {
      out.push({ cell: i, x1: 1, y1: 0, x2: 1, y2: 1 });
    }
  }
  return out;
}

/** The cell a cage's label is written in: its top-left, the way it is on paper. */
export function cageHead(cage: Cage): number {
  return [...cage.cells].sort((a, b) => a - b)[0]!;
}

/** What a cage wears in its corner. A one-cell cage is a digit; an operator would be noise. */
export function cageLabel(cage: Cage): string {
  return cage.cells.length === 1 ? `${cage.target}` : `${cage.target}${OP_SIGN[cage.op]}`;
}

/** Cells sharing an edge with `index`. */
export function neighbours(index: number, size: number): number[] {
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const found: number[] = [];
  if (r > 0) found.push(index - size);
  if (r < size - 1) found.push(index + size);
  if (c > 0) found.push(index - 1);
  if (c < size - 1) found.push(index + 1);
  return found;
}

/** Carve the grid into contiguous cages of one to four cells. */
export function carve(rng: Rng, size: number): number[][] {
  const owner = new Array<number>(size * size).fill(-1);
  const cages: number[][] = [];
  const order = rng.shuffle(Array.from({ length: size * size }, (_, i) => i));

  for (const start of order) {
    if (owner[start] !== -1) continue;
    const id = cages.length;
    const cage = [start];
    owner[start] = id;
    // Two and three cell cages are the sweet spot: one cell is a gift and four
    // is usually so constrained that the deduction does the work instead.
    const want = rng.pick([1, 2, 2, 2, 3, 3, 3, 4]);
    while (cage.length < Math.min(want, MAX_CAGE)) {
      const open = cage.flatMap((cell) => neighbours(cell, size)).filter((n) => owner[n] === -1);
      if (open.length === 0) break;
      const next = rng.pick(open);
      owner[next] = id;
      cage.push(next);
    }
    cages.push(cage);
  }
  return cages;
}

// --- cage arithmetic ---

/** What a cage of these values could legally be labelled. */
export function opsFor(values: readonly number[]): CageOp[] {
  if (values.length === 1) return ['add'];
  const ops: CageOp[] = ['add', 'mul'];
  if (values.length === 2) {
    ops.push('sub');
    const [a, b] = [Math.max(...values), Math.min(...values)];
    if (b !== 0 && a % b === 0) ops.push('div');
  }
  return ops;
}

/**
 * The target a cage of these values carries.
 *
 * Subtraction and division are only ever two cells, and read largest-first, so
 * the answer is a single number rather than an order the player has to guess.
 */
export function targetFor(op: CageOp, values: readonly number[]): number {
  if (op === 'add') return values.reduce((sum, v) => sum + v, 0);
  if (op === 'mul') return values.reduce((product, v) => product * v, 1);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  return op === 'sub' ? hi - lo : hi / lo;
}

/** Whether a filled cage satisfies its label. */
export function cageSatisfied(cage: Cage, values: readonly number[]): boolean {
  return targetFor(cage.op, values) === cage.target;
}

// --- solving ---

/**
 * How many ways this grid can be filled, counted up to `limit`.
 *
 * Used for one thing: proving a generated puzzle has exactly one answer. A
 * second solution means the player can be right and told they are wrong, which
 * is the worst thing a puzzle can do.
 *
 * `given` pins cells that are already written (0 for empty), which is how the
 * worked example proves it never asks the player to guess: a cell is forced
 * when every other digit in it leaves the rest of the grid with no filling at
 * all.
 */
export function countSolutions(
  size: number,
  cages: readonly Cage[],
  limit = 2,
  given?: readonly number[],
): number {
  const cageOf = new Array<number>(size * size).fill(-1);
  cages.forEach((cage, i) => {
    for (const cell of cage.cells) cageOf[cell] = i;
  });
  const grid = new Array<number>(size * size).fill(0);
  let found = 0;

  const cageComplete = (id: number): boolean => cages[id]!.cells.every((c) => grid[c] !== 0);

  const partialOk = (id: number): boolean => {
    const cage = cages[id]!;
    const filled = cage.cells.filter((c) => grid[c] !== 0).map((c) => grid[c]!);
    if (filled.length === cage.cells.length) {
      return targetFor(cage.op, filled) === cage.target;
    }
    // Cheap bounds while a cage is still open, so the search does not walk
    // whole branches that can never reach the target.
    if (cage.op === 'add') return filled.reduce((s, v) => s + v, 0) < cage.target;
    if (cage.op === 'mul') {
      const product = filled.reduce((p, v) => p * v, 1);
      return product <= cage.target && cage.target % product === 0;
    }
    return true;
  };

  const step = (index: number): void => {
    if (found >= limit) return;
    if (index === size * size) {
      found += 1;
      return;
    }
    const r = rowOf(index, size);
    const c = colOf(index, size);
    const pinned = given?.[index] ?? 0;
    for (let value = 1; value <= size; value++) {
      if (pinned !== 0 && value !== pinned) continue;
      let clash = false;
      for (let i = 0; i < size; i++) {
        if (grid[r * size + i] === value || grid[i * size + c] === value) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      grid[index] = value;
      const id = cageOf[index]!;
      if (partialOk(id) && (!cageComplete(id) || partialOk(id))) step(index + 1);
      grid[index] = 0;
      if (found >= limit) return;
    }
  };

  step(0);
  return found;
}

// --- generation ---

export interface CageOptions {
  size: number;
  /** Operators the puzzle may use. Trimming this is how difficulty is set. */
  ops: readonly CageOp[];
}

export function generate(rng: Rng, opts: CageOptions): CagePuzzle | undefined {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const solution = latinSquare(rng, opts.size);
    const cages: Cage[] = carve(rng, opts.size).map((cells) => {
      const values = cells.map((c) => solution[c]!);
      const legal = opsFor(values).filter((op) => opts.ops.includes(op));
      // A cage whose only legal readings are switched off falls back to a sum,
      // which every cage can always carry.
      const op = legal.length > 0 ? rng.pick(legal) : 'add';
      return { cells, op, target: targetFor(op, values) };
    });
    if (countSolutions(opts.size, cages) === 1) return { size: opts.size, cages, solution };
  }
  return undefined;
}

// --- checking a player's grid ---

export interface GridCheck {
  /** Cage indices that are full and wrong. */
  brokenCages: number[];
  /** Rows and columns holding a repeat. */
  brokenLines: boolean;
  complete: boolean;
}

export function checkGrid(puzzle: CagePuzzle, values: readonly number[]): GridCheck {
  const size = puzzle.size;
  const brokenCages: number[] = [];
  puzzle.cages.forEach((cage, i) => {
    const filled = cage.cells.map((c) => values[c] ?? 0);
    if (filled.some((v) => v === 0)) return;
    if (!cageSatisfied(cage, filled)) brokenCages.push(i);
  });

  let brokenLines = false;
  for (let i = 0; i < size; i++) {
    const row = new Set<number>();
    const col = new Set<number>();
    for (let j = 0; j < size; j++) {
      const r = values[i * size + j] ?? 0;
      const c = values[j * size + i] ?? 0;
      if (r !== 0 && row.has(r)) brokenLines = true;
      if (c !== 0 && col.has(c)) brokenLines = true;
      row.add(r);
      col.add(c);
    }
  }

  const complete =
    values.every((v) => v !== 0) && brokenCages.length === 0 && !brokenLines;
  return { brokenCages, brokenLines, complete };
}
