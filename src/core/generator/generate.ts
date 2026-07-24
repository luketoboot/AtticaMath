/**
 * Problem generation. One recipe per skill id, keyed by the taxonomy.
 * Difficulty is derived from the skill's base difficulty plus operand size.
 * Deterministic given an Rng.
 */
import type { Rng } from '../rng';
import { getSkill, type SkillId } from '../skills/taxonomy';
import type { Problem } from './problem';

type Recipe = (rng: Rng) => Omit<Problem, 'id' | 'difficulty'> & { difficultyAdjust: number };

const TIMES = '×';
const DIVIDE = '÷';
const MINUS = '−';

function timesTableRecipe(family: number): Recipe {
  return (rng) => {
    const other = rng.int(2, 12);
    // Randomize operand order so families don't always read the same way.
    const [a, b] = rng.chance(0.5) ? [family, other] : [other, family];
    return {
      skillIds: [`mul.table.${family}`],
      prompt: `${a} ${TIMES} ${b}`,
      answer: String(a * b),
      difficultyAdjust: (other - 6) * 8,
    };
  };
}

const RECIPES: Record<SkillId, Recipe> = {
  'add.single': (rng) => {
    // Sums that do not bridge ten (that is its own skill).
    const a = rng.int(1, 8);
    const b = rng.int(1, 9 - a);
    return { skillIds: ['add.single'], prompt: `${a} + ${b}`, answer: String(a + b), difficultyAdjust: 0 };
  },
  'add.bridge': (rng) => {
    // Single digit sums crossing 10, e.g. 7 + 8.
    const a = rng.int(5, 9);
    const b = rng.int(11 - a, 9);
    return { skillIds: ['add.bridge'], prompt: `${a} + ${b}`, answer: String(a + b), difficultyAdjust: 0 };
  },
  'add.double': (rng) => {
    const a = rng.int(12, 89);
    const b = rng.int(11, 99 - a > 11 ? 99 - a : 11);
    return { skillIds: ['add.double'], prompt: `${a} + ${b}`, answer: String(a + b), difficultyAdjust: (a + b > 99 ? 60 : 0) };
  },
  'add.triple': (rng) => {
    const a = rng.int(110, 899);
    const b = rng.int(101, 900);
    return { skillIds: ['add.triple'], prompt: `${a} + ${b}`, answer: String(a + b), difficultyAdjust: 0 };
  },
  'sub.single': (rng) => {
    const a = rng.int(3, 9);
    const b = rng.int(1, a - 1);
    return { skillIds: ['sub.single'], prompt: `${a} ${MINUS} ${b}`, answer: String(a - b), difficultyAdjust: 0 };
  },
  'sub.double': (rng) => {
    // No borrowing: each digit of b <= matching digit of a.
    const aTens = rng.int(2, 9);
    const aOnes = rng.int(1, 9);
    const bTens = rng.int(1, aTens - 1);
    const bOnes = rng.int(0, aOnes);
    const a = aTens * 10 + aOnes;
    const b = bTens * 10 + bOnes;
    return { skillIds: ['sub.double'], prompt: `${a} ${MINUS} ${b}`, answer: String(a - b), difficultyAdjust: 0 };
  },
  'sub.borrow': (rng) => {
    // Force a borrow: ones digit of b strictly greater than ones digit of a.
    const aTens = rng.int(2, 9);
    const aOnes = rng.int(0, 8);
    const bTens = rng.int(1, aTens - 1);
    const bOnes = rng.int(aOnes + 1, 9);
    const a = aTens * 10 + aOnes;
    const b = bTens * 10 + bOnes;
    return { skillIds: ['sub.borrow'], prompt: `${a} ${MINUS} ${b}`, answer: String(a - b), difficultyAdjust: 0 };
  },
  'mul.table.2': timesTableRecipe(2),
  'mul.table.3': timesTableRecipe(3),
  'mul.table.4': timesTableRecipe(4),
  'mul.table.5': timesTableRecipe(5),
  'mul.table.6': timesTableRecipe(6),
  'mul.table.7': timesTableRecipe(7),
  'mul.table.8': timesTableRecipe(8),
  'mul.table.9': timesTableRecipe(9),
  'mul.table.10': timesTableRecipe(10),
  'mul.table.11': timesTableRecipe(11),
  'mul.table.12': timesTableRecipe(12),
  'mul.2x1': (rng) => {
    const a = rng.int(13, 99);
    const b = rng.int(3, 9);
    return { skillIds: ['mul.2x1'], prompt: `${a} ${TIMES} ${b}`, answer: String(a * b), difficultyAdjust: (b - 6) * 15 };
  },
  'mul.2x2': (rng) => {
    const a = rng.int(12, 99);
    const b = rng.int(12, 99);
    return { skillIds: ['mul.2x2'], prompt: `${a} ${TIMES} ${b}`, answer: String(a * b), difficultyAdjust: Math.floor((a + b - 110) / 4) };
  },
  'mul.3x2': (rng) => {
    const a = rng.int(102, 999);
    const b = rng.int(12, 99);
    return { skillIds: ['mul.3x2'], prompt: `${a} ${TIMES} ${b}`, answer: String(a * b), difficultyAdjust: 0 };
  },
  'mul.4x1': (rng) => {
    const a = rng.int(1002, 9999);
    const b = rng.int(3, 9);
    return { skillIds: ['mul.4x1'], prompt: `${a} ${TIMES} ${b}`, answer: String(a * b), difficultyAdjust: 0 };
  },
  'div.exact': (rng) => {
    const divisor = rng.int(2, 12);
    const quotient = rng.int(2, 12);
    const dividend = divisor * quotient;
    return {
      skillIds: ['div.exact'],
      prompt: `${dividend} ${DIVIDE} ${divisor}`,
      answer: String(quotient),
      difficultyAdjust: (divisor - 6) * 10,
    };
  },
  'div.remainder': (rng) => {
    // Player answers with the remainder. Prompt makes that explicit.
    const divisor = rng.int(3, 9);
    const quotient = rng.int(3, 12);
    const remainder = rng.int(1, divisor - 1);
    const dividend = divisor * quotient + remainder;
    return {
      skillIds: ['div.remainder'],
      prompt: `${dividend} ${DIVIDE} ${divisor} r?`,
      answer: String(remainder),
      difficultyAdjust: 0,
    };
  },
  'ooo.basic': (rng) => {
    // a + b × c or a × b + c with small operands; multiplication binds first.
    const a = rng.int(2, 9);
    const b = rng.int(2, 9);
    if (rng.chance(0.5)) {
      const c = rng.int(2, 9);
      return { skillIds: ['ooo.basic'], prompt: `${a} + ${b} ${TIMES} ${c}`, answer: String(a + b * c), difficultyAdjust: 0 };
    }
    // Keep the result non-negative: c never exceeds the product.
    const c = rng.int(2, Math.min(9, a * b - 1));
    return { skillIds: ['ooo.basic'], prompt: `${a} ${TIMES} ${b} ${MINUS} ${c}`, answer: String(a * b - c), difficultyAdjust: 0 };
  },
};

let nextProblemId = 1;

/** Reset the id counter (tests only). */
export function resetProblemIds(): void {
  nextProblemId = 1;
}

export function generateProblem(skillId: SkillId, rng: Rng): Problem {
  const recipe = RECIPES[skillId];
  if (!recipe) throw new Error(`No generator recipe for skill: ${skillId}`);
  const skill = getSkill(skillId);
  const { skillIds, prompt, answer, difficultyAdjust } = recipe(rng);
  return {
    id: nextProblemId++,
    skillIds,
    prompt,
    answer,
    difficulty: Math.max(50, skill.baseDifficulty + difficultyAdjust),
  };
}

export function hasRecipe(skillId: SkillId): boolean {
  return skillId in RECIPES;
}
