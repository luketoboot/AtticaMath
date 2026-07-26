/**
 * Exercise mode: solving a problem one place value at a time.
 *
 * The player commands a focus dial. DECONSTRUCT zooms out — the ones dissolve,
 * then the tens — until what is left is small enough to see whole. They answer
 * that. RECONSTRUCT brings the next place back, and they answer again, now with
 * the coarser total already in hand. The answer arrives in focus, place by
 * place, and the carrying happens for free because it never has to be tracked
 * separately from the running total.
 *
 *   679 + 834          descend
 *   670 + 830          descend
 *   600 + 800  → 1400  solve
 *   670 + 830  → 1500  ascend, solve
 *   679 + 834  → 1513  ascend, solve — done
 *
 * Two rules make the ladder safe to walk:
 *
 *  - Each layer asks for the truncated problem's *value*, never a delta. For
 *    addition either would do, but a delta layer of a subtraction goes negative
 *    (the tens of 634−287 differ by −50), and this mode exists for players who
 *    are not ready for that. Truncation is monotone, so a layer of a positive
 *    subtraction is always itself positive. See the property test.
 *  - Layers that change nothing are skipped. 450 + 320 reads identically with
 *    its ones dropped, so the dial steps straight past that stop rather than
 *    asking the player to solve the same thing twice.
 *
 * Multiplication rides the same ladder with one factor held whole:
 *
 *   134 × 21  →  130 × 21  →  100 × 21  →  2100
 *   130 × 21  →  2730
 *   134 × 21  →  2814
 *
 * which is partial products accumulated from the left, the method `mul.3x2`
 * already names — hundreds ride first, running total the whole way.
 *
 * Pure and side-effect free: the scene owns pixels, this owns the arithmetic.
 */

export type ExerciseOp = 'add' | 'sub' | 'mul';

export interface ExerciseProblem {
  op: ExerciseOp;
  a: number;
  /** For subtraction, `b` must not exceed `a` — see the positivity rule above. */
  b: number;
}

/** One rung: the problem as it reads at a given focus depth. */
export interface Layer {
  depth: number;
  left: number;
  right: number;
  /** Places currently out of focus on each side; the scene dims exactly these. */
  leftDepth: number;
  rightDepth: number;
  /** What the player must type to fuse this layer. */
  value: number;
}

/**
 * Which side the dial actually truncates.
 *
 * A sum drops the same place from both operands, because both contribute to
 * that place of the answer. A product does not: `47 × 6` coarsens to `40 × 6`,
 * never to `40 × 0`, which is not a simpler version of the problem but a
 * different and emptier one. So multiplication splits one factor and holds the
 * other whole — which is exactly the partial products the Playbook teaches,
 * accumulated from the left.
 */
function truncationDepths(op: ExerciseOp, depth: number): { left: number; right: number } {
  return op === 'mul' ? { left: depth, right: 0 } : { left: depth, right: depth };
}

/** One rendered digit position. Dimmed slots are the places currently out of focus. */
export interface DigitSlot {
  /** A digit, or '' for a leading pad slot that keeps columns aligned. */
  char: string;
  dimmed: boolean;
}

export function digitCount(n: number): number {
  return String(Math.abs(Math.trunc(n))).length;
}

/** `n` with its lowest `depth` places zeroed: truncateTo(679, 1) === 670. */
export function truncateTo(n: number, depth: number): number {
  if (depth <= 0) return n;
  const step = 10 ** depth;
  return Math.floor(n / step) * step;
}

/**
 * The coarsest depth this problem can be viewed at, capped by the *smaller*
 * operand. Zooming past it would leave one side reading a bare 0, which is not
 * a simpler version of the problem — it is a different one.
 */
export function maxDepthFor(problem: ExerciseProblem): number {
  // Only the truncated side needs a floor. A product holds its second factor
  // whole, so however small that factor is, it never runs out of places.
  if (problem.op === 'mul') return digitCount(problem.a) - 1;
  return Math.min(digitCount(problem.a), digitCount(problem.b)) - 1;
}

function evaluate(op: ExerciseOp, left: number, right: number): number {
  if (op === 'add') return left + right;
  if (op === 'sub') return left - right;
  return left * right;
}

export function layerAt(problem: ExerciseProblem, depth: number): Layer {
  const { left: leftDepth, right: rightDepth } = truncationDepths(problem.op, depth);
  const left = truncateTo(problem.a, leftDepth);
  const right = truncateTo(problem.b, rightDepth);
  return { depth, left, right, leftDepth, rightDepth, value: evaluate(problem.op, left, right) };
}

/**
 * Columns the answer needs, across every rung.
 *
 * Not simply the width of the final answer: a coarser rung can be *wider* than
 * the problem it came from — `1000 − 900` is 100 where `1000 − 999` is 1 — so a
 * grid sized to the last rung would clip the ones above it.
 */
export function resultWidth(problem: ExerciseProblem): number {
  return ladderFor(problem).reduce(
    (widest, depth) => Math.max(widest, digitCount(layerAt(problem, depth).value)),
    1,
  );
}

/**
 * The depths the dial actually stops at, finest first. Always starts at 0; a
 * coarser depth earns a stop only if it reads differently from the stop below
 * it.
 */
export function ladderFor(problem: ExerciseProblem): number[] {
  const stops = [0];
  let prev = layerAt(problem, 0);
  for (let d = 1; d <= maxDepthFor(problem); d++) {
    const layer = layerAt(problem, d);
    if (layer.left === prev.left && layer.right === prev.right) continue;
    stops.push(d);
    prev = layer;
  }
  return stops;
}

/**
 * Digits of one operand at a depth, right-aligned into `width` columns.
 *
 * `depth` here is the operand's *own* truncation depth, which is not always the
 * rung's — a product's second factor is never truncated, so it is always drawn
 * at depth 0 however far the dial has turned. Take it from the layer.
 */
export function slotsFor(operand: number, depth: number, width: number): DigitSlot[] {
  const text = String(truncateTo(operand, depth)).padStart(width, ' ');
  return [...text].map((char, i) => ({
    char: char === ' ' ? '' : char,
    dimmed: char !== ' ' && i >= width - depth,
  }));
}

/** Column count both operands render into, so place values line up. */
export function slotWidth(problem: ExerciseProblem): number {
  return Math.max(digitCount(problem.a), digitCount(problem.b));
}

// --- the workbench ---

export interface WorkbenchState {
  readonly problem: ExerciseProblem;
  /** Where the dial is pointing. */
  readonly depth: number;
  /** Whether the layer at `depth` has been answered. */
  readonly layerSolved: boolean;
  /**
   * Set by the first solve. Descending is a decision made once, before any
   * arithmetic: having committed to a rung and answered it, the player climbs
   * back down rather than re-opening the choice.
   */
  readonly locked: boolean;
  /**
   * How far the player had to zoom out before the problem looked solvable.
   * This is the mode's real output — a player whose scaffold depth on a skill
   * falls to 0 is solving it whole, and no longer needs the mode for it.
   */
  readonly scaffoldDepth: number;
  readonly misses: number;
  readonly moves: number;
  readonly done: boolean;
}

export type WorkbenchEvent =
  | { kind: 'deconstruct'; from: Layer; to: Layer }
  | { kind: 'reconstruct'; from: Layer; to: Layer }
  | { kind: 'solved'; layer: Layer; complete: boolean }
  | { kind: 'wrong'; layer: Layer; typed: number }
  | { kind: 'refused'; reason: RefusalReason };

/** Why a command did nothing. The scene buzzes on every one of these. */
export type RefusalReason =
  | 'already-coarsest'
  | 'locked'
  | 'layer-unsolved'
  | 'already-finest'
  | 'layer-already-solved'
  | 'complete';

export interface WorkbenchStep {
  state: WorkbenchState;
  event: WorkbenchEvent;
}

export function createWorkbench(problem: ExerciseProblem): WorkbenchState {
  if (!Number.isInteger(problem.a) || !Number.isInteger(problem.b)) {
    throw new Error(`Exercise operands must be integers: ${problem.a}, ${problem.b}`);
  }
  if (problem.a < 0 || problem.b < 0) {
    throw new Error(`Exercise operands must be non-negative: ${problem.a}, ${problem.b}`);
  }
  if (problem.op === 'sub' && problem.b > problem.a) {
    throw new Error(`Exercise subtraction must not go negative: ${problem.a} - ${problem.b}`);
  }
  if (problem.op === 'mul' && problem.b === 0) {
    throw new Error('Exercise multiplication by zero has no ladder worth walking');
  }
  return {
    problem,
    depth: 0,
    layerSolved: false,
    locked: false,
    scaffoldDepth: 0,
    misses: 0,
    moves: 0,
    done: false,
  };
}

/** The layer the player is looking at. */
export function currentLayer(state: WorkbenchState): Layer {
  return layerAt(state.problem, state.depth);
}

function refuse(state: WorkbenchState, reason: RefusalReason): WorkbenchStep {
  return { state, event: { kind: 'refused', reason } };
}

/** The ladder stop one step coarser than `depth`, or undefined at the top. */
function coarser(problem: ExerciseProblem, depth: number): number | undefined {
  return ladderFor(problem).find((d) => d > depth);
}

/** The ladder stop one step finer than `depth`, or undefined at the bottom. */
function finer(problem: ExerciseProblem, depth: number): number | undefined {
  const below = ladderFor(problem).filter((d) => d < depth);
  return below[below.length - 1];
}

/** Zoom out one stop: drop the next place out of focus. */
export function deconstruct(state: WorkbenchState): WorkbenchStep {
  if (state.done) return refuse(state, 'complete');
  if (state.locked) return refuse(state, 'locked');
  const next = coarser(state.problem, state.depth);
  if (next === undefined) return refuse(state, 'already-coarsest');
  return {
    state: { ...state, depth: next, moves: state.moves + 1 },
    event: {
      kind: 'deconstruct',
      from: currentLayer(state),
      to: layerAt(state.problem, next),
    },
  };
}

/** Zoom back in one stop, bringing the next place into focus. */
export function reconstruct(state: WorkbenchState): WorkbenchStep {
  if (state.done) return refuse(state, 'complete');
  if (!state.layerSolved) return refuse(state, 'layer-unsolved');
  const next = finer(state.problem, state.depth);
  if (next === undefined) return refuse(state, 'already-finest');
  return {
    state: { ...state, depth: next, layerSolved: false, moves: state.moves + 1 },
    event: {
      kind: 'reconstruct',
      from: currentLayer(state),
      to: layerAt(state.problem, next),
    },
  };
}

/**
 * Answer the layer in focus. Solving depth 0 finishes the problem, whether the
 * player descended first or typed the whole thing outright.
 */
export function submit(state: WorkbenchState, typed: number): WorkbenchStep {
  if (state.done) return refuse(state, 'complete');
  if (state.layerSolved) return refuse(state, 'layer-already-solved');
  const layer = currentLayer(state);
  if (typed !== layer.value) {
    return {
      state: { ...state, misses: state.misses + 1 },
      event: { kind: 'wrong', layer, typed },
    };
  }
  const complete = state.depth === 0;
  return {
    state: {
      ...state,
      layerSolved: true,
      locked: true,
      // The first solve is the one that reports the scaffold; later rungs are
      // the climb back down, not a fresh judgement about difficulty.
      scaffoldDepth: state.locked ? state.scaffoldDepth : state.depth,
      moves: state.moves + 1,
      done: complete,
    },
    event: { kind: 'solved', layer, complete },
  };
}
