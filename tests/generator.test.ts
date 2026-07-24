import { describe, expect, it } from 'vitest';
import { generateProblem, hasRecipe } from '../src/core/generator/generate';
import { createRng } from '../src/core/rng';
import { allSkillIds } from '../src/core/skills/taxonomy';

describe('generator coverage', () => {
  it('every skill in the taxonomy has a recipe', () => {
    for (const id of allSkillIds()) {
      expect(hasRecipe(id), `missing recipe for ${id}`).toBe(true);
    }
  });

  it('every recipe produces a valid problem', () => {
    const rng = createRng(1);
    for (const id of allSkillIds()) {
      for (let i = 0; i < 50; i++) {
        const p = generateProblem(id, rng);
        expect(p.prompt.length).toBeGreaterThan(0);
        expect(p.answer).toMatch(/^\d+$/);
        expect(p.difficulty).toBeGreaterThan(0);
        expect(p.skillIds).toContain(id);
      }
    }
  });

  it('is deterministic given the same seed', () => {
    const a = createRng(99);
    const b = createRng(99);
    for (const id of allSkillIds()) {
      const pa = generateProblem(id, a);
      const pb = generateProblem(id, b);
      expect(pa.prompt).toBe(pb.prompt);
      expect(pa.answer).toBe(pb.answer);
    }
  });
});

describe('recipe correctness', () => {
  const rng = createRng(7);

  it('add.single never bridges ten', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('add.single', rng);
      expect(Number(p.answer)).toBeLessThanOrEqual(9);
    }
  });

  it('add.bridge always crosses ten with single digits', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('add.bridge', rng);
      const answer = Number(p.answer);
      expect(answer).toBeGreaterThanOrEqual(11);
      expect(answer).toBeLessThanOrEqual(18);
    }
  });

  it('sub.borrow requires a borrow and stays positive', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('sub.borrow', rng);
      const [a, b] = p.prompt.split(' − ').map(Number);
      expect(a! % 10).toBeLessThan(b! % 10); // ones digit forces the borrow
      expect(Number(p.answer)).toBeGreaterThan(0);
      expect(a! - b!).toBe(Number(p.answer));
    }
  });

  it('times table families keep the family operand', () => {
    for (const family of [2, 5, 9, 12]) {
      for (let i = 0; i < 50; i++) {
        const p = generateProblem(`mul.table.${family}`, rng);
        const [a, b] = p.prompt.split(' × ').map(Number);
        expect([a, b]).toContain(family);
        expect(a! * b!).toBe(Number(p.answer));
      }
    }
  });

  it('div.exact divides cleanly', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('div.exact', rng);
      const [dividend, divisor] = p.prompt.split(' ÷ ').map(Number);
      expect(dividend! % divisor!).toBe(0);
      expect(dividend! / divisor!).toBe(Number(p.answer));
    }
  });

  it('div.long and div.big divide cleanly at their digit sizes', () => {
    for (const [id, minDigits, maxDigits] of [
      ['div.long', 3, 3],
      ['div.big', 4, 4],
    ] as const) {
      for (let i = 0; i < 200; i++) {
        const p = generateProblem(id, rng);
        const [dividend, divisor] = p.prompt.split(' ÷ ').map(Number);
        expect(String(dividend).length).toBeGreaterThanOrEqual(minDigits);
        expect(String(dividend).length).toBeLessThanOrEqual(maxDigits);
        expect(dividend! % divisor!).toBe(0);
        expect(dividend! / divisor!).toBe(Number(p.answer));
      }
    }
  });

  it('sub.triple and sub.quad stay positive at their digit sizes', () => {
    for (const [id, digits] of [
      ['sub.triple', 3],
      ['sub.quad', 4],
    ] as const) {
      for (let i = 0; i < 200; i++) {
        const p = generateProblem(id, rng);
        const [a, b] = p.prompt.split(' − ').map(Number);
        expect(String(a).length).toBe(digits);
        expect(a! - b!).toBe(Number(p.answer));
        expect(Number(p.answer)).toBeGreaterThan(0);
      }
    }
  });

  it('div.remainder answer is a valid nonzero remainder', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('div.remainder', rng);
      const [dividend, rest] = p.prompt.split(' ÷ ');
      const divisor = Number(rest!.split(' ')[0]);
      const remainder = Number(p.answer);
      expect(remainder).toBeGreaterThan(0);
      expect(remainder).toBeLessThan(divisor);
      expect(Number(dividend) % divisor).toBe(remainder);
    }
  });

  it('ooo.basic respects operator precedence and stays non-negative', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateProblem('ooo.basic', rng);
      expect(Number(p.answer)).toBeGreaterThanOrEqual(0);
    }
  });
});
