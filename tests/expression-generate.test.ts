import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { evaluateTokens, OPS, type Op } from '../src/core/expression/expression';
import {
  generateExpressionProblem,
  opWeightsFromUsage,
  skillForOp,
} from '../src/core/expression/generate';
import { createRng } from '../src/core/rng';
import { getSkill } from '../src/core/skills/taxonomy';

const cfg = CONFIG.expression;
const evenWeights = { '+': 1, '-': 1, '×': 1, '÷': 1 } as Record<Op, number>;

describe('generateExpressionProblem', () => {
  it('canonical solution always evaluates to the target', () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i++) {
      const chips = 2 + (i % 3);
      const p = generateExpressionProblem(chips, evenWeights, cfg, rng);
      const result = evaluateTokens(p.canonical);
      expect(result).toEqual({ ok: true, value: p.target });
    }
  });

  it('hand contains every canonical chip plus decoys', () => {
    const rng = createRng(22);
    for (let i = 0; i < 100; i++) {
      const p = generateExpressionProblem(3, evenWeights, cfg, rng);
      const canonicalChips = p.canonical
        .filter((t) => t.kind === 'num')
        .map((t) => (t.kind === 'num' ? t.value : 0));
      const hand = [...p.hand];
      for (const chip of canonicalChips) {
        const idx = hand.indexOf(chip);
        expect(idx, `chip ${chip} missing from hand [${hand}]`).toBeGreaterThanOrEqual(0);
        hand.splice(idx, 1);
      }
      expect(hand.length).toBe(cfg.handDecoys);
    }
  });

  it('target is never a single chip in the hand', () => {
    const rng = createRng(33);
    for (let i = 0; i < 200; i++) {
      const p = generateExpressionProblem(2, evenWeights, cfg, rng);
      expect(p.hand).not.toContain(p.target);
    }
  });

  it('tags at least one skill and derives sane difficulty', () => {
    const rng = createRng(44);
    for (let i = 0; i < 100; i++) {
      const p = generateExpressionProblem(3, evenWeights, cfg, rng);
      expect(p.skillIds.length).toBeGreaterThan(0);
      for (const id of p.skillIds) expect(() => getSkill(id)).not.toThrow();
      expect(p.difficulty).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = generateExpressionProblem(3, evenWeights, cfg, createRng(77));
    const b = generateExpressionProblem(3, evenWeights, cfg, createRng(77));
    expect(a.target).toBe(b.target);
    expect(a.hand).toEqual(b.hand);
  });
});

describe('skillForOp', () => {
  it('classifies additions', () => {
    expect(skillForOp('+', 3, 4)).toBe('add.single');
    expect(skillForOp('+', 7, 8)).toBe('add.bridge');
    expect(skillForOp('+', 14, 8)).toBe('add.double');
  });

  it('classifies subtractions', () => {
    expect(skillForOp('-', 9, 4)).toBe('sub.single');
    expect(skillForOp('-', 42, 17)).toBe('sub.borrow');
    expect(skillForOp('-', 47, 12)).toBe('sub.double');
  });

  it('classifies multiplications by table family', () => {
    expect(skillForOp('×', 7, 9)).toBe('mul.table.9');
    expect(skillForOp('×', 23, 4)).toBe('mul.2x1');
  });

  it('division maps to div.exact', () => {
    expect(skillForOp('÷', 24, 6)).toBe('div.exact');
  });
});

describe('opWeightsFromUsage', () => {
  it('stays even with little signal', () => {
    expect(opWeightsFromUsage({ '+': 2, '-': 1, '×': 1, '÷': 0 }, cfg)).toEqual(evenWeights);
  });

  it('boosts avoided operators once signal exists', () => {
    const weights = opWeightsFromUsage({ '+': 20, '-': 10, '×': 15, '÷': 1 }, cfg);
    expect(weights['÷']).toBe(cfg.avoidedOpWeight);
    expect(weights['+']).toBe(1);
  });

  it('covers all operators', () => {
    const weights = opWeightsFromUsage({ '+': 0, '-': 0, '×': 0, '÷': 0 }, cfg);
    for (const o of OPS) expect(weights[o]).toBeGreaterThan(0);
  });
});
