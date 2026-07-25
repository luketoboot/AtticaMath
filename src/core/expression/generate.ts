/**
 * Expression target generation.
 *
 * Targets are generated *from the hand the player is holding*, using the solver,
 * so a target is never unreachable and the game always knows par. The old
 * approach — build a random expression, then deal its chips back as the hand —
 * made every puzzle a "use everything" exercise with exactly one intended
 * route, which is neither Countdown nor a game.
 */
import type { ExpressionConfig } from '../config';
import type { Rng } from '../rng';
import { getSkill, type SkillId } from '../skills/taxonomy';
import { evaluateSteps, type Op, type Token } from './expression';
import { reachableTargets, type TargetInfo } from './solve';

export interface ExpressionProblem {
  id: number;
  target: number;
  /** Fewest chips that can make it from the hand it was generated against. */
  par: number;
  /** How many distinct expressions could make it at generation time. */
  solutionCount: number;
  /** Skills the par route exercises — the estimate, used for pacing and misses. */
  skillIds: SkillId[];
  difficulty: number;
}

let nextId = 1;

/** Reset the id counter (tests only). */
export function resetExpressionIds(): void {
  nextId = 1;
}

/** Map one surface operation to the skill it exercises. */
export function skillForOp(o: Op, a: number, b: number): SkillId {
  switch (o) {
    case '+':
      if (a < 10 && b < 10) return a + b >= 10 ? 'add.bridge' : 'add.single';
      return 'add.double';
    case '-':
      if (a < 10 && b < 10) return 'sub.single';
      return a % 10 < b % 10 ? 'sub.borrow' : 'sub.double';
    case '×': {
      if (a >= 2 && a <= 12 && b >= 2 && b <= 12) return `mul.table.${Math.max(a, b)}`;
      return a <= 9 || b <= 9 ? 'mul.2x1' : 'mul.2x2';
    }
    case '÷':
      return 'div.exact';
  }
}

/**
 * The skills an expression actually exercises, from the operations as
 * performed. This is what rating updates must be given: two players who reach
 * 48 by `6 × 8` and by `50 − 2` did not practise the same thing.
 */
export function skillsForTokens(tokens: readonly Token[]): SkillId[] {
  const result = evaluateSteps(tokens);
  if (!result.ok) return [];
  const skills: SkillId[] = [];
  for (const step of result.steps) {
    const id = skillForOp(step.op, step.lhs, step.rhs);
    if (!skills.includes(id)) skills.push(id);
  }
  return skills;
}

/** Operators an expression uses, in order of first appearance. */
function opsUsed(tokens: readonly Token[]): Op[] {
  const ops: Op[] = [];
  for (const t of tokens) if (t.kind === 'op' && !ops.includes(t.op)) ops.push(t.op);
  return ops;
}

/**
 * Operator weights from usage counts: operators the player leans on stay at
 * weight 1, avoided ones get boosted so the game quietly pushes them back in.
 */
export function opWeightsFromUsage(
  usage: Readonly<Record<Op, number>>,
  cfg: ExpressionConfig,
): Record<Op, number> {
  const ops: Op[] = ['+', '-', '×', '÷'];
  const total = ops.reduce((s, o) => s + usage[o], 0);
  const weights = { '+': 1, '-': 1, '×': 1, '÷': 1 } as Record<Op, number>;
  if (total < 8) return weights; // not enough signal yet
  for (const o of ops) {
    if (usage[o] / total < 0.15) weights[o] = cfg.avoidedOpWeight;
  }
  return weights;
}

export interface TargetOptions {
  /** Chips the player should need — the generator aims here and settles nearby. */
  desiredPar: number;
  /** Hard ceiling on chips per expression. */
  maxChips: number;
  /** Operator weights, so avoided operators get pulled back into play. */
  weights: Readonly<Record<Op, number>>;
}

/** Difficulty of a route: hardest component skill, plus a premium for length. */
function difficultyOf(tokens: readonly Token[], par: number): number {
  const skills = skillsForTokens(tokens);
  if (skills.length === 0) return 0;
  return Math.max(...skills.map((s) => getSkill(s).baseDifficulty)) + 60 * (par - 2);
}

/**
 * Pick a target the given hand can make. Returns null only if the hand cannot
 * form any legal expression at all, which the caller must handle by redealing.
 */
export function generateTargetFromHand(
  hand: readonly number[],
  opts: TargetOptions,
  cfg: ExpressionConfig,
  rng: Rng,
  /** Precomputed reachable set for this hand; recomputed if omitted. Callers
   * that generate several targets per hand should pass it — the walk is the
   * expensive part and the answer only changes when the hand does. */
  precomputed?: ReadonlyMap<number, TargetInfo>,
): ExpressionProblem | null {
  const reach = precomputed ?? reachableTargets(hand, opts.maxChips);
  const candidates: { value: number; info: TargetInfo; weight: number }[] = [];

  for (const [value, info] of reach) {
    if (value < cfg.minTarget || value > cfg.maxTarget) continue;
    // A target sitting in the hand is a non-puzzle: the player would just fire it.
    if (hand.includes(value)) continue;

    // Aim for the wanted size; nearby sizes stay eligible at a discount so a
    // hand that cannot reach the ideal still produces something to shoot.
    const distance = Math.abs(info.par - opts.desiredPar);
    if (distance > 1) continue;
    let weight = distance === 0 ? 4 : 1;

    // Nudge toward routes using operators the player has been avoiding.
    const ops = opsUsed(info.example);
    weight *= Math.max(...ops.map((o) => opts.weights[o]));

    candidates.push({ value, info, weight });
  }

  if (candidates.length === 0) return null;

  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = rng.next() * total;
  let chosen = candidates[candidates.length - 1]!;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) {
      chosen = c;
      break;
    }
  }

  return {
    id: nextId++,
    target: chosen.value,
    par: chosen.info.par,
    solutionCount: chosen.info.count,
    skillIds: skillsForTokens(chosen.info.example),
    difficulty: difficultyOf(chosen.info.example, chosen.info.par),
  };
}
