/**
 * Expression tokens and evaluation for Expression Builder mode.
 * Countdown-style validity: standard precedence (× ÷ before + −, left
 * associative), and every intermediate result must be a non-negative
 * integer — division must be exact, subtraction must not go negative.
 */

export type Op = '+' | '-' | '×' | '÷';
export const OPS: readonly Op[] = ['+', '-', '×', '÷'] as const;

export type Token = { kind: 'num'; value: number } | { kind: 'op'; op: Op };

export function num(value: number): Token {
  return { kind: 'num', value };
}

export function op(o: Op): Token {
  return { kind: 'op', op: o };
}

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'malformed' | 'negative' | 'fractional' };

/** Evaluate a token list. Returns ok:false for structural or rule violations. */
export function evaluateTokens(tokens: readonly Token[]): EvalResult {
  if (tokens.length === 0 || tokens.length % 2 === 0) return { ok: false, reason: 'malformed' };
  for (let i = 0; i < tokens.length; i++) {
    const expectNum = i % 2 === 0;
    if (expectNum !== (tokens[i]!.kind === 'num')) return { ok: false, reason: 'malformed' };
  }

  // Pass 1: resolve × and ÷ left to right.
  const values: number[] = [(tokens[0] as { kind: 'num'; value: number }).value];
  const pendingOps: Op[] = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const o = (tokens[i] as { kind: 'op'; op: Op }).op;
    const rhs = (tokens[i + 1] as { kind: 'num'; value: number }).value;
    if (o === '×' || o === '÷') {
      const lhs = values.pop()!;
      if (o === '÷') {
        if (rhs === 0 || lhs % rhs !== 0) return { ok: false, reason: 'fractional' };
        values.push(lhs / rhs);
      } else {
        values.push(lhs * rhs);
      }
    } else {
      pendingOps.push(o);
      values.push(rhs);
    }
  }

  // Pass 2: resolve + and − left to right, forbidding negative intermediates.
  let acc = values[0]!;
  for (let i = 0; i < pendingOps.length; i++) {
    const rhs = values[i + 1]!;
    acc = pendingOps[i] === '+' ? acc + rhs : acc - rhs;
    if (acc < 0) return { ok: false, reason: 'negative' };
  }
  return { ok: true, value: acc };
}

/** Render tokens for display, e.g. "4 × 7 + 3". */
export function formatTokens(tokens: readonly Token[]): string {
  return tokens.map((t) => (t.kind === 'num' ? String(t.value) : t.op === '-' ? '−' : t.op)).join(' ');
}

/** Number chips consumed by an expression. */
export function chipsUsed(tokens: readonly Token[]): number[] {
  return tokens.filter((t): t is { kind: 'num'; value: number } => t.kind === 'num').map((t) => t.value);
}

/** Distinct operators in an expression. */
export function distinctOps(tokens: readonly Token[]): Op[] {
  const set = new Set<Op>();
  for (const t of tokens) if (t.kind === 'op') set.add(t.op);
  return [...set];
}
