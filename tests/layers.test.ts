import { describe, expect, it } from 'vitest';
import {
  createWorkbench,
  currentLayer,
  deconstruct,
  digitCount,
  ladderFor,
  layerAt,
  maxDepthFor,
  reconstruct,
  slotWidth,
  slotsFor,
  submit,
  truncateTo,
  type ExerciseProblem,
  type WorkbenchState,
} from '../src/core/exercise/layers';
import { createRng } from '../src/core/rng';

const add = (a: number, b: number): ExerciseProblem => ({ op: 'add', a, b });
const sub = (a: number, b: number): ExerciseProblem => ({ op: 'sub', a, b });

/** Read the layer in focus as the player sees it: "670 + 830 = 1500". */
const reads = (state: WorkbenchState): string => {
  const { left, right, value } = currentLayer(state);
  return `${left} ${state.problem.op === 'add' ? '+' : '-'} ${right} = ${value}`;
};

describe('truncateTo', () => {
  it('zeroes the lowest places', () => {
    expect(truncateTo(679, 0)).toBe(679);
    expect(truncateTo(679, 1)).toBe(670);
    expect(truncateTo(679, 2)).toBe(600);
    expect(truncateTo(679, 3)).toBe(0);
  });

  it('is monotone, which is what keeps subtraction layers positive', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const x = rng.int(0, 9999);
      const y = rng.int(0, 9999);
      const [lo, hi] = x <= y ? [x, y] : [y, x];
      for (let d = 0; d <= 4; d++) {
        expect(truncateTo(hi, d)).toBeGreaterThanOrEqual(truncateTo(lo, d));
      }
    }
  });
});

describe('the ladder', () => {
  it('caps at the smaller operand, so no layer reads as a bare zero', () => {
    expect(maxDepthFor(add(679, 834))).toBe(2);
    // 34 has two digits, so the tens are as far out as this one zooms.
    expect(maxDepthFor(add(679, 34))).toBe(1);
    expect(maxDepthFor(add(5, 3))).toBe(0);
    expect(digitCount(1000)).toBe(4);
  });

  it('offers no stops at all for single digits', () => {
    expect(ladderFor(add(5, 3))).toEqual([0]);
  });

  it('skips a layer that would read identically', () => {
    // Dropping the ones of 450 + 320 changes nothing — the dial steps past it.
    expect(ladderFor(add(450, 320))).toEqual([0, 2]);
    expect(ladderFor(add(679, 834))).toEqual([0, 1, 2]);
  });

  it('keeps a layer whose operands change even when the value does not', () => {
    // 45 - 25 and 40 - 20 are both 20, but the ones genuinely cancelled and
    // seeing that happen is the lesson.
    expect(ladderFor(sub(45, 25))).toEqual([0, 1]);
  });
});

describe('the 679 + 834 walkthrough', () => {
  it('descends twice, solves, and climbs back into focus', () => {
    let s = createWorkbench(add(679, 834));
    expect(reads(s)).toBe('679 + 834 = 1513');

    s = deconstruct(s).state;
    expect(reads(s)).toBe('670 + 830 = 1500');

    s = deconstruct(s).state;
    expect(reads(s)).toBe('600 + 800 = 1400');

    const solvedTop = submit(s, 1400);
    expect(solvedTop.event).toMatchObject({ kind: 'solved', complete: false });
    s = solvedTop.state;

    s = reconstruct(s).state;
    expect(reads(s)).toBe('670 + 830 = 1500');
    s = submit(s, 1500).state;

    s = reconstruct(s).state;
    expect(reads(s)).toBe('679 + 834 = 1513');
    const last = submit(s, 1513);
    expect(last.event).toMatchObject({ kind: 'solved', complete: true });

    expect(last.state.done).toBe(true);
    expect(last.state.misses).toBe(0);
    // Two places had to come off before it looked solvable.
    expect(last.state.scaffoldDepth).toBe(2);
  });
});

describe('subtraction layers', () => {
  it('walks 634 - 287 without ever going negative', () => {
    let s = createWorkbench(sub(634, 287));
    s = deconstruct(s).state;
    expect(reads(s)).toBe('630 - 280 = 350');
    s = deconstruct(s).state;
    expect(reads(s)).toBe('600 - 200 = 400');
    s = submit(s, 400).state;
    s = reconstruct(s).state;
    s = submit(s, 350).state;
    s = reconstruct(s).state;
    s = submit(s, 347).state;
    expect(s.done).toBe(true);
  });

  it('never produces a negative layer for any positive subtraction', () => {
    const rng = createRng(99);
    for (let i = 0; i < 500; i++) {
      const x = rng.int(0, 9999);
      const y = rng.int(0, 9999);
      const problem = sub(Math.max(x, y), Math.min(x, y));
      for (const depth of ladderFor(problem)) {
        expect(layerAt(problem, depth).value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('refuses to build a workbench that would go negative', () => {
    expect(() => createWorkbench(sub(28, 95))).toThrow(/negative/);
  });
});

describe('solving without the scaffold', () => {
  it('completes on a single answer and reports depth 0', () => {
    const s = createWorkbench(add(679, 834));
    const step = submit(s, 1513);
    expect(step.event).toMatchObject({ kind: 'solved', complete: true });
    expect(step.state.done).toBe(true);
    expect(step.state.scaffoldDepth).toBe(0);
    expect(step.state.moves).toBe(1);
  });
});

describe('wrong answers', () => {
  it('cost a miss and hold the dial where it is', () => {
    let s = createWorkbench(add(679, 834));
    s = deconstruct(s).state;
    const step = submit(s, 1400);
    expect(step.event).toMatchObject({ kind: 'wrong', typed: 1400 });
    expect(step.state.misses).toBe(1);
    expect(step.state.depth).toBe(1);
    expect(step.state.layerSolved).toBe(false);
    // A miss must not lock the dial: the player can still zoom out further.
    expect(deconstruct(step.state).event.kind).toBe('deconstruct');
  });
});

describe('refusals', () => {
  it('will not zoom past the top of the ladder', () => {
    let s = createWorkbench(add(679, 834));
    s = deconstruct(s).state;
    s = deconstruct(s).state;
    expect(deconstruct(s).event).toEqual({ kind: 'refused', reason: 'already-coarsest' });
  });

  it('will not reconstruct before the layer in focus is answered', () => {
    let s = createWorkbench(add(679, 834));
    s = deconstruct(s).state;
    expect(reconstruct(s).event).toEqual({ kind: 'refused', reason: 'layer-unsolved' });
  });

  it('will not deconstruct again once something has been solved', () => {
    let s = createWorkbench(add(679, 834));
    s = deconstruct(s).state;
    s = submit(s, 1500).state;
    expect(deconstruct(s).event).toEqual({ kind: 'refused', reason: 'locked' });
  });

  it('will not answer the same layer twice', () => {
    let s = createWorkbench(add(679, 834));
    s = deconstruct(s).state;
    s = submit(s, 1500).state;
    expect(submit(s, 1500).event).toEqual({ kind: 'refused', reason: 'layer-already-solved' });
  });

  it('accepts nothing once the problem is complete', () => {
    const s = submit(createWorkbench(add(679, 834)), 1513).state;
    expect(deconstruct(s).event).toEqual({ kind: 'refused', reason: 'complete' });
    expect(reconstruct(s).event).toEqual({ kind: 'refused', reason: 'complete' });
    expect(submit(s, 1513).event).toEqual({ kind: 'refused', reason: 'complete' });
  });

  it('leaves the state untouched when it refuses', () => {
    let s = createWorkbench(add(679, 834));
    s = deconstruct(s).state;
    expect(reconstruct(s).state).toBe(s);
  });
});

describe('a skipped layer is skipped in both directions', () => {
  it('never stops on the ones of 450 + 320', () => {
    let s = createWorkbench(add(450, 320));
    s = deconstruct(s).state;
    expect(reads(s)).toBe('400 + 300 = 700');
    s = submit(s, 700).state;
    s = reconstruct(s).state;
    // Straight back to the whole problem, not through an identical rung.
    expect(reads(s)).toBe('450 + 320 = 770');
    expect(submit(s, 770).state.done).toBe(true);
  });
});

describe('digit slots', () => {
  it('dims the places currently out of focus', () => {
    const problem = add(679, 834);
    expect(slotWidth(problem)).toBe(3);
    expect(slotsFor(679, 1, 3)).toEqual([
      { char: '6', dimmed: false },
      { char: '7', dimmed: false },
      { char: '0', dimmed: true },
    ]);
    expect(slotsFor(679, 0, 3).every((s) => !s.dimmed)).toBe(true);
  });

  it('pads a short operand so the places line up', () => {
    expect(slotsFor(34, 1, 3)).toEqual([
      { char: '', dimmed: false },
      { char: '3', dimmed: false },
      { char: '0', dimmed: true },
    ]);
  });
});
