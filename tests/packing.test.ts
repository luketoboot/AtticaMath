import { describe, expect, it } from 'vitest';
import { isPrime } from '../src/core/factor/factor';
import {
  canPlace,
  cellAt,
  clearRows,
  createBoard,
  currentRect,
  fullRows,
  hasRectangle,
  makePiece,
  nextValue,
  place,
  restRow,
  rotate,
  shapesFor,
} from '../src/core/packing/packing';
import { createRng } from '../src/core/rng';

const W = 10;
const H = 12;

describe('a piece is its factor pairs', () => {
  it('offers every rectangle that fits, widest first', () => {
    expect(shapesFor(12, W, H)).toEqual([
      { cols: 6, rows: 2 },
      { cols: 4, rows: 3 },
      { cols: 3, rows: 4 },
      { cols: 2, rows: 6 },
      { cols: 1, rows: 12 },
    ]);
  });

  it('drops shapes too wide for the board', () => {
    // 12 by 1 does not fit a board ten across, so it is never offered.
    expect(shapesFor(12, W, H).some((s) => s.cols > W)).toBe(false);
  });

  it('leaves a prime nothing but a bar', () => {
    for (let n = 2; n <= 60; n++) {
      const shapes = shapesFor(n, W, H);
      if (shapes.length === 0) continue;
      expect(hasRectangle(shapes), `${n}`).toBe(!isPrime(n));
    }
  });

  it('conserves area however it is turned', () => {
    // The invariant the whole idea rests on: refactoring never changes how
    // much of the board a piece will cover.
    for (let n = 2; n <= 60; n++) {
      for (const rect of shapesFor(n, W, H)) {
        expect(rect.cols * rect.rows, `${n}`).toBe(n);
      }
    }
  });

  it('rotates by refactoring, and comes back around', () => {
    let piece = makePiece(12, W, H);
    const seen = new Set<string>();
    for (let i = 0; i < piece.shapes.length; i++) {
      const rect = currentRect(piece);
      seen.add(`${rect.cols}x${rect.rows}`);
      expect(rect.cols * rect.rows).toBe(12);
      piece = rotate(piece);
    }
    expect(seen.size).toBe(piece.shapes.length);
    expect(currentRect(piece)).toEqual(currentRect(makePiece(12, W, H)));
  });

  it('starts on the squarest shape, not on a bar', () => {
    expect(currentRect(makePiece(12, W, H))).toEqual({ cols: 4, rows: 3 });
    expect(currentRect(makePiece(16, W, H))).toEqual({ cols: 4, rows: 4 });
    // A prime has only bars, so it starts on the flattest of them.
    expect(currentRect(makePiece(7, W, H))).toEqual({ cols: 7, rows: 1 });
  });
});

describe('the board', () => {
  it('starts empty and takes a piece', () => {
    const board = createBoard(W, H);
    expect(board.cells.every((c) => c === null)).toBe(true);
    const filled = place(board, { cols: 2, rows: 3 }, 0, 9, 6);
    expect(cellAt(filled, 0, 9)).toBe(6);
    expect(cellAt(filled, 1, 11)).toBe(6);
    expect(cellAt(filled, 2, 9)).toBeNull();
  });

  it('refuses a piece that runs off an edge or into something', () => {
    const board = place(createBoard(W, H), { cols: 2, rows: 2 }, 4, 10, 4);
    expect(canPlace(board, { cols: 2, rows: 2 }, W - 1, 0)).toBe(false);
    expect(canPlace(board, { cols: 2, rows: 2 }, 0, H - 1)).toBe(false);
    expect(canPlace(board, { cols: 2, rows: 2 }, 4, 10)).toBe(false);
    expect(canPlace(board, { cols: 2, rows: 2 }, 4, 8)).toBe(true);
  });

  it('drops a piece to rest on what is already there', () => {
    const board = createBoard(W, H);
    expect(restRow(board, { cols: 2, rows: 3 }, 0)).toBe(H - 3);
    const stacked = place(board, { cols: 2, rows: 2 }, 0, H - 2, 4);
    expect(restRow(stacked, { cols: 2, rows: 3 }, 0)).toBe(H - 5);
  });

  it('reports a column with no room at all', () => {
    let board = createBoard(W, 2);
    board = place(board, { cols: 1, rows: 2 }, 0, 0, 2);
    expect(restRow(board, { cols: 1, rows: 1 }, 0)).toBeUndefined();
  });

  it('clears a row only when the width is exactly covered', () => {
    let board = createBoard(4, 3);
    board = place(board, { cols: 3, rows: 1 }, 0, 2, 3);
    expect(fullRows(board)).toEqual([]);
    board = place(board, { cols: 1, rows: 1 }, 3, 2, 1);
    expect(fullRows(board)).toEqual([2]);
  });

  it('drops what was above a cleared row, and opens fresh rows on top', () => {
    let board = createBoard(2, 3);
    board = place(board, { cols: 2, rows: 1 }, 0, 2, 2); // full bottom row
    board = place(board, { cols: 1, rows: 1 }, 0, 1, 9); // a single above it
    board = clearRows(board, fullRows(board));
    expect(cellAt(board, 0, 2)).toBe(9);
    expect(cellAt(board, 1, 2)).toBeNull();
    expect(cellAt(board, 0, 1)).toBeNull();
    expect(board.cells).toHaveLength(6);
  });

  it('keeps the board the same size after any clear', () => {
    let board = createBoard(4, 4);
    board = place(board, { cols: 4, rows: 2 }, 0, 2, 8);
    board = clearRows(board, fullRows(board));
    expect(board.cells).toHaveLength(16);
    expect(board.cells.every((c) => c === null)).toBe(true);
  });
});

describe('what falls next', () => {
  it('only ever offers a number that has a shape', () => {
    const rng = createRng(4);
    for (let i = 0; i < 400; i++) {
      const value = nextValue(rng, 2, 24, W, H);
      expect(shapesFor(value, W, H).length).toBeGreaterThan(0);
    }
  });

  it('leans towards numbers with more ways to be packed', () => {
    // A run of bars ends a game before any arithmetic has happened, so primes
    // stay possible but uncommon.
    const rng = createRng(9);
    let primes = 0;
    const runs = 600;
    for (let i = 0; i < runs; i++) {
      if (isPrime(nextValue(rng, 2, 24, W, H))) primes += 1;
    }
    expect(primes).toBeGreaterThan(0);
    expect(primes / runs).toBeLessThan(0.3);
  });

  it('is reproducible from a seed', () => {
    const roll = (): number[] => {
      const rng = createRng(31);
      return Array.from({ length: 20 }, () => nextValue(rng, 2, 24, W, H));
    };
    expect(roll()).toEqual(roll());
  });
});
