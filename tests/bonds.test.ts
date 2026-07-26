import { describe, expect, it } from 'vitest';
import { bondHint, digitAt, frameCells, type BondHint } from '../src/core/exercise/bonds';

const add = (a: number, b: number, depth = 0): BondHint => bondHint(a, b, 'add', depth)!;
const sub = (a: number, b: number, depth = 0): BondHint => bondHint(a, b, 'sub', depth)!;

describe('digitAt', () => {
  it('reads a place off a number', () => {
    expect(digitAt(679, 0)).toBe(9);
    expect(digitAt(679, 1)).toBe(7);
    expect(digitAt(679, 2)).toBe(6);
    expect(digitAt(679, 3)).toBe(0);
  });
});

describe('friends of ten', () => {
  it('names an exact pair', () => {
    const hint = add(7, 3);
    expect(hint.anchor).toBe(10);
    expect(hint.from).toBe(7);
    expect(hint.given).toBe(3);
    expect(hint.leftover).toBe(0);
    expect(hint.reading).toBe('7 and 3 make ten.');
  });

  it('splits the partner when the pair bridges', () => {
    const hint = add(8, 7);
    expect(hint.from).toBe(8);
    expect(hint.wants).toBe(2);
    expect(hint.given).toBe(2);
    expect(hint.leftover).toBe(5);
    expect(hint.total).toBe(15);
    expect(hint.reading).toBe('8 wants 2. Split 7 into 2 and 5. Ten, with 5 over → 15.');
  });

  it('says what a lone digit wants when the partner is empty', () => {
    const hint = add(9, 0);
    expect(hint.given).toBe(0);
    expect(hint.reading).toBe('9 wants 1 to make ten.');
  });

  it('admits when a pair falls short', () => {
    const hint = add(6, 2);
    expect(hint.total).toBe(8);
    expect(hint.leftover).toBe(0);
    expect(hint.reading).toBe('6 and 2 make 8. 2 short of ten.');
  });
});

describe('friends of five', () => {
  it('uses the small frame for a pair that cannot reach ten', () => {
    const hint = add(2, 3);
    expect(hint.anchor).toBe(5);
    expect(hint.reading).toBe('2 and 3 make five.');
  });

  it('falls short inside the five frame', () => {
    const hint = add(1, 2);
    expect(hint.anchor).toBe(5);
    expect(hint.total).toBe(3);
    expect(hint.reading).toBe('1 and 2 make 3. 2 short of five.');
  });

  it('does not shrink the frame for a digit that already passes five', () => {
    // 6 + 0 sums to 6, but a six will not fit in five boxes.
    expect(add(6, 0).anchor).toBe(10);
  });
});

describe('subtraction reads as a climb', () => {
  it('counts the gap up', () => {
    const hint = sub(6, 2);
    expect(hint.from).toBe(2);
    expect(hint.given).toBe(4);
    expect(hint.total).toBe(4);
    expect(hint.reading).toBe('2 climbs to 6 in 4.');
  });

  it('routes a borrow through ten', () => {
    const hint = sub(2, 8);
    expect(hint.anchor).toBe(10);
    expect(hint.from).toBe(8);
    expect(hint.given).toBe(2);
    expect(hint.leftover).toBe(2);
    expect(hint.total).toBe(4);
    expect(hint.reading).toBe('8 wants 2 to make ten, then 2 more → 4.');
  });

  it('says nothing is owed when the digits match', () => {
    expect(sub(4, 4).reading).toBe('Both 4. This place is already clear.');
  });

  it('stops at ten when there is nothing past it', () => {
    // 40 − 16: the ones climb 6 → 10 and stop. "Then 0 more" is a step that
    // does not happen.
    const hint = sub(0, 6);
    expect(hint.total).toBe(4);
    expect(hint.leftover).toBe(0);
    expect(hint.reading).toBe('6 wants 4 to make ten → 4.');
  });
});

describe('which column it reads', () => {
  it('follows the rung up the number', () => {
    // 679 + 834: the ones at depth 0, the tens at depth 1.
    expect(bondHint(679, 834, 'add', 0)!.from).toBe(9);
    expect(bondHint(679, 834, 'add', 1)!.from).toBe(7);
    expect(bondHint(679, 834, 'add', 2)!.from).toBe(6);
  });

  it('stays quiet when the column is empty', () => {
    expect(bondHint(300, 100, 'add', 0)).toBeUndefined();
    expect(bondHint(300, 100, 'add', 1)).toBeUndefined();
    expect(bondHint(300, 100, 'add', 2)).toBeDefined();
  });
});

describe('frameCells', () => {
  it('fills, then gives, then leaves the rest empty', () => {
    expect(frameCells(add(7, 3))).toEqual([
      'from', 'from', 'from', 'from', 'from', 'from', 'from',
      'given', 'given', 'given',
    ]);
  });

  it('never overfills the frame', () => {
    for (let x = 0; x <= 9; x++) {
      for (let y = 0; y <= 9; y++) {
        if (x === 0 && y === 0) continue;
        for (const op of ['add', 'sub'] as const) {
          const hint = bondHint(x, y, op, 0)!;
          const cells = frameCells(hint);
          expect(cells).toHaveLength(hint.anchor);
          expect(hint.from + hint.given, `${x} ${op} ${y}`).toBeLessThanOrEqual(hint.anchor);
          expect(hint.from).toBeGreaterThanOrEqual(0);
          expect(hint.given).toBeGreaterThanOrEqual(0);
          expect(hint.leftover).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('agrees with the arithmetic it claims to explain', () => {
    for (let x = 0; x <= 9; x++) {
      for (let y = 0; y <= 9; y++) {
        if (x === 0 && y === 0) continue;
        expect(add(x, y).total, `${x}+${y}`).toBe(x + y);
        // A subtraction column answers the gap, borrowing through ten when it must.
        expect(sub(x, y).total, `${x}-${y}`).toBe(x >= y ? x - y : 10 + x - y);
      }
    }
  });
});
