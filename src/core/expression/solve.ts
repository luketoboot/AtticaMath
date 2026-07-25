/**
 * Exhaustive solver over a hand of chips.
 *
 * Expression Builder only works as a game if the game knows what the player's
 * hand can actually make: targets have to be generated *from* the hand rather
 * than the hand dealt to fit a target, or the player ends up holding chips that
 * cannot reach the number falling at them. It also gives us par — the fewest
 * chips any solution needs — which is the thing worth chasing.
 *
 * The search space is tiny (a handful of chips, at most four per expression,
 * four operators, no parentheses), so this is a plain exhaustive walk. It reuses
 * `evaluateTokens` rather than reimplementing the rules, which is the only way
 * the solver and the game can be guaranteed to agree about what is legal.
 */
import { evaluateTokens, formatTokens, num, op, OPS, type Token } from './expression';

export interface TargetInfo {
  /** Fewest chips any solution needs. */
  par: number;
  /** Distinct expressions (by rendered form) that hit this value. */
  count: number;
  /** One solution using exactly `par` chips. */
  example: Token[];
}

/**
 * Walk every ordered subset of the hand joined by every operator, evaluating as
 * we go. A prefix that breaks the rules is *not* pruned: `5 − 8` is illegal on
 * its own but `5 − 8 ÷ 2` is fine, because × and ÷ resolve first.
 */
function walk(
  hand: readonly number[],
  maxChips: number,
  visit: (value: number, tokens: readonly Token[]) => void,
): void {
  const used: boolean[] = hand.map(() => false);
  const tokens: Token[] = [];

  const recurse = (depth: number): void => {
    if (depth >= maxChips) return;
    for (let i = 0; i < hand.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      if (depth === 0) {
        tokens.push(num(hand[i]!));
        recurse(1);
        tokens.pop();
      } else {
        for (const o of OPS) {
          tokens.push(op(o), num(hand[i]!));
          const result = evaluateTokens(tokens);
          if (result.ok) visit(result.value, tokens);
          recurse(depth + 1);
          tokens.pop();
          tokens.pop();
        }
      }
      used[i] = false;
    }
  };

  recurse(0);
}

/** Every value this hand can reach, with par and solution count for each. */
export function reachableTargets(
  hand: readonly number[],
  maxChips: number,
): Map<number, TargetInfo> {
  const found = new Map<number, TargetInfo>();
  const seen = new Map<number, Set<string>>();

  walk(hand, maxChips, (value, tokens) => {
    const chips = (tokens.length + 1) / 2;
    const rendered = formatTokens(tokens);
    let forms = seen.get(value);
    if (!forms) {
      forms = new Set();
      seen.set(value, forms);
    }
    if (forms.has(rendered)) return;
    forms.add(rendered);

    const existing = found.get(value);
    if (!existing) {
      found.set(value, { par: chips, count: 1, example: [...tokens] });
      return;
    }
    existing.count += 1;
    if (chips < existing.par) {
      existing.par = chips;
      existing.example = [...tokens];
    }
  });

  return found;
}

/** Par and solution count for one target, or null if the hand cannot reach it. */
export function solveTarget(
  hand: readonly number[],
  target: number,
  maxChips: number,
): TargetInfo | null {
  return reachableTargets(hand, maxChips).get(target) ?? null;
}

/** Cheap yes/no — stops at the first solution found. */
export function canMake(hand: readonly number[], target: number, maxChips: number): boolean {
  let ok = false;
  walk(hand, maxChips, (value) => {
    if (value === target) ok = true;
  });
  return ok;
}
