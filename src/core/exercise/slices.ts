/**
 * Fraction bars, and the verb that makes unlike things add.
 *
 * The place-value dial cannot help here. Halves and thirds do not fail to add
 * because the numbers are big; they fail because the slices are different
 * sizes, and no amount of zooming out changes that. What is needed is a
 * different move: cut every slice into smaller ones until both bars agree.
 *
 *   1/2 + 1/3      halves and thirds — nothing lines up
 *   3/6 + 1/3      reslice the halves by 3
 *   3/6 + 2/6      reslice the thirds by 2 — now both are sixths
 *   → 5/6          count the filled slices
 *
 * RESLICE cuts each slice of a bar into `k` smaller ones. MERGE fuses `k`
 * slices back into one. Both leave the bar covering exactly the same amount of
 * ground — that invariant is the whole idea, and it is what a picture teaches
 * and a rule does not: 3/6 is not a new number, it is 1/2 wearing more cuts.
 *
 * Pure: this owns the arithmetic, the scene owns the boxes.
 */

export interface Bar {
  num: number;
  den: number;
}

/**
 * What "the bars are right" means, which differs by what is being asked.
 *
 *  - `match`  every bar reaches a shared denominator and the filled slices are
 *             counted: adding fractions, like or unlike.
 *  - `common` the same cutting, but the question is the slice size itself, so
 *             the denominator is what gets read. Worth its own goal rather than
 *             a flag on `match`: the bars end up identical and the number the
 *             player is looking for is a different one, which is precisely the
 *             kind of thing that goes wrong silently.
 *  - `scale`  one bar is cut up to a stated denominator — a hundred, for a
 *             percentage — and the answer is read off the top.
 *  - `reduce` one bar is fused down until its numerator is the stated one, and
 *             the answer is the denominator that came with it.
 */
export type SliceGoal = 'match' | 'common' | 'scale' | 'reduce';

export interface SliceProblem {
  goal: SliceGoal;
  /** Two bars for `match`, one for `scale` and `reduce`. */
  bars: readonly Bar[];
  /** Denominator to reach (match, scale), or numerator to reduce to (reduce). */
  target: number;
  /** What the player types once the bars are right. */
  answer: number;
}

export interface SliceState {
  readonly problem: SliceProblem;
  readonly bars: readonly Bar[];
  /** Which bar the next verb applies to. */
  readonly selected: number;
  readonly moves: number;
  readonly misses: number;
  /** True once the bars have ever been brought into agreement. */
  readonly usedScaffold: boolean;
  readonly done: boolean;
}

export type SliceEvent =
  | { kind: 'resliced'; bar: number; k: number; to: Bar }
  | { kind: 'merged'; bar: number; k: number; to: Bar }
  | { kind: 'selected'; bar: number }
  | { kind: 'solved' }
  | { kind: 'wrong'; typed: number }
  | { kind: 'refused'; reason: SliceRefusal };

export type SliceRefusal =
  | 'no-such-bar'
  | 'bad-factor'
  | 'will-not-divide'
  | 'too-many-slices'
  | 'complete';

export interface SliceStep {
  state: SliceState;
  event: SliceEvent;
}

/**
 * A bar past this many slices is a grey smear on screen and a fraction nobody
 * is reasoning about. Comfortably above the hundred a percentage needs.
 */
export const MAX_SLICES = 240;

export function createSliceBench(problem: SliceProblem): SliceState {
  if (problem.bars.length === 0) throw new Error('A slice bench needs at least one bar');
  for (const bar of problem.bars) {
    if (!Number.isInteger(bar.num) || !Number.isInteger(bar.den)) {
      throw new Error(`Bar must be whole: ${bar.num}/${bar.den}`);
    }
    if (bar.den <= 0) throw new Error(`Bar needs slices: ${bar.num}/${bar.den}`);
  }
  return {
    problem,
    bars: problem.bars.map((b) => ({ ...b })),
    selected: 0,
    moves: 0,
    misses: 0,
    usedScaffold: false,
    done: false,
  };
}

/** How much of the bar is filled, as a plain number. Invariant under both verbs. */
export function valueOf(bar: Bar): number {
  return bar.num / bar.den;
}

/** Whether the bars now satisfy the problem's goal. */
export function barsReady(state: SliceState): boolean {
  const { goal, target } = state.problem;
  const first = state.bars[0];
  if (!first) return false;
  if (goal === 'reduce') return first.num === target;
  if (goal === 'scale') return first.den === target;
  return state.bars.every((b) => b.den === target);
}

/**
 * The count the ready bars are showing — the numerator sum for a match, the
 * numerator for a scaled bar, the denominator for a reduced one. This is what
 * the player reads off, and it should equal the problem's answer once the bars
 * are right; the tests hold those two together.
 */
export function readingOf(state: SliceState): number | undefined {
  if (!barsReady(state)) return undefined;
  const { goal } = state.problem;
  const first = state.bars[0]!;
  if (goal === 'reduce') return first.den;
  if (goal === 'scale') return first.num;
  if (goal === 'common') return first.den;
  return state.bars.reduce((sum, b) => sum + b.num, 0);
}

/**
 * Cut or fuse every bar straight to what the goal asks, in one move each.
 *
 * The shortest honest route through a problem, used both to check that a
 * problem is worth putting on the bench at all and to prove the picture agrees
 * with the answer the game will mark. Undefined when no whole-number move gets
 * there — which means the bars could not tell the truth about this problem.
 */
export function solveByCutting(problem: SliceProblem): SliceState | undefined {
  let state = createSliceBench(problem);
  if (problem.goal === 'reduce') {
    const bar = state.bars[0]!;
    if (problem.target <= 0 || bar.num % problem.target !== 0) return undefined;
    const k = bar.num / problem.target;
    if (k >= 2) {
      const step = merge(state, k);
      if (step.event.kind === 'refused') return undefined;
      state = step.state;
    }
  } else {
    for (let i = 0; i < state.bars.length; i++) {
      const bar = state.bars[i]!;
      if (bar.den === problem.target) continue;
      const k = factorTo(bar, problem.target);
      if (!k) return undefined;
      state = select(state, i).state;
      const step = reslice(state, k);
      if (step.event.kind === 'refused') return undefined;
      state = step.state;
    }
  }
  return barsReady(state) ? state : undefined;
}

function refuse(state: SliceState, reason: SliceRefusal): SliceStep {
  return { state, event: { kind: 'refused', reason } };
}

export function select(state: SliceState, bar: number): SliceStep {
  if (state.done) return refuse(state, 'complete');
  if (bar < 0 || bar >= state.bars.length) return refuse(state, 'no-such-bar');
  return { state: { ...state, selected: bar }, event: { kind: 'selected', bar } };
}

/** Cut every slice of the selected bar into `k`. The bar covers the same ground. */
export function reslice(state: SliceState, k: number): SliceStep {
  if (state.done) return refuse(state, 'complete');
  if (!Number.isInteger(k) || k < 2) return refuse(state, 'bad-factor');
  const bar = state.bars[state.selected];
  if (!bar) return refuse(state, 'no-such-bar');
  if (bar.den * k > MAX_SLICES) return refuse(state, 'too-many-slices');
  const to: Bar = { num: bar.num * k, den: bar.den * k };
  return {
    state: advance(state, to),
    event: { kind: 'resliced', bar: state.selected, k, to },
  };
}

/** Fuse `k` slices of the selected bar into one. Only when they divide evenly. */
export function merge(state: SliceState, k: number): SliceStep {
  if (state.done) return refuse(state, 'complete');
  if (!Number.isInteger(k) || k < 2) return refuse(state, 'bad-factor');
  const bar = state.bars[state.selected];
  if (!bar) return refuse(state, 'no-such-bar');
  // Fusing slices that do not divide the filled part would move the boundary,
  // which is to say it would change the number. Refuse rather than round.
  if (bar.num % k !== 0 || bar.den % k !== 0) return refuse(state, 'will-not-divide');
  const to: Bar = { num: bar.num / k, den: bar.den / k };
  return {
    state: advance(state, to),
    event: { kind: 'merged', bar: state.selected, k, to },
  };
}

function advance(state: SliceState, to: Bar): SliceState {
  const bars = state.bars.map((b, i) => (i === state.selected ? to : b));
  const next: SliceState = { ...state, bars, moves: state.moves + 1 };
  // Sticky: having once brought the bars into agreement counts as having used
  // the scaffold, even if a later move takes them back out of it.
  return { ...next, usedScaffold: state.usedScaffold || barsReady(next) };
}

/**
 * Answer the problem. Allowed at any time — a player who can see that
 * 1/2 + 1/3 is 5/6 without cutting anything should not be made to cut it. The
 * bars are a way of looking, not a gate.
 */
export function submitSlices(state: SliceState, typed: number): SliceStep {
  if (state.done) return refuse(state, 'complete');
  if (typed !== state.problem.answer) {
    return { state: { ...state, misses: state.misses + 1 }, event: { kind: 'wrong', typed } };
  }
  return { state: { ...state, done: true, moves: state.moves + 1 }, event: { kind: 'solved' } };
}

/**
 * The factor that would take a bar straight to the target denominator, or
 * undefined when no whole number does. What the scene lights up as the helpful
 * move, and what a hint is written from.
 */
export function factorTo(bar: Bar, target: number): number | undefined {
  if (target % bar.den !== 0) return undefined;
  const k = target / bar.den;
  return k >= 2 ? k : undefined;
}

/** One line naming the move the bars are waiting for. */
export function sliceHint(state: SliceState): string {
  const { goal, target } = state.problem;
  if (barsReady(state)) {
    if (goal === 'reduce') return 'Fused as far as it goes. Read the slice size.';
    if (goal === 'scale') return 'A hundred slices. Read the filled ones.';
    if (goal === 'common') return 'Same slices now. Name the size.';
    return 'Same slices now. Count them.';
  }
  const bar = state.bars[state.selected]!;
  if (goal === 'reduce') {
    return `${bar.num}/${bar.den} still. Fuse slices until the top reads ${target}.`;
  }
  const k = factorTo(bar, target);
  if (k) return `Cut each slice of ${bar.num}/${bar.den} into ${k}.`;
  return `${bar.num}/${bar.den} will not reach ${target} slices by cutting. Try the other bar.`;
}
