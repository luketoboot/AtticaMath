import type { Rng } from '../rng';

/**
 * GNOMON: numbers packed as the rectangles they can make.
 *
 * A falling piece is a number, and its shapes are its factor pairs — a 12 can
 * come down as 2 by 6, 3 by 4, 4 by 3 or 6 by 2. Rotating does not turn the
 * piece; it *refactors* it. Same area, different rectangle, and the skill is
 * knowing which pair fits the hole you have.
 *
 * Everything follows from that one substitution:
 *
 *  - A prime has no proper rectangle, so it can only fall as a bar. Primes are
 *    the awkward piece, and a player learns which numbers are prime by having
 *    their board ruined by them — which sticks far better than a definition.
 *  - Difficulty comes from number theory rather than speed. A highly composite
 *    number is generous, a semiprime with big factors is nearly a bar, and a
 *    prime is one. The curve writes itself out of the numbers.
 *  - A cleared row is a decomposition of the board's width into parts, so the
 *    packing is number bonds and the rotating is times tables, in one action.
 *
 * Area is conserved throughout: a piece covers exactly its own value in cells,
 * however it is turned. That is the invariant the whole shapes idea rests on —
 * quantity is never created or destroyed, only regrouped.
 *
 * Pure and seedable. The scene owns gravity and pixels; this owns what fits.
 */

export interface Rect {
  cols: number;
  rows: number;
}

/** A number in play, and the shape it is currently wearing. */
export interface Piece {
  value: number;
  /** Index into `shapes`. */
  shape: number;
  shapes: readonly Rect[];
}

export interface Board {
  width: number;
  height: number;
  /**
   * Row-major, top row first. A cell holds the value of the piece that filled
   * it — kept rather than a boolean so the board can be drawn with each piece
   * still legible where it landed.
   */
  cells: readonly (number | null)[];
}

/**
 * Every rectangle `n` can make that fits the board.
 *
 * Ordered widest-first so rotation walks from flat to tall, which is the
 * direction a player scans a gap.
 */
export function shapesFor(n: number, maxCols: number, maxRows: number): Rect[] {
  const found: Rect[] = [];
  for (let cols = Math.min(n, maxCols); cols >= 1; cols--) {
    if (n % cols !== 0) continue;
    const rows = n / cols;
    if (rows <= maxRows) found.push({ cols, rows });
  }
  return found;
}

/** Whether `n` has a shape that is not a bare bar — that is, whether it is composite. */
export function hasRectangle(shapes: readonly Rect[]): boolean {
  return shapes.some((s) => s.cols > 1 && s.rows > 1);
}

export function createBoard(width: number, height: number): Board {
  return { width, height, cells: Array.from({ length: width * height }, () => null) };
}

export function cellAt(board: Board, col: number, row: number): number | null {
  if (col < 0 || col >= board.width || row < 0 || row >= board.height) return null;
  return board.cells[row * board.width + col] ?? null;
}

/** Whether a rectangle can sit with its top-left at (col, row). */
export function canPlace(board: Board, rect: Rect, col: number, row: number): boolean {
  if (col < 0 || row < 0) return false;
  if (col + rect.cols > board.width || row + rect.rows > board.height) return false;
  for (let r = row; r < row + rect.rows; r++) {
    for (let c = col; c < col + rect.cols; c++) {
      if (board.cells[r * board.width + c] !== null) return false;
    }
  }
  return true;
}

/**
 * The lowest row this rectangle can fall to in that column, or undefined when
 * it cannot enter the board at all.
 */
export function restRow(board: Board, rect: Rect, col: number): number | undefined {
  let landed: number | undefined;
  for (let row = 0; row + rect.rows <= board.height; row++) {
    if (!canPlace(board, rect, col, row)) break;
    landed = row;
  }
  return landed;
}

/**
 * Whether a piece has anywhere at all to go, in any of its shapes.
 *
 * The honest end condition. Asking only whether it fits the column it spawned
 * in ended runs on a nearly empty board — the piece had a dozen places to be
 * and the game called it over because the middle was busy.
 */
export function fitsSomewhere(board: Board, shapes: readonly Rect[]): boolean {
  return shapes.some((rect) => {
    for (let col = 0; col + rect.cols <= board.width; col++) {
      if (restRow(board, rect, col) !== undefined) return true;
    }
    return false;
  });
}

export function place(board: Board, rect: Rect, col: number, row: number, value: number): Board {
  const cells = [...board.cells];
  for (let r = row; r < row + rect.rows; r++) {
    for (let c = col; c < col + rect.cols; c++) cells[r * board.width + c] = value;
  }
  return { ...board, cells };
}

/** Rows with no gap left in them, top first. */
export function fullRows(board: Board): number[] {
  const rows: number[] = [];
  for (let row = 0; row < board.height; row++) {
    let full = true;
    for (let col = 0; col < board.width; col++) {
      if (board.cells[row * board.width + col] === null) {
        full = false;
        break;
      }
    }
    if (full) rows.push(row);
  }
  return rows;
}

/** Drop everything above each cleared row down by one, and open fresh rows on top. */
export function clearRows(board: Board, rows: readonly number[]): Board {
  if (rows.length === 0) return board;
  const doomed = new Set(rows);
  const kept: (number | null)[] = [];
  for (let row = 0; row < board.height; row++) {
    if (doomed.has(row)) continue;
    for (let col = 0; col < board.width; col++) kept.push(board.cells[row * board.width + col] ?? null);
  }
  const fresh = Array.from({ length: rows.length * board.width }, () => null);
  return { ...board, cells: [...fresh, ...kept] };
}

/**
 * A number to drop next.
 *
 * Weighted towards numbers with more rectangles, so a board is mostly workable
 * and a prime is an event rather than the norm. Left unweighted, a run of bars
 * ends a game before the player has had a chance to do any arithmetic.
 */
export function nextValue(rng: Rng, minValue: number, maxValue: number, maxCols: number, maxRows: number): number {
  const pool: number[] = [];
  for (let n = minValue; n <= maxValue; n++) {
    const shapes = shapesFor(n, maxCols, maxRows);
    if (shapes.length === 0) continue;
    // One entry per shape, plus one, so a prime keeps a slim chance and a
    // twelve is common.
    const weight = shapes.length + 1;
    for (let i = 0; i < weight; i++) pool.push(n);
  }
  return pool.length === 0 ? minValue : rng.pick(pool);
}

export function makePiece(value: number, maxCols: number, maxRows: number): Piece {
  const shapes = shapesFor(value, maxCols, maxRows);
  // Start on the squarest shape: it is the least committal, and starting on a
  // bar would suggest the bar is what the piece is.
  let shape = 0;
  let best = Number.POSITIVE_INFINITY;
  shapes.forEach((rect, i) => {
    const skew = Math.abs(rect.cols - rect.rows);
    if (skew < best) {
      best = skew;
      shape = i;
    }
  });
  return { value, shape, shapes };
}

export function currentRect(piece: Piece): Rect {
  return piece.shapes[piece.shape] ?? { cols: 1, rows: 1 };
}

/** Cycle to the next factor pair. Refactoring, not turning. */
export function rotate(piece: Piece, by = 1): Piece {
  if (piece.shapes.length === 0) return piece;
  const shape = (piece.shape + by + piece.shapes.length) % piece.shapes.length;
  return { ...piece, shape };
}
