/**
 * ExerciseSession: one set of problems worked on the focus dial.
 *
 * The mode is not a race. There is no HP, no clock and no combo — the whole
 * point is a place to sit and look at a number until its structure shows. So
 * this session owns much less than the arcade ones: a skill, a run of problems
 * on it, and the record of how much scaffold each one needed.
 *
 * That record is the output. Score is nearly incidental; `averageScaffold` is
 * the number worth reading, because it falls as the technique internalises and
 * reaching zero means the player is solving these whole.
 */
import { CONFIG, type GameConfig } from '../config';
import { generateProblem } from '../generator/generate';
import type { Problem } from '../generator/problem';
import { createRng, type Rng } from '../rng';
import { applyAttempt, type SkillTable } from '../skills/rating';
import { getSkill, type SkillId } from '../skills/taxonomy';
import {
  createWorkbench,
  deconstruct,
  ladderFor,
  reconstruct,
  submit,
  type ExerciseOp,
  type ExerciseProblem,
  type WorkbenchEvent,
  type WorkbenchState,
} from './layers';

/**
 * Skills the dial can open: the ones whose problems are a plain `a op b` with
 * both sides big enough to have a place worth dropping. Single-digit skills
 * have no ladder, and the complement skills ("43 + ? = 100") are not a binary
 * operation at all. Multiplication is the area model's job, not this one.
 *
 * A test holds this list honest in both directions — every skill here must
 * ladder, and no skill left out may quietly become laddered later.
 */
export const EXERCISE_SKILLS: readonly SkillId[] = [
  'add.double',
  'add.triple',
  'add.quad',
  'sub.double',
  'sub.borrow',
  'sub.zeros',
  'sub.triple',
  'sub.quad',
] as const;

/** The generator writes subtraction with a true minus sign, not a hyphen. */
const PROMPT_PATTERN = /^(\d+) ([+−]) (\d+)$/;

/**
 * Read a generated problem as something the dial can open, or undefined if its
 * prompt is not a plain two-operand sum.
 */
export function exerciseFromProblem(problem: Problem): ExerciseProblem | undefined {
  const match = PROMPT_PATTERN.exec(problem.prompt);
  if (!match) return undefined;
  const [, left, sign, right] = match;
  const a = Number(left);
  const b = Number(right);
  const op: ExerciseOp = sign === '+' ? 'add' : 'sub';
  if (op === 'sub' && b > a) return undefined;
  return { op, a, b };
}

/** Whether this problem is worth opening: it parses, and it has a rung to drop to. */
export function isExercisable(problem: Problem): boolean {
  const parsed = exerciseFromProblem(problem);
  return parsed !== undefined && ladderFor(parsed).length > 1;
}

/**
 * The skill a set opens on when the player has not named one: the weakest
 * eligible skill they have actually met. Never-attempted skills stay out —
 * discovering a cold profile is the placement sweep's business.
 */
export function suggestedSkill(table: SkillTable): SkillId {
  let weakest: SkillId | undefined;
  let lowest = Number.POSITIVE_INFINITY;
  for (const id of EXERCISE_SKILLS) {
    const state = table[id];
    if (!state || state.attempts === 0) continue;
    if (state.rating < lowest) {
      lowest = state.rating;
      weakest = id;
    }
  }
  // Nothing attempted yet: start at the gentlest rung of the ladder.
  return weakest ?? (EXERCISE_SKILLS[0] as SkillId);
}

/** What one finished problem cost the player. */
export interface SolvedRecord {
  problem: Problem;
  /** How far out they had to zoom before it looked solvable. */
  scaffoldDepth: number;
  misses: number;
  points: number;
}

export interface ExerciseSummary {
  skillId: SkillId;
  solved: number;
  totalMisses: number;
  score: number;
  /** Mean scaffold depth across the set; NaN before anything is solved. */
  averageScaffold: number;
  /** Solved whole, no dial, no misses. */
  cleanSolves: number;
  /**
   * The set was worked almost entirely without the scaffold — this skill no
   * longer needs the mode, and the debrief says so.
   */
  graduated: boolean;
}

export interface ExerciseSessionInit {
  seed: number;
  skills: SkillTable;
  /** Global wave counter, so exercise attempts count as recent activity. */
  totalWavesBefore: number;
  /** Named by the Playbook's RUN IT, or left out to take the suggestion. */
  skillId?: SkillId;
  config?: GameConfig;
}

export class ExerciseSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private skills: SkillTable;
  private readonly wave: number;
  readonly skillId: SkillId;

  private current: Problem;
  private bench: WorkbenchState;
  private readonly records: SolvedRecord[] = [];
  score = 0;

  constructor(init: ExerciseSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = { ...init.skills };
    this.wave = init.totalWavesBefore;
    this.skillId = init.skillId ?? suggestedSkill(init.skills);
    if (!EXERCISE_SKILLS.includes(this.skillId)) {
      throw new Error(`Skill cannot be exercised on the dial: ${this.skillId}`);
    }
    this.current = this.rollProblem();
    this.bench = createWorkbench(exerciseFromProblem(this.current)!);
  }

  /**
   * A problem this skill's recipe produced that the dial can open. Most rolls
   * qualify; the rerolls exist for the occasional `20 + 30`, whose places are
   * already bare and which the mode therefore has nothing to teach on.
   */
  private rollProblem(): Problem {
    for (let i = 0; i < this.cfg.exercise.maxGenerateAttempts; i++) {
      const problem = generateProblem(this.skillId, this.rng);
      if (isExercisable(problem)) return problem;
    }
    throw new Error(`No exercisable problem for ${this.skillId} after ${this.cfg.exercise.maxGenerateAttempts} tries`);
  }

  get problem(): Problem {
    return this.current;
  }

  get state(): WorkbenchState {
    return this.bench;
  }

  get skillTable(): SkillTable {
    return this.skills;
  }

  get solvedCount(): number {
    return this.records.length;
  }

  get setComplete(): boolean {
    return this.records.length >= this.cfg.exercise.problemsPerSet;
  }

  /** The problem in front of the player is finished and awaiting `nextProblem`. */
  get problemComplete(): boolean {
    return this.bench.done;
  }

  // --- commands ---

  deconstruct(): WorkbenchEvent {
    const step = deconstruct(this.bench);
    this.bench = step.state;
    return step.event;
  }

  reconstruct(): WorkbenchEvent {
    const step = reconstruct(this.bench);
    this.bench = step.state;
    return step.event;
  }

  /**
   * Answer the rung in focus. Completing the problem banks it: score, the
   * scaffold record, and one gentle rating attempt.
   */
  submit(typed: number): WorkbenchEvent {
    const step = submit(this.bench, typed);
    this.bench = step.state;
    if (step.event.kind === 'solved' && step.event.complete) this.bank();
    return step.event;
  }

  private bank(): void {
    const { misses, scaffoldDepth } = this.bench;
    const ex = this.cfg.exercise;
    const points = ex.solveScore + (misses === 0 ? ex.cleanBonus : 0);
    this.score += points;
    this.records.push({ problem: this.current, scaffoldDepth, misses, points });

    // One attempt per problem, not one per rung: the rungs are a single act of
    // solving, and rating each would count one problem up to four times.
    //
    // Correct means correct unaided — reaching the answer having typed nothing
    // wrong. The scaffold is a way of looking, not a hint, so leaning on it
    // costs nothing here; a wrong answer is a wrong answer at any depth.
    this.skills = applyAttempt(
      this.skills,
      this.current.skillIds,
      {
        correct: misses === 0,
        responseMs: 0,
        difficulty: this.current.difficulty,
        wave: this.wave,
        untimed: true,
      },
      { ...this.cfg.rating, kFactor: this.cfg.rating.kFactor * ex.ratingKMultiplier },
    );
  }

  /** Move to the next problem in the set. */
  nextProblem(): Problem {
    if (!this.bench.done) throw new Error('Current problem is not finished');
    this.current = this.rollProblem();
    this.bench = createWorkbench(exerciseFromProblem(this.current)!);
    return this.current;
  }

  summary(): ExerciseSummary {
    const solved = this.records.length;
    const totalMisses = this.records.reduce((sum, r) => sum + r.misses, 0);
    const scaffoldSum = this.records.reduce((sum, r) => sum + r.scaffoldDepth, 0);
    const averageScaffold = solved === 0 ? Number.NaN : scaffoldSum / solved;
    return {
      skillId: this.skillId,
      solved,
      totalMisses,
      score: this.score,
      averageScaffold,
      cleanSolves: this.records.filter((r) => r.scaffoldDepth === 0 && r.misses === 0).length,
      graduated:
        solved >= this.cfg.exercise.problemsPerSet &&
        averageScaffold <= this.cfg.exercise.graduationScaffold,
    };
  }

  /** Label for the debrief header, e.g. "Two digit addition". */
  get skillLabel(): string {
    return getSkill(this.skillId).label;
  }
}
