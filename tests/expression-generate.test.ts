import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { num, op, type Op } from '../src/core/expression/expression';
import {
  generateTargetFromHand,
  opWeightsFromUsage,
  skillForOp,
  skillsForTokens,
} from '../src/core/expression/generate';
import { canMake, solveTarget } from '../src/core/expression/solve';
import { createRng } from '../src/core/rng';
import { getSkill } from '../src/core/skills/taxonomy';

const e = CONFIG.expression;
const flatWeights: Record<Op, number> = { '+': 1, '-': 1, '×': 1, '÷': 1 };

function opts(desiredPar = 2): Parameters<typeof generateTargetFromHand>[1] {
  return { desiredPar, maxChips: e.maxChips, weights: flatWeights };
}

describe('generateTargetFromHand', () => {
  it('only ever produces targets the hand can reach', () => {
    const rng = createRng(4);
    const hands = [
      [2, 3, 4, 5, 6, 7],
      [9, 9, 4, 12, 3, 25],
      [11, 2, 8, 5, 50, 6],
    ];
    for (const hand of hands) {
      for (let i = 0; i < 30; i++) {
        const problem = generateTargetFromHand(hand, opts(3), e, rng);
        expect(problem, `no target for ${hand.join(',')}`).not.toBeNull();
        expect(canMake(hand, problem!.target, e.maxChips)).toBe(true);
      }
    }
  });

  it('reports the true par for what it generated', () => {
    const rng = createRng(11);
    const hand = [3, 5, 7, 9, 11, 2];
    for (let i = 0; i < 40; i++) {
      const problem = generateTargetFromHand(hand, opts(3), e, rng)!;
      expect(problem.par).toBe(solveTarget(hand, problem.target, e.maxChips)!.par);
    }
  });

  it('keeps targets inside the configured range and out of the hand', () => {
    const rng = createRng(2);
    const hand = [2, 4, 6, 8, 10, 12];
    for (let i = 0; i < 60; i++) {
      const problem = generateTargetFromHand(hand, opts(2), e, rng)!;
      expect(problem.target).toBeGreaterThanOrEqual(e.minTarget);
      expect(problem.target).toBeLessThanOrEqual(e.maxTarget);
      // A number already sitting in the hand would be a non-puzzle.
      expect(hand).not.toContain(problem.target);
    }
  });

  it('aims at the requested size, within one chip', () => {
    const rng = createRng(8);
    const hand = [2, 3, 4, 5, 6, 7];
    for (const desired of [2, 3, 4]) {
      for (let i = 0; i < 25; i++) {
        const problem = generateTargetFromHand(hand, opts(desired), e, rng)!;
        expect(Math.abs(problem.par - desired)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('difficulty rises with the size of the puzzle', () => {
    const rng = createRng(6);
    const hand = [2, 3, 4, 5, 6, 7];
    const avg = (desired: number): number => {
      let sum = 0;
      for (let i = 0; i < 40; i++) {
        sum += generateTargetFromHand(hand, opts(desired), e, rng)!.difficulty;
      }
      return sum / 40;
    };
    expect(avg(4)).toBeGreaterThan(avg(2));
  });

  it('returns null rather than guessing when a hand can build nothing', () => {
    // A single chip cannot form an expression at all.
    expect(generateTargetFromHand([5], opts(2), e, createRng(1))).toBeNull();
  });

  it('is deterministic for a given stream', () => {
    const roll = (): number[] => {
      const rng = createRng(77);
      const hand = [2, 5, 8, 3, 10, 4];
      return Array.from({ length: 10 }, () => generateTargetFromHand(hand, opts(3), e, rng)!.target);
    };
    expect(roll()).toEqual(roll());
  });
});

describe('skill attribution', () => {
  it('reads the operations as performed, not the adjacent operands', () => {
    // 5 + 3 × 4: the player does 3 × 4 and then 5 + 12. Never 5 + 3.
    const skills = skillsForTokens([num(5), op('+'), num(3), op('×'), num(4)]);
    expect(skills).toContain(skillForOp('×', 3, 4));
    expect(skills).toContain(skillForOp('+', 5, 12));
    expect(skills).not.toContain(skillForOp('+', 5, 3));
  });

  it('distinguishes two routes to the same number', () => {
    const viaTimes = skillsForTokens([num(6), op('×'), num(8)]);
    const viaMinus = skillsForTokens([num(50), op('-'), num(2)]);
    expect(viaTimes).toEqual(['mul.table.8']);
    expect(viaMinus).not.toEqual(viaTimes);
    for (const id of [...viaTimes, ...viaMinus]) expect(getSkill(id)).toBeDefined();
  });

  it('has nothing to say about an illegal expression', () => {
    expect(skillsForTokens([num(3), op('-'), num(9)])).toEqual([]);
    expect(skillsForTokens([num(3), op('+')])).toEqual([]);
  });

  it('lists each skill once however often it is exercised', () => {
    const skills = skillsForTokens([num(2), op('+'), num(3), op('+'), num(4)]);
    expect(new Set(skills).size).toBe(skills.length);
  });
});

describe('opWeightsFromUsage', () => {
  it('stays flat until there is enough signal', () => {
    expect(opWeightsFromUsage({ '+': 2, '-': 1, '×': 1, '÷': 0 }, e)).toEqual(flatWeights);
  });

  it('boosts operators the player avoids', () => {
    const weights = opWeightsFromUsage({ '+': 40, '-': 30, '×': 30, '÷': 0 }, e);
    expect(weights['÷']).toBe(e.avoidedOpWeight);
    expect(weights['+']).toBe(1);
  });
});
