import { describe, expect, it } from 'vitest';
import {
  chipsUsed,
  distinctOps,
  evaluateTokens,
  formatTokens,
  num,
  op,
} from '../src/core/expression/expression';

describe('evaluateTokens', () => {
  it('evaluates simple addition', () => {
    expect(evaluateTokens([num(3), op('+'), num(4)])).toEqual({ ok: true, value: 7 });
  });

  it('applies × before + (precedence)', () => {
    expect(evaluateTokens([num(3), op('+'), num(4), op('×'), num(5)])).toEqual({ ok: true, value: 23 });
    expect(evaluateTokens([num(4), op('×'), num(5), op('+'), num(3)])).toEqual({ ok: true, value: 23 });
  });

  it('applies ÷ before − (precedence)', () => {
    expect(evaluateTokens([num(20), op('-'), num(12), op('÷'), num(4)])).toEqual({ ok: true, value: 17 });
  });

  it('is left associative within a precedence level', () => {
    expect(evaluateTokens([num(24), op('÷'), num(4), op('÷'), num(2)])).toEqual({ ok: true, value: 3 });
    expect(evaluateTokens([num(10), op('-'), num(3), op('-'), num(2)])).toEqual({ ok: true, value: 5 });
  });

  it('rejects inexact division', () => {
    expect(evaluateTokens([num(7), op('÷'), num(2)])).toEqual({ ok: false, reason: 'fractional' });
  });

  it('rejects division by zero', () => {
    expect(evaluateTokens([num(7), op('÷'), num(0)])).toEqual({ ok: false, reason: 'fractional' });
  });

  it('rejects negative intermediates', () => {
    expect(evaluateTokens([num(2), op('-'), num(5), op('+'), num(10)])).toEqual({
      ok: false,
      reason: 'negative',
    });
  });

  it('rejects malformed sequences', () => {
    expect(evaluateTokens([]).ok).toBe(false);
    expect(evaluateTokens([op('+')]).ok).toBe(false);
    expect(evaluateTokens([num(1), op('+')]).ok).toBe(false);
    expect(evaluateTokens([num(1), num(2)]).ok).toBe(false);
    expect(evaluateTokens([num(1), op('+'), op('×'), num(2)]).ok).toBe(false);
  });

  it('single number is itself', () => {
    expect(evaluateTokens([num(42)])).toEqual({ ok: true, value: 42 });
  });
});

describe('helpers', () => {
  const tokens = [num(4), op('×'), num(7), op('+'), num(3)];

  it('formatTokens renders with math glyphs', () => {
    expect(formatTokens(tokens)).toBe('4 × 7 + 3');
    expect(formatTokens([num(9), op('-'), num(4)])).toBe('9 − 4');
  });

  it('chipsUsed lists consumed numbers', () => {
    expect(chipsUsed(tokens)).toEqual([4, 7, 3]);
  });

  it('distinctOps dedupes', () => {
    expect(distinctOps([num(1), op('+'), num(2), op('+'), num(3)])).toEqual(['+']);
    expect(distinctOps(tokens).sort()).toEqual(['+', '×'].sort());
  });
});
