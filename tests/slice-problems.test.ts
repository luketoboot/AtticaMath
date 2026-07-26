import { describe, expect, it } from 'vitest';
import {
  isSliceable,
  SLICE_SKILLS,
  sliceFromProblem,
} from '../src/core/exercise/session';
import {
  barsReady,
  createSliceBench,
  readingOf,
  solveByCutting,
  submitSlices,
} from '../src/core/exercise/slices';
import { generateProblem, hasRecipe } from '../src/core/generator/generate';
import type { Problem } from '../src/core/generator/problem';
import { createRng } from '../src/core/rng';
import { allSkillIds } from '../src/core/skills/taxonomy';

const fake = (prompt: string, answer: string): Problem => ({
  id: 1,
  skillIds: ['frac.percent'],
  prompt,
  answer,
  difficulty: 500,
});

describe('reading a generated problem as bars', () => {
  it('takes an unlike sum', () => {
    expect(sliceFromProblem(fake('1/2 + 1/3 = ?/6', '5'))).toEqual({
      goal: 'match',
      bars: [
        { num: 1, den: 2 },
        { num: 1, den: 3 },
      ],
      target: 6,
      answer: 5,
    });
  });

  it('takes a like sum, where nothing needs recutting', () => {
    const parsed = sliceFromProblem(fake('3/8 + 2/8 = ?/8', '5'))!;
    expect(parsed.target).toBe(8);
    expect(barsReady(createSliceBench(parsed))).toBe(true);
  });

  it('takes a common-denominator question, which reads the slice size', () => {
    // Same cutting as a sum, different number read off — so it is its own goal.
    expect(sliceFromProblem(fake('1/4 + 1/6 → ?ths', '12'))).toEqual({
      goal: 'common',
      bars: [
        { num: 1, den: 4 },
        { num: 1, den: 6 },
      ],
      target: 12,
      answer: 12,
    });
  });

  it('reads the denominator even when one bar needed no cutting', () => {
    // 1/12 + 1/4 is already in twelfths on the left. Counting numerators here
    // would answer 4, and the question asked for 12.
    const parsed = sliceFromProblem(fake('1/12 + 1/4 → ?ths', '12'))!;
    expect(readingOf(solveByCutting(parsed)!)).toBe(12);
  });

  it('takes a percentage', () => {
    expect(sliceFromProblem(fake('3/20 = ?%', '15'))).toEqual({
      goal: 'scale',
      bars: [{ num: 3, den: 20 }],
      target: 100,
      answer: 15,
    });
  });

  it('takes a reduction', () => {
    expect(sliceFromProblem(fake('18/24 = 3/?', '4'))).toEqual({
      goal: 'reduce',
      bars: [{ num: 18, den: 24 }],
      target: 3,
      answer: 4,
    });
  });

  it('refuses anything that is not a bar problem', () => {
    expect(sliceFromProblem(fake('679 + 834', '1513'))).toBeUndefined();
    expect(sliceFromProblem(fake('3/4 OF 20', '15'))).toBeUndefined();
    expect(sliceFromProblem(fake('15% OF 60', '9'))).toBeUndefined();
    expect(sliceFromProblem(fake('24 IS ?% OF 40', '60'))).toBeUndefined();
  });

  it('refuses a sum whose bars cannot reach the stated denominator', () => {
    // Fifths never become sixths, so the picture could not be drawn honestly.
    expect(sliceFromProblem(fake('1/5 + 1/3 = ?/6', '0'))).toBeUndefined();
  });
});

describe('every listed skill really works on the bars', () => {
  it('parses, and its picture agrees with its answer', () => {
    const rng = createRng(17);
    for (const id of SLICE_SKILLS) {
      for (let i = 0; i < 200; i++) {
        const problem = generateProblem(id, rng);
        const parsed = sliceFromProblem(problem);
        expect(parsed, `${id} produced "${problem.prompt}"`).toBeDefined();
        expect(isSliceable(problem), `${id}: "${problem.prompt}"`).toBe(true);
      }
    }
  });

  /**
   * The load-bearing claim of the whole mode: cut the bars the way the hint
   * says, and the number you read off is the number the game wants. If these
   * ever disagree, the picture is teaching a lie.
   */
  it('solving by cutting reaches the answer the game asks for', () => {
    const rng = createRng(53);
    for (const id of SLICE_SKILLS) {
      for (let i = 0; i < 120; i++) {
        const problem = generateProblem(id, rng);
        const parsed = sliceFromProblem(problem)!;
        const s = solveByCutting(parsed);
        expect(s, `${id}: "${problem.prompt}"`).toBeDefined();
        expect(barsReady(s!), `${id}: "${problem.prompt}"`).toBe(true);
        expect(readingOf(s!), `${id}: "${problem.prompt}"`).toBe(parsed.answer);
        expect(submitSlices(s!, readingOf(s!)!).state.done).toBe(true);
      }
    }
  });
});

describe('nothing else quietly qualifies', () => {
  it('forces a ruling on every skill the bars can hold', () => {
    const rng = createRng(71);
    const undecided = allSkillIds().filter((id) => hasRecipe(id) && !SLICE_SKILLS.includes(id));
    for (const id of undecided) {
      for (let i = 0; i < 100; i++) {
        const problem = generateProblem(id, rng);
        expect(isSliceable(problem), `${id} produced a sliceable "${problem.prompt}"`).toBe(false);
      }
    }
  });
});
