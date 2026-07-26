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
import { getSkill, SKILLS, type SkillId } from '../skills/taxonomy';
import {
  createWorkbench,
  deconstruct,
  digitCount,
  ladderFor,
  reconstruct,
  submit,
  type ExerciseOp,
  type ExerciseProblem,
  type WorkbenchEvent,
  type WorkbenchState,
} from './layers';
import {
  createSliceBench,
  merge,
  readingOf,
  reslice,
  select,
  solveByCutting,
  submitSlices,
  type SliceEvent,
  type SliceProblem,
  type SliceState,
} from './slices';

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
  'mul.2x1',
  'mul.2x2',
  'mul.3x2',
  'mul.4x1',
  'div.long',
  'div.big',
] as const;

/**
 * Skills the dial *can* open but deliberately does not.
 *
 * Every times table qualifies on the mechanics — a family of 2 still deals
 * `12 × 2`, and the dial will happily coarsen that to `10 × 2`. It is withheld
 * anyway: the tables are recall, and teaching a method for a fact that ought to
 * be remembered is the opposite of what tracking families per-skill is for. The
 * Playbook already gives the awkward families their own moves, which a
 * place-value ladder would quietly contradict.
 *
 * Derived from the taxonomy rather than listed, so a new family cannot arrive
 * already exercisable. Named rather than merely omitted so the eligibility test
 * can insist every openable skill has been ruled on, one way or the other.
 */
export const EXERCISE_EXCLUDED: readonly SkillId[] = [
  ...SKILLS.filter((s) => s.id.startsWith('mul.table.')).map((s) => s.id),
  // Exact division is the same argument wearing a different sign: "what times 8
  // is 56" is a fact hunted out of a table, and the Playbook says so. Laddering
  // it would teach a procedure for something meant to be recalled.
  'div.exact',
];

/** The generator writes minus, times and divide as true glyphs, not -, x and /. */
const PROMPT_PATTERN = /^(\d+) ([+−×÷]) (\d+)$/;

const SIGN_OPS: Readonly<Record<string, ExerciseOp>> = {
  '+': 'add',
  '−': 'sub',
  '×': 'mul',
  '÷': 'div',
};

/**
 * Read a generated problem as something the dial can open, or undefined if its
 * prompt is not a plain two-operand sum.
 */
export function exerciseFromProblem(problem: Problem): ExerciseProblem | undefined {
  const match = PROMPT_PATTERN.exec(problem.prompt);
  if (!match) return undefined;
  const [, left, sign, right] = match;
  const op = SIGN_OPS[sign ?? ''];
  if (!op) return undefined;
  const a = Number(left);
  const b = Number(right);
  if (op === 'sub' && b > a) return undefined;
  if (op === 'mul') {
    if (a === 0 || b === 0) return undefined;
    // The dial splits the first factor, so the wider one has to be first.
    // Multiplication does not care about the order and the player is better
    // served splitting 47 than splitting 6, so put the places where the work is.
    return digitCount(b) > digitCount(a) ? { op, a: b, b: a } : { op, a, b };
  }
  // Only exact division ladders — a remainder has no place in a quotient's
  // places, and the generator asks for those separately anyway.
  if (op === 'div' && (b === 0 || a % b !== 0)) return undefined;
  return { op, a, b };
}

/** Whether this problem is worth opening: it parses, and it has a rung to drop to. */
export function isExercisable(problem: Problem): boolean {
  const parsed = exerciseFromProblem(problem);
  return parsed !== undefined && ladderFor(parsed).length > 1;
}

// --- fractions ---

/**
 * Fraction skills the bars can hold. All five are one move seen from different
 * sides: make the slices the size the question wants, then read the picture.
 *
 * `frac.of`, `pct.of` and `pct.what` are deliberately absent. Those cut a
 * *quantity* into groups rather than a bar into slices — "3/4 of 20" is twenty
 * things shared four ways, not one bar recut — and drawing them as slice
 * matching would teach the wrong picture.
 */
export const SLICE_SKILLS: readonly SkillId[] = [
  'frac.add.same',
  'frac.add.unlike',
  'frac.lcd',
  'frac.percent',
  'frac.reduce',
] as const;

/** `a/d + b/e = ?/f` — adding fractions, like or unlike. */
const SUM_PATTERN = /^(\d+)\/(\d+) \+ (\d+)\/(\d+) = \?\/(\d+)$/;
/** `1/d + 1/e → ?ths` — naming the common denominator itself. */
const LCD_PATTERN = /^1\/(\d+) \+ 1\/(\d+) → \?ths$/;
/** `n/d = ?%` */
const PERCENT_PATTERN = /^(\d+)\/(\d+) = \?%$/;
/** `n/d = m/?` — the reduced numerator is shown, the denominator is asked. */
const REDUCE_PATTERN = /^(\d+)\/(\d+) = (\d+)\/\?$/;

/**
 * Read a generated problem as bars, or undefined if it is not one of the five
 * the bench can hold.
 */
export function sliceFromProblem(problem: Problem): SliceProblem | undefined {
  const answer = Number(problem.answer);
  if (!Number.isInteger(answer)) return undefined;

  const sum = SUM_PATTERN.exec(problem.prompt);
  if (sum) {
    const [, n1, d1, n2, d2, target] = sum.map(Number);
    const bars = [
      { num: n1!, den: d1! },
      { num: n2!, den: d2! },
    ];
    // Every bar has to be able to reach the common denominator by cutting.
    if (bars.some((b) => target! % b.den !== 0)) return undefined;
    return { goal: 'match', bars, target: target!, answer };
  }

  const lcd = LCD_PATTERN.exec(problem.prompt);
  if (lcd) {
    const [, d1, d2] = lcd.map(Number);
    const bars = [
      { num: 1, den: d1! },
      { num: 1, den: d2! },
    ];
    // The answer *is* the common denominator here, so it doubles as the target.
    if (bars.some((b) => answer % b.den !== 0)) return undefined;
    return { goal: 'common', bars, target: answer, answer };
  }

  const pct = PERCENT_PATTERN.exec(problem.prompt);
  if (pct) {
    const [, num, den] = pct.map(Number);
    if (100 % den! !== 0) return undefined;
    return { goal: 'scale', bars: [{ num: num!, den: den! }], target: 100, answer };
  }

  const red = REDUCE_PATTERN.exec(problem.prompt);
  if (red) {
    const [, num, den, target] = red.map(Number);
    if (target! === 0 || num! % target! !== 0) return undefined;
    const k = num! / target!;
    if (k < 2 || den! % k !== 0) return undefined;
    return { goal: 'reduce', bars: [{ num: num!, den: den! }], target: target!, answer };
  }

  return undefined;
}

/**
 * Whether the bars have anything to do with this problem. Same-denominator
 * sums qualify even though nothing needs recutting: seeing that both bars are
 * already sliced the same way is the lesson there.
 */
export function isSliceable(problem: Problem): boolean {
  const parsed = sliceFromProblem(problem);
  if (!parsed) return false;
  // Not merely "does it parse": cut the bars the short way and check that what
  // they then read equals the answer the game will mark. A picture that ends up
  // showing a different number than the one being asked for is teaching a lie,
  // and it is the sort of thing that goes wrong quietly.
  const solved = solveByCutting(parsed);
  return solved !== undefined && readingOf(solved) === parsed.answer;
}

/**
 * The skill a set opens on when the player has not named one: the weakest
 * eligible skill they have actually met. Never-attempted skills stay out —
 * discovering a cold profile is the placement sweep's business.
 */
export function suggestedSkill(table: SkillTable): SkillId {
  let weakest: SkillId | undefined;
  let lowest = Number.POSITIVE_INFINITY;
  for (const id of ALL_EXERCISE_SKILLS) {
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

/** Which machine a skill is worked on. */
export type BenchKind = 'dial' | 'bars';

/** Every skill Exercise can serve, on either bench. */
export const ALL_EXERCISE_SKILLS: readonly SkillId[] = [...EXERCISE_SKILLS, ...SLICE_SKILLS];

export function benchKindFor(skillId: SkillId): BenchKind | undefined {
  if (EXERCISE_SKILLS.includes(skillId)) return 'dial';
  if (SLICE_SKILLS.includes(skillId)) return 'bars';
  return undefined;
}

/**
 * A problem in progress, on whichever bench its skill belongs to.
 *
 * Two machines, one set. The dial and the bars share nothing about how a
 * problem is worked — one drops places, the other recuts slices — but they
 * share everything about what a *set* is: eight problems, a score, one gentle
 * untimed rating attempt each, and a record of how much help was needed. That
 * is what this class owns, and it is why they are not two sessions.
 */
type Bench =
  | { kind: 'dial'; state: WorkbenchState }
  | { kind: 'bars'; state: SliceState };

export class ExerciseSession {
  private readonly cfg: GameConfig;
  private readonly rng: Rng;
  private skills: SkillTable;
  private readonly wave: number;
  readonly skillId: SkillId;
  readonly kind: BenchKind;

  private current: Problem;
  private bench: Bench;
  private readonly records: SolvedRecord[] = [];
  score = 0;

  constructor(init: ExerciseSessionInit) {
    this.cfg = init.config ?? CONFIG;
    this.rng = createRng(init.seed);
    this.skills = { ...init.skills };
    this.wave = init.totalWavesBefore;
    this.skillId = init.skillId ?? suggestedSkill(init.skills);
    const kind = benchKindFor(this.skillId);
    if (!kind) throw new Error(`Skill cannot be exercised on the dial: ${this.skillId}`);
    this.kind = kind;
    this.current = this.rollProblem();
    this.bench = this.openBench(this.current);
  }

  private openBench(problem: Problem): Bench {
    return this.kind === 'dial'
      ? { kind: 'dial', state: createWorkbench(exerciseFromProblem(problem)!) }
      : { kind: 'bars', state: createSliceBench(sliceFromProblem(problem)!) };
  }

  /**
   * A problem this skill's recipe produced that its bench can actually hold.
   * Most rolls qualify; the rerolls exist for the occasional `20 + 30`, whose
   * places are already bare and which the mode has nothing to teach on.
   */
  private rollProblem(): Problem {
    const usable = this.kind === 'dial' ? isExercisable : isSliceable;
    for (let i = 0; i < this.cfg.exercise.maxGenerateAttempts; i++) {
      const problem = generateProblem(this.skillId, this.rng);
      if (usable(problem)) return problem;
    }
    throw new Error(`No exercisable problem for ${this.skillId} after ${this.cfg.exercise.maxGenerateAttempts} tries`);
  }

  get problem(): Problem {
    return this.current;
  }

  /** The dial's state. Throws on a bars set — check `kind` first. */
  get state(): WorkbenchState {
    if (this.bench.kind !== 'dial') throw new Error(`${this.skillId} is worked on the bars, not the dial`);
    return this.bench.state;
  }

  /** The bars' state. Throws on a dial set — check `kind` first. */
  get bars(): SliceState {
    if (this.bench.kind !== 'bars') throw new Error(`${this.skillId} is worked on the dial, not the bars`);
    return this.bench.state;
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
    return this.bench.state.done;
  }

  // --- dial commands ---

  deconstruct(): WorkbenchEvent {
    const step = deconstruct(this.state);
    this.bench = { kind: 'dial', state: step.state };
    return step.event;
  }

  reconstruct(): WorkbenchEvent {
    const step = reconstruct(this.state);
    this.bench = { kind: 'dial', state: step.state };
    return step.event;
  }

  // --- bars commands ---

  selectBar(index: number): SliceEvent {
    const step = select(this.bars, index);
    this.bench = { kind: 'bars', state: step.state };
    return step.event;
  }

  reslice(k: number): SliceEvent {
    const step = reslice(this.bars, k);
    this.bench = { kind: 'bars', state: step.state };
    return step.event;
  }

  fuse(k: number): SliceEvent {
    const step = merge(this.bars, k);
    this.bench = { kind: 'bars', state: step.state };
    return step.event;
  }

  /**
   * Answer whatever is in front of the player. Completing the problem banks it:
   * score, the record of how much help it took, and one gentle rating attempt.
   */
  submit(typed: number): WorkbenchEvent | SliceEvent {
    if (this.bench.kind === 'dial') {
      const step = submit(this.bench.state, typed);
      this.bench = { kind: 'dial', state: step.state };
      if (step.event.kind === 'solved' && step.event.complete) this.bank();
      return step.event;
    }
    const step = submitSlices(this.bench.state, typed);
    this.bench = { kind: 'bars', state: step.state };
    if (step.event.kind === 'solved') this.bank();
    return step.event;
  }

  private bank(): void {
    const misses = this.bench.state.misses;
    // How much help this problem took, on whichever bench it was worked. The
    // dial can report degrees of it — how many places had to come off — where
    // the bars can only say whether they were leaned on at all, so a bars
    // problem scores 0 or 1 on the same scale.
    const scaffoldDepth =
      this.bench.kind === 'dial'
        ? this.bench.state.scaffoldDepth
        : this.bench.state.usedScaffold
          ? 1
          : 0;
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
    if (!this.bench.state.done) throw new Error('Current problem is not finished');
    this.current = this.rollProblem();
    this.bench = this.openBench(this.current);
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
