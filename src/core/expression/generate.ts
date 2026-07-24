/**
 * Expression target generation. Builds a random expression from weighted
 * operators, keeps it if the evaluator accepts it, and hands the player the
 * canonical chips plus decoys. Solvability is guaranteed by construction.
 */
import type { ExpressionConfig } from '../config';
import type { Rng } from '../rng';
import { getSkill, type SkillId } from '../skills/taxonomy';
import { evaluateTokens, num, op, OPS, type Op, type Token } from './expression';

export interface ExpressionProblem {
  id: number;
  target: number;
  /** Number chips available to the player (canonical chips + decoys, shuffled). */
  hand: number[];
  /** One known solution (never shown to the player). */
  canonical: Token[];
  skillIds: SkillId[];
  difficulty: number;
  /** Chips the canonical solution consumes. */
  chipCount: number;
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

function numberForOp(o: Op, rng: Rng): number {
  switch (o) {
    case '×':
    case '÷':
      return rng.int(2, 12);
    case '+':
    case '-':
      return rng.chance(0.6) ? rng.int(2, 9) : rng.int(10, 25);
  }
}

function pickOp(weights: Readonly<Record<Op, number>>, rng: Rng): Op {
  const total = OPS.reduce((s, o) => s + weights[o], 0);
  let roll = rng.next() * total;
  for (const o of OPS) {
    roll -= weights[o];
    if (roll <= 0) return o;
  }
  return OPS[OPS.length - 1]!;
}

/**
 * Operator weights from usage counts: operators the player leans on stay at
 * weight 1, avoided ones get boosted so the game quietly pushes them back in.
 */
export function opWeightsFromUsage(
  usage: Readonly<Record<Op, number>>,
  cfg: ExpressionConfig,
): Record<Op, number> {
  const total = OPS.reduce((s, o) => s + usage[o], 0);
  const weights = { '+': 1, '-': 1, '×': 1, '÷': 1 } as Record<Op, number>;
  if (total < 8) return weights; // not enough signal yet
  for (const o of OPS) {
    const share = usage[o] / total;
    if (share < 0.15) weights[o] = cfg.avoidedOpWeight;
  }
  return weights;
}

function tryBuild(chipCount: number, weights: Readonly<Record<Op, number>>, rng: Rng): Token[] | null {
  const tokens: Token[] = [];
  let firstOp: Op = pickOp(weights, rng);
  tokens.push(num(numberForOp(firstOp, rng)));
  for (let i = 1; i < chipCount; i++) {
    const o = i === 1 ? firstOp : pickOp(weights, rng);
    tokens.push(op(o));
    tokens.push(num(numberForOp(o, rng)));
  }
  const result = evaluateTokens(tokens);
  if (!result.ok) return null;
  if (result.value < 3 || result.value > 999) return null;
  // Reject targets the hand trivially contains.
  if (tokens.some((t) => t.kind === 'num' && t.value === result.value)) return null;
  return tokens;
}

export function generateExpressionProblem(
  chipCount: number,
  weights: Readonly<Record<Op, number>>,
  cfg: ExpressionConfig,
  rng: Rng,
): ExpressionProblem {
  let canonical: Token[] | null = null;
  for (let attempt = 0; attempt < 300 && !canonical; attempt++) {
    canonical = tryBuild(chipCount, weights, rng);
  }
  if (!canonical) {
    // Guaranteed fallback: simple bridging addition.
    const a = rng.int(5, 9);
    const b = rng.int(11 - a, 9);
    canonical = [num(a), op('+'), num(b)];
  }

  const evalResult = evaluateTokens(canonical);
  if (!evalResult.ok) throw new Error('canonical expression must evaluate');
  const target = evalResult.value;

  const chips = canonical.filter((t): t is { kind: 'num'; value: number } => t.kind === 'num').map((t) => t.value);
  const decoys: number[] = [];
  while (decoys.length < cfg.handDecoys) {
    const d = rng.int(2, 12);
    if (d !== target) decoys.push(d);
  }
  const hand = rng.shuffle([...chips, ...decoys]);

  const skillIds: SkillId[] = [];
  for (let i = 1; i < canonical.length; i += 2) {
    const o = (canonical[i] as { kind: 'op'; op: Op }).op;
    const a = (canonical[i - 1] as { kind: 'num'; value: number }).value;
    const b = (canonical[i + 1] as { kind: 'num'; value: number }).value;
    const skill = skillForOp(o, a, b);
    if (!skillIds.includes(skill)) skillIds.push(skill);
  }

  const difficulty =
    Math.max(...skillIds.map((s) => getSkill(s).baseDifficulty)) + 60 * (chips.length - 2);

  return { id: nextId++, target, hand, canonical, skillIds, difficulty, chipCount: chips.length };
}
