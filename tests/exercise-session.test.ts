import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  EXERCISE_SKILLS,
  ExerciseSession,
  exerciseFromProblem,
  isExercisable,
  suggestedSkill,
} from '../src/core/exercise/session';
import { currentLayer } from '../src/core/exercise/layers';
import { generateProblem, hasRecipe } from '../src/core/generator/generate';
import type { Problem } from '../src/core/generator/problem';
import { createRng } from '../src/core/rng';
import { applyAttempt, createSkillTable, freshSkillState } from '../src/core/skills/rating';
import { allSkillIds } from '../src/core/skills/taxonomy';

const table = () => createSkillTable(allSkillIds(), CONFIG.rating);

const fakeProblem = (prompt: string): Problem => ({
  id: 1,
  skillIds: ['add.double'],
  prompt,
  answer: '0',
  difficulty: 500,
});

/** Walk one problem to completion, descending `descents` rungs first. */
function solveWith(session: ExerciseSession, descents: number, missFirst = false): void {
  for (let i = 0; i < descents; i++) session.deconstruct();
  if (missFirst) session.submit(-1);
  while (!session.problemComplete) {
    session.submit(currentLayer(session.state).value);
    if (!session.problemComplete) session.reconstruct();
  }
}

describe('eligibility', () => {
  it('every listed skill produces problems the dial can open', () => {
    const rng = createRng(11);
    for (const id of EXERCISE_SKILLS) {
      for (let i = 0; i < 200; i++) {
        const problem = generateProblem(id, rng);
        const parsed = exerciseFromProblem(problem);
        expect(parsed, `${id} produced "${problem.prompt}"`).toBeDefined();
        // Not every single roll has to ladder (20 + 30 does not), but it must
        // at least parse; the session rerolls the flat ones.
        expect(String(parsed!.a)).toBe(problem.prompt.split(' ')[0]);
      }
    }
  });

  it('finds a laddered problem for every listed skill', () => {
    for (const id of EXERCISE_SKILLS) {
      const session = new ExerciseSession({ seed: 5, skills: table(), totalWavesBefore: 0, skillId: id });
      expect(isExercisable(session.problem), `${id}: ${session.problem.prompt}`).toBe(true);
    }
  });

  it('no skill left off the list quietly qualifies', () => {
    const rng = createRng(23);
    const unlisted = allSkillIds().filter((id) => hasRecipe(id) && !EXERCISE_SKILLS.includes(id));
    for (const id of unlisted) {
      for (let i = 0; i < 100; i++) {
        const problem = generateProblem(id, rng);
        expect(isExercisable(problem), `${id} produced an exercisable "${problem.prompt}"`).toBe(false);
      }
    }
  });

  it('reads both signs and refuses anything else', () => {
    expect(exerciseFromProblem(fakeProblem('679 + 834'))).toEqual({ op: 'add', a: 679, b: 834 });
    expect(exerciseFromProblem(fakeProblem('634 − 287'))).toEqual({ op: 'sub', a: 634, b: 287 });
    // A hyphen is not the generator's minus sign.
    expect(exerciseFromProblem(fakeProblem('634 - 287'))).toBeUndefined();
    expect(exerciseFromProblem(fakeProblem('43 + ? = 100'))).toBeUndefined();
    expect(exerciseFromProblem(fakeProblem('47 × 6'))).toBeUndefined();
    expect(exerciseFromProblem(fakeProblem('3 + 4 × 5'))).toBeUndefined();
    // Would go negative, so the workbench could not accept it.
    expect(exerciseFromProblem(fakeProblem('28 − 95'))).toBeUndefined();
  });

  it('refuses to open a set on a skill the dial cannot serve', () => {
    expect(
      () => new ExerciseSession({ seed: 1, skills: table(), totalWavesBefore: 0, skillId: 'mul.2x2' }),
    ).toThrow(/cannot be exercised/);
  });
});

describe('choosing the skill', () => {
  it('suggests the weakest eligible skill the player has met', () => {
    const skills = table();
    skills['sub.borrow'] = { ...freshSkillState(CONFIG.rating), rating: 300, attempts: 12 };
    skills['add.triple'] = { ...freshSkillState(CONFIG.rating), rating: 700, attempts: 9 };
    expect(suggestedSkill(skills)).toBe('sub.borrow');
  });

  it('ignores skills never attempted, however low they sit', () => {
    const skills = table();
    skills['add.quad'] = { ...freshSkillState(CONFIG.rating), rating: 10, attempts: 0 };
    skills['add.triple'] = { ...freshSkillState(CONFIG.rating), rating: 700, attempts: 4 };
    expect(suggestedSkill(skills)).toBe('add.triple');
  });

  it('falls back to the gentlest rung on a cold profile', () => {
    expect(suggestedSkill(table())).toBe('add.double');
  });
});

describe('working a set', () => {
  it('banks a solve and moves on', () => {
    const session = new ExerciseSession({
      seed: 3,
      skills: table(),
      totalWavesBefore: 4,
      skillId: 'add.triple',
    });
    const first = session.problem;
    solveWith(session, 2);

    expect(session.problemComplete).toBe(true);
    expect(session.solvedCount).toBe(1);
    expect(session.score).toBe(CONFIG.exercise.solveScore + CONFIG.exercise.cleanBonus);

    const next = session.nextProblem();
    expect(next.id).not.toBe(first.id);
    expect(session.problemComplete).toBe(false);
  });

  it('will not advance while a problem is unfinished', () => {
    const session = new ExerciseSession({ seed: 3, skills: table(), totalWavesBefore: 0, skillId: 'add.triple' });
    expect(() => session.nextProblem()).toThrow(/not finished/);
  });

  it('drops the clean bonus when a rung was missed', () => {
    const session = new ExerciseSession({ seed: 8, skills: table(), totalWavesBefore: 0, skillId: 'sub.borrow' });
    solveWith(session, 1, true);
    expect(session.score).toBe(CONFIG.exercise.solveScore);
    expect(session.summary().totalMisses).toBe(1);
  });

  it('runs a whole set and reports the scaffold that was used', () => {
    const session = new ExerciseSession({ seed: 12, skills: table(), totalWavesBefore: 0, skillId: 'add.triple' });
    for (let i = 0; i < CONFIG.exercise.problemsPerSet; i++) {
      solveWith(session, 2);
      if (!session.setComplete) session.nextProblem();
    }
    const summary = session.summary();
    expect(session.setComplete).toBe(true);
    expect(summary.solved).toBe(CONFIG.exercise.problemsPerSet);
    expect(summary.averageScaffold).toBe(2);
    expect(summary.cleanSolves).toBe(0);
    expect(summary.graduated).toBe(false);
  });

  it('graduates a set solved whole', () => {
    const session = new ExerciseSession({ seed: 12, skills: table(), totalWavesBefore: 0, skillId: 'add.triple' });
    for (let i = 0; i < CONFIG.exercise.problemsPerSet; i++) {
      solveWith(session, 0);
      if (!session.setComplete) session.nextProblem();
    }
    const summary = session.summary();
    expect(summary.averageScaffold).toBe(0);
    expect(summary.cleanSolves).toBe(CONFIG.exercise.problemsPerSet);
    expect(summary.graduated).toBe(true);
  });

  it('reports no average before anything is solved', () => {
    const session = new ExerciseSession({ seed: 1, skills: table(), totalWavesBefore: 0, skillId: 'add.double' });
    expect(session.summary().averageScaffold).toBeNaN();
  });
});

describe('what a set tells the skill model', () => {
  it('rates one attempt per problem, not one per rung', () => {
    const session = new ExerciseSession({ seed: 3, skills: table(), totalWavesBefore: 7, skillId: 'add.triple' });
    solveWith(session, 2);
    const state = session.skillTable['add.triple']!;
    expect(state.attempts).toBe(1);
    expect(state.correct).toBe(1);
    expect(state.lastAttemptWave).toBe(7);
  });

  it('counts a problem missed at any depth as incorrect', () => {
    const session = new ExerciseSession({ seed: 8, skills: table(), totalWavesBefore: 0, skillId: 'sub.borrow' });
    const before = session.skillTable['sub.borrow']!.rating;
    solveWith(session, 1, true);
    const state = session.skillTable['sub.borrow']!;
    expect(state.attempts).toBe(1);
    expect(state.correct).toBe(0);
    expect(state.rating).toBeLessThan(before);
  });

  it('leaves fluency alone, because the mode has no clock', () => {
    const skills = table();
    skills['add.triple'] = { ...freshSkillState(CONFIG.rating), rating: 700, attempts: 20, correct: 18, fluency: 2.4 };
    const session = new ExerciseSession({ seed: 3, skills, totalWavesBefore: 0, skillId: 'add.triple' });
    solveWith(session, 2);
    expect(session.skillTable['add.triple']!.fluency).toBe(2.4);
  });

  it('moves the rating more gently than a timed answer would', () => {
    const session = new ExerciseSession({ seed: 3, skills: table(), totalWavesBefore: 0, skillId: 'add.triple' });
    const problem = session.problem;
    solveWith(session, 2);
    const gained = session.skillTable['add.triple']!.rating - CONFIG.rating.initialRating;

    const timed = applyAttempt(
      table(),
      problem.skillIds,
      { correct: true, responseMs: 0, difficulty: problem.difficulty, wave: 0 },
      CONFIG.rating,
    );
    const timedGain = timed['add.triple']!.rating - CONFIG.rating.initialRating;

    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThan(timedGain);
  });
});
