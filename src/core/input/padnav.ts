/**
 * Cursor movement for the on-screen numpad, pure so the wrap rules are
 * testable. The pad is a 3x4 grid with one dead cell:
 *
 *   7 8 9      indices  0  1  2
 *   4 5 6               3  4  5
 *   1 2 3               6  7  8
 *   ⌫ 0 ·               9 10 (11 empty)
 *
 * Movement wraps at every edge, and the dead cell is never a landing spot —
 * a step that would land there keeps going in the same direction, so every
 * press moves the cursor somewhere real.
 */

export const PAD_LAYOUT = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', ''] as const;

const COLS = 3;
const ROWS = 4;

export type PadDir = 'up' | 'down' | 'left' | 'right';

/** The cell reached by stepping from `index` in `dir`, skipping the dead cell. */
export function stepPad(index: number, dir: PadDir): number {
  let row = Math.floor(index / COLS);
  let col = index % COLS;
  do {
    if (dir === 'up') row = (row + ROWS - 1) % ROWS;
    else if (dir === 'down') row = (row + 1) % ROWS;
    else if (dir === 'left') col = (col + COLS - 1) % COLS;
    else col = (col + 1) % COLS;
  } while (PAD_LAYOUT[row * COLS + col] === '');
  return row * COLS + col;
}
