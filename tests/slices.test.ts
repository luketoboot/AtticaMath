import { describe, expect, it } from 'vitest';
import {
  barsReady,
  createSliceBench,
  cutStep,
  factorTo,
  fuseStep,
  solveByCutting,
  MAX_SLICES,
  merge,
  readingOf,
  reslice,
  select,
  sliceHint,
  submitSlices,
  valueOf,
  type SliceProblem,
  type SliceState,
} from '../src/core/exercise/slices';
import { createRng } from '../src/core/rng';

/** 1/2 + 1/3 = ?/6 — the case the verb exists for. */
const unlike = (): SliceProblem => ({
  goal: 'match',
  bars: [
    { num: 1, den: 2 },
    { num: 1, den: 3 },
  ],
  target: 6,
  answer: 5,
});

/** 3/20 = ?% — scale the denominator to a hundred and read the top. */
const percent = (): SliceProblem => ({
  goal: 'scale',
  bars: [{ num: 3, den: 20 }],
  target: 100,
  answer: 15,
});

/** 18/24 = 3/? — fuse slices until the top reads 3. */
const reduce = (): SliceProblem => ({
  goal: 'reduce',
  bars: [{ num: 18, den: 24 }],
  target: 3,
  answer: 4,
});

const reads = (s: SliceState): string => s.bars.map((b) => `${b.num}/${b.den}`).join(' + ');

describe('the verbs never change the number', () => {
  it('reslice cuts slices without moving the boundary', () => {
    let s = createSliceBench(unlike());
    expect(valueOf(s.bars[0]!)).toBe(0.5);
    s = reslice(s, 3).state;
    expect(s.bars[0]).toEqual({ num: 3, den: 6 });
    expect(valueOf(s.bars[0]!)).toBe(0.5);
  });

  it('merge fuses slices without moving the boundary', () => {
    let s = createSliceBench(reduce());
    s = merge(s, 6).state;
    expect(s.bars[0]).toEqual({ num: 3, den: 4 });
    expect(valueOf(s.bars[0]!)).toBe(0.75);
  });

  it('holds the value across any legal run of moves', () => {
    const rng = createRng(31);
    for (let trial = 0; trial < 200; trial++) {
      const start = { num: rng.int(1, 8), den: rng.int(2, 9) };
      let s = createSliceBench({ goal: 'scale', bars: [start], target: 100, answer: 0 });
      const value = valueOf(start);
      for (let move = 0; move < 6; move++) {
        const step = rng.chance(0.6) ? reslice(s, rng.int(2, 5)) : merge(s, rng.int(2, 5));
        s = step.state;
        expect(valueOf(s.bars[0]!), `${start.num}/${start.den}`).toBeCloseTo(value, 10);
      }
    }
  });
});

describe('making unlike slices match', () => {
  it('walks 1/2 + 1/3 to sixths', () => {
    let s = createSliceBench(unlike());
    expect(barsReady(s)).toBe(false);
    expect(sliceHint(s)).toBe('Cut each slice of 1/2 into 3.');

    s = reslice(s, 3).state;
    expect(reads(s)).toBe('3/6 + 1/3');
    expect(barsReady(s)).toBe(false);

    s = select(s, 1).state;
    expect(sliceHint(s)).toBe('Cut each slice of 1/3 into 2.');
    s = reslice(s, 2).state;
    expect(reads(s)).toBe('3/6 + 2/6');

    expect(barsReady(s)).toBe(true);
    expect(readingOf(s)).toBe(5);
    expect(sliceHint(s)).toBe('Same slices now. Count them.');
    expect(submitSlices(s, 5).state.done).toBe(true);
  });

  it('counts nothing until the slices agree', () => {
    const s = createSliceBench(unlike());
    expect(readingOf(s)).toBeUndefined();
  });

  it('starts ready when the slices already match', () => {
    const s = createSliceBench({
      goal: 'match',
      bars: [
        { num: 3, den: 8 },
        { num: 2, den: 8 },
      ],
      target: 8,
      answer: 5,
    });
    expect(barsReady(s)).toBe(true);
    expect(readingOf(s)).toBe(5);
  });

  it('says which bar cannot get there by cutting', () => {
    // Fifths will never become sixths.
    const s = createSliceBench({
      goal: 'match',
      bars: [{ num: 1, den: 5 }, { num: 1, den: 3 }],
      target: 6,
      answer: 0,
    });
    expect(sliceHint(s)).toBe('1/5 will not reach 6 slices by cutting. Try the other bar.');
  });

  it('opens on a bar that has work to do', () => {
    // 1/4 is already in quarters; the thirds are what need cutting.
    const s = createSliceBench({
      goal: 'match',
      bars: [{ num: 1, den: 4 }, { num: 1, den: 2 }],
      target: 4,
      answer: 3,
    });
    expect(s.selected).toBe(1);
    expect(sliceHint(s)).toBe('Cut each slice of 1/2 into 2.');
  });

  it('does not tell a bar it cannot reach the size it already is', () => {
    let s = createSliceBench({
      goal: 'match',
      bars: [{ num: 1, den: 4 }, { num: 1, den: 2 }],
      target: 4,
      answer: 3,
    });
    s = select(s, 0).state;
    expect(sliceHint(s)).toBe('1/4 is already in 4ths. The other bar is not.');
  });
});

describe('scaling to a hundred', () => {
  it('takes 3/20 to hundredths in one cut', () => {
    let s = createSliceBench(percent());
    expect(factorTo(s.bars[0]!, 100)).toBe(5);
    s = reslice(s, 5).state;
    expect(s.bars[0]).toEqual({ num: 15, den: 100 });
    expect(barsReady(s)).toBe(true);
    // The filled slices out of a hundred are the percentage, which is the point.
    expect(readingOf(s)).toBe(15);
    expect(readingOf(s)).toBe(s.problem.answer);
  });

  it('never advises a cut the player has no chip for', () => {
    // 4/5 needs twenty times as many slices, and there is no ×20 to press.
    const problem: SliceProblem = { goal: 'scale', bars: [{ num: 4, den: 5 }], target: 100, answer: 80 };
    expect(factorTo(problem.bars[0]!, 100)).toBe(20);
    expect(cutStep(problem.bars[0]!, 100)).toBe(5);
    expect(sliceHint(createSliceBench(problem))).toBe('Cut each slice of 4/5 into 5.');
    // And the two-step route still lands exactly on a hundred.
    const solved = solveByCutting(problem)!;
    expect(solved.bars[0]).toEqual({ num: 80, den: 100 });
    expect(readingOf(solved)).toBe(80);
  });

  it('fuses in steps it can actually press, too', () => {
    // 18/24 down to 3/4 needs a factor of six, which is not on offer: 3 then 2.
    const problem: SliceProblem = { goal: 'reduce', bars: [{ num: 18, den: 24 }], target: 3, answer: 4 };
    expect(fuseStep(problem.bars[0]!, 3)).toBe(3);
    expect(sliceHint(createSliceBench(problem))).toBe('Fuse every 3 slices of 18/24 into one.');
    expect(solveByCutting(problem)!.bars[0]).toEqual({ num: 3, den: 4 });
  });
});

describe('fusing back down', () => {
  it('reduces 18/24 to 3/4', () => {
    let s = createSliceBench(reduce());
    expect(sliceHint(s)).toBe('Fuse every 3 slices of 18/24 into one.');
    s = merge(s, 6).state;
    expect(barsReady(s)).toBe(true);
    expect(readingOf(s)).toBe(4);
  });

  it('refuses a fuse that would move the boundary', () => {
    const s = createSliceBench(reduce());
    // 18 and 24 are both even, so 4 divides the slices but not the filled part.
    expect(merge(s, 4).event).toEqual({ kind: 'refused', reason: 'will-not-divide' });
    expect(merge(s, 5).event).toEqual({ kind: 'refused', reason: 'will-not-divide' });
    expect(merge(s, 6).event).toMatchObject({ kind: 'merged' });
  });
});

describe('refusals', () => {
  it('rejects a factor below two', () => {
    const s = createSliceBench(unlike());
    expect(reslice(s, 1).event).toEqual({ kind: 'refused', reason: 'bad-factor' });
    expect(reslice(s, 0).event).toEqual({ kind: 'refused', reason: 'bad-factor' });
    expect(merge(s, 1).event).toEqual({ kind: 'refused', reason: 'bad-factor' });
  });

  it('will not cut a bar into a grey smear', () => {
    let s = createSliceBench(unlike());
    for (let i = 0; i < 6; i++) s = reslice(s, 3).state;
    expect(s.bars[0]!.den).toBeLessThanOrEqual(MAX_SLICES);
    expect(reslice(s, 3).event).toEqual({ kind: 'refused', reason: 'too-many-slices' });
  });

  it('rejects a bar that is not there', () => {
    const s = createSliceBench(percent());
    expect(select(s, 1).event).toEqual({ kind: 'refused', reason: 'no-such-bar' });
    expect(select(s, -1).event).toEqual({ kind: 'refused', reason: 'no-such-bar' });
  });

  it('accepts nothing once solved', () => {
    const s = submitSlices(createSliceBench(unlike()), 5).state;
    expect(reslice(s, 2).event).toEqual({ kind: 'refused', reason: 'complete' });
    expect(merge(s, 2).event).toEqual({ kind: 'refused', reason: 'complete' });
    expect(submitSlices(s, 5).event).toEqual({ kind: 'refused', reason: 'complete' });
  });

  it('leaves the state untouched when it refuses', () => {
    const s = createSliceBench(unlike());
    expect(reslice(s, 1).state).toBe(s);
  });
});

describe('answering', () => {
  it('lets a player who can see it skip the bars entirely', () => {
    const step = submitSlices(createSliceBench(unlike()), 5);
    expect(step.event).toEqual({ kind: 'solved' });
    expect(step.state.done).toBe(true);
    expect(step.state.usedScaffold).toBe(false);
  });

  it('records that the bars were brought into agreement', () => {
    let s = createSliceBench(unlike());
    s = reslice(s, 3).state;
    s = select(s, 1).state;
    s = reslice(s, 2).state;
    expect(s.usedScaffold).toBe(true);
    // Cutting further breaks the match, but the scaffold was still leaned on.
    s = reslice(s, 2).state;
    expect(barsReady(s)).toBe(false);
    expect(s.usedScaffold).toBe(true);
  });

  it('costs a miss and holds the bars where they are', () => {
    const s = createSliceBench(unlike());
    const step = submitSlices(s, 4);
    expect(step.event).toEqual({ kind: 'wrong', typed: 4 });
    expect(step.state.misses).toBe(1);
    expect(step.state.done).toBe(false);
    expect(step.state.bars).toEqual(s.bars);
  });
});
