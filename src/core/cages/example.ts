import type { CagePuzzle } from './cages';

/**
 * One puzzle, solved out loud.
 *
 * CAGES is the only mode here whose rules are not discoverable by playing it.
 * Meteors teach themselves — a number falls, you type it — but a player who
 * walks into a grid of targets can know both rules perfectly and still have no
 * idea what to *do*, because the move that opens a cage is a deduction and
 * nobody has shown them one. The briefing page said what a cage is. It never
 * showed anyone working one out, which is the part that was missing.
 *
 * So: a real 4x4, worked cell by cell, each step saying which cage or which
 * line forced the digit. Nothing here is a special teaching puzzle — it is the
 * shape the generator deals, so the reasoning transfers directly.
 *
 * The steps are data and the tests hold them to it: every digit matches the
 * puzzle's own answer, and every one of them is *forced* by what is already on
 * the board. If a step could have gone another way, the example would be
 * teaching guessing, and the test fails.
 */

/** Row-major, top-left to bottom-right:
 *
 *      2  4  3  1
 *      4  1  2  3
 *      1  3  4  2
 *      3  2  1  4
 */
export const EXAMPLE_PUZZLE: CagePuzzle = {
  size: 4,
  cages: [
    { cells: [0, 4], op: 'div', target: 2 },
    { cells: [1, 5], op: 'mul', target: 4 },
    { cells: [2, 6], op: 'mul', target: 6 },
    { cells: [3], op: 'add', target: 1 },
    { cells: [7, 11, 15], op: 'add', target: 9 },
    { cells: [8, 9], op: 'mul', target: 3 },
    { cells: [10, 14], op: 'sub', target: 3 },
    { cells: [12, 13], op: 'add', target: 5 },
  ],
  solution: [2, 4, 3, 1, 4, 1, 2, 3, 1, 3, 4, 2, 3, 2, 1, 4],
};

export interface ExampleFill {
  cell: number;
  value: number;
}

export interface ExampleStep {
  /** Digits this step writes, in the order the reasoning reaches them. */
  fills: readonly ExampleFill[];
  /** Cages the reason leans on, lit while the step is up. */
  lit: readonly number[];
  /** What just happened, in the second person. */
  say: string;
}

export const EXAMPLE_STEPS: readonly ExampleStep[] = [
  {
    fills: [],
    lit: [],
    say: 'Two rules. Every row and column takes 1, 2, 3, 4 — each exactly once. Every heavy outline is a cage, and the number in its corner is what the digits inside it must make. Note that a cage is not a line: a digit may appear twice inside one.',
  },
  {
    fills: [{ cell: 3, value: 1 }],
    lit: [3],
    say: 'Start where there is nothing to work out. A cage of one cell carries no operator, so the number in the corner is simply the digit that goes there.',
  },
  {
    fills: [{ cell: 1, value: 4 }],
    lit: [1],
    say: '4× means these two cells multiply to 4. In a grid of 1 to 4 that is 1×4 or 2×2 — and 2×2 is dead, because a column cannot hold two 2s. So the cage is a 1 and a 4. The top row already spent its 1, so the 4 goes on top.',
  },
  {
    fills: [{ cell: 0, value: 2 }],
    lit: [0],
    say: '2÷ means one digit divides the other to give 2: either 1 and 2, or 2 and 4. The top row has used its 1 and its 4 — so whichever way round the cage falls, this corner is the 2.',
  },
  {
    fills: [
      { cell: 2, value: 3 },
      { cell: 6, value: 2 },
    ],
    lit: [2],
    say: 'The top row holds 2, 4, 1, so its last cell is 3 — no arithmetic needed. But that 3 is half of the 6× cage, and 3 times what makes 6? The cell below it is a 2.',
  },
  {
    fills: [
      { cell: 5, value: 1 },
      { cell: 4, value: 4 },
    ],
    lit: [0, 1],
    say: 'Now finish the two cages you opened. 4× still needs a partner for its 4, which can only be 1. That gives row two a 1 and a 2 — so the cell on the left must be 3 or 4, and 2÷ wants the 4, since 4 ÷ 2 = 2.',
  },
  {
    fills: [{ cell: 7, value: 3 }],
    lit: [4],
    say: 'Row two reads 4, 1, 2, so 3 closes it. That 3 is the top of the tall 9+ cage down the right edge — which means its other two cells have 6 left between them.',
  },
  {
    fills: [
      { cell: 9, value: 3 },
      { cell: 8, value: 1 },
    ],
    lit: [5],
    say: '3× over two cells: 3 is prime, so the only pair is 3 and 1. The second column already has its 1 above, so the 3 takes this cell and the 1 goes to its left.',
  },
  {
    fills: [
      { cell: 10, value: 4 },
      { cell: 14, value: 1 },
    ],
    lit: [6],
    say: '3− is a difference: two digits three apart, and in a grid of 1 to 4 that can only be 1 and 4. This row already has its 1, so the 4 sits here and the 1 drops to the bottom.',
  },
  {
    fills: [
      { cell: 11, value: 2 },
      { cell: 12, value: 3 },
      { cell: 13, value: 2 },
      { cell: 15, value: 4 },
    ],
    lit: [4, 7],
    say: 'The rest is forced by the rows and columns alone. Check the last two cages as they fill: 3 + 2 = 5 along the bottom, and 3 + 2 + 4 = 9 down the right. Solved — and not one digit of it was a guess.',
  },
];
