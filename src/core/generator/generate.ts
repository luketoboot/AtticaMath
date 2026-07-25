/**
 * Problem generation. One recipe per skill id, keyed by the taxonomy.
 * Difficulty is derived from the skill's base difficulty plus operand size.
 * Deterministic given an Rng.
 */
import { gcd, wholePercentPairs } from '../collapse/equiv';
import type { Rng } from '../rng';
import { getSkill, type SkillId } from '../skills/taxonomy';
import type { Problem } from './problem';

type Recipe = (rng: Rng) => Omit<Problem, 'id' | 'difficulty'> & { difficultyAdjust: number };

const TIMES = '×';
const DIVIDE = '÷';
const MINUS = '−';

/**
 * Semiprimes whose smaller factor is not 2 or 3 — numbers that look prime and
 * are not. A composite with an obvious factor teaches nothing: the skill is
 * having somewhere to look after 2, 3 and 5 have all failed.
 */
const SNEAKY_TWO_DIGIT: readonly [number, number][] = [
  [3, 17], [3, 19], [3, 23], [3, 29], [3, 31],
  [7, 7], [7, 11], [7, 13],
];
const SNEAKY_THREE_DIGIT: readonly [number, number][] = [
  [7, 17], [7, 19], [7, 23], [7, 29], [7, 31], [7, 37],
  [11, 11], [11, 13], [11, 17], [11, 19], [11, 23],
  [13, 13], [13, 17], [13, 19], [17, 17], [17, 19],
];

const PRIMES_TO_120: readonly number[] = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
  101, 103, 107, 109, 113, 127,
];

/** Denominators small enough to hold in your head while you work. */
const FRIENDLY_DENS: readonly number[] = [2, 3, 4, 5, 6, 8, 10, 12];

/** Every whole multiple of five short of the whole thing. */
const PERCENT_STEPS: readonly number[] = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
];

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/** A percentage in reduced-fraction form: 60% → 3/5. */
function percentAsFraction(pct: number): { num: number; den: number } {
  const d = gcd(pct, 100);
  return { num: pct / d, den: 100 / d };
}

/**
 * A quantity the percentage divides exactly. Keying this to the *reduced*
 * denominator is the whole point: 60% is 3/5, so it can be taken of 35 or 90,
 * not only of the multiples of twenty that every percentage happens to divide.
 * Asking only the tidy ones lets a player pattern-match their way through
 * without ever running the method.
 */
function percentQuantity(rng: Rng, den: number): number {
  return den * rng.int(Math.ceil(15 / den), Math.floor(200 / den));
}

/**
 * Twentieths need the 10%-and-build route; fifths and quarters are one
 * division. An untidy quantity costs extra on top of whichever route.
 */
function percentAdjust(den: number, whole: number): number {
  const byDenominator = den <= 4 ? -60 : den <= 10 ? 0 : 60;
  return byDenominator + (whole % 10 === 0 ? 0 : 40);
}

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
  'add.complement10': (rng) => {
    // The bond itself, asked directly. Everything from bridging ten to building
    // a percentage spends this, so it is worth a rating of its own.
    const a = rng.int(1, 9);
    return { skillIds: ['add.complement10'], prompt: `${a} + ? = 10`, answer: String(10 - a), difficultyAdjust: 0 };
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
  'add.complement100': (rng) => {
    // Nonzero ones digit throughout: "70 + ? = 100" is the ten-bond wearing a
    // zero, and this skill is the two-part version that is actually making change.
    const a = rng.int(1, 9) * 10 + rng.int(1, 9);
    return { skillIds: ['add.complement100'], prompt: `${a} + ? = 100`, answer: String(100 - a), difficultyAdjust: 0 };
  },
  'add.triple': (rng) => {
    const a = rng.int(110, 899);
    const b = rng.int(101, 900);
    return { skillIds: ['add.triple'], prompt: `${a} + ${b}`, answer: String(a + b), difficultyAdjust: 0 };
  },
  'add.quad': (rng) => {
    const a = rng.int(1100, 8999);
    const b = rng.int(1001, 9000);
    return { skillIds: ['add.quad'], prompt: `${a} + ${b}`, answer: String(a + b), difficultyAdjust: 0 };
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
  'sub.zeros': (rng) => {
    // A round minuend, and a subtrahend whose ones digit is never zero, so the
    // borrow has to walk the whole way through to the hundreds. sub.borrow can
    // never generate this: it builds both operands with nonzero tens digits, so
    // change from a round hundred — the case people actually stall on — was
    // unreachable.
    const hundreds = rng.int(1, 9);
    const minuend = hundreds * 100;
    const subtrahend = rng.int(1, hundreds * 10 - 2) * 10 + rng.int(1, 9);
    return {
      skillIds: ['sub.zeros'],
      prompt: `${minuend} ${MINUS} ${subtrahend}`,
      answer: String(minuend - subtrahend),
      difficultyAdjust: (hundreds - 3) * 15,
    };
  },
  'sub.triple': (rng) => {
    const a = rng.int(200, 999);
    const b = rng.int(101, a - 50);
    return { skillIds: ['sub.triple'], prompt: `${a} ${MINUS} ${b}`, answer: String(a - b), difficultyAdjust: 0 };
  },
  'sub.quad': (rng) => {
    const a = rng.int(2000, 9999);
    const b = rng.int(1001, a - 500);
    return { skillIds: ['sub.quad'], prompt: `${a} ${MINUS} ${b}`, answer: String(a - b), difficultyAdjust: 0 };
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
  'div.long': (rng) => {
    // 3-digit dividend, exact single-digit division.
    const divisor = rng.int(3, 9);
    const quotient = rng.int(Math.ceil(100 / divisor), Math.floor(999 / divisor));
    const dividend = divisor * quotient;
    return {
      skillIds: ['div.long'],
      prompt: `${dividend} ${DIVIDE} ${divisor}`,
      answer: String(quotient),
      difficultyAdjust: 0,
    };
  },
  'div.big': (rng) => {
    // 4-digit dividend, exact single-digit division.
    const divisor = rng.int(3, 9);
    const quotient = rng.int(Math.ceil(1000 / divisor), Math.floor(9999 / divisor));
    const dividend = divisor * quotient;
    return {
      skillIds: ['div.big'],
      prompt: `${dividend} ${DIVIDE} ${divisor}`,
      answer: String(quotient),
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

  // --- factorisation ---

  'factor.smallest': (rng) => {
    const [small, big] = rng.pick([...SNEAKY_TWO_DIGIT]);
    return {
      skillIds: ['factor.smallest'],
      prompt: `LEAST FACTOR OF ${small * big}`,
      answer: String(small),
      difficultyAdjust: (small - 5) * 12,
    };
  },
  'factor.prime': (rng) => {
    // "Next prime after n" is primality recognition with one right answer,
    // which a yes/no question could never be on a digits-only buffer.
    const n = rng.int(4, 90);
    const next = PRIMES_TO_120.find((p) => p > n)!;
    return {
      skillIds: ['factor.prime'],
      prompt: `NEXT PRIME AFTER ${n}`,
      answer: String(next),
      difficultyAdjust: Math.floor((next - n - 1) * 18),
    };
  },
  'factor.deep': (rng) => {
    const [small, big] = rng.pick([...SNEAKY_THREE_DIGIT]);
    return {
      skillIds: ['factor.deep'],
      prompt: `LEAST FACTOR OF ${small * big}`,
      answer: String(small),
      difficultyAdjust: (small - 10) * 10,
    };
  },

  // --- fractions and percent ---

  'frac.percent': (rng) => {
    const entry = rng.pick(wholePercentPairs());
    const { num, den } = entry.fraction;
    return {
      skillIds: ['frac.percent'],
      prompt: `${num}/${den} = ?%`,
      answer: String(entry.percent),
      difficultyAdjust: (entry.tier - 1) * 90,
    };
  },
  'frac.reduce': (rng) => {
    const entry = rng.pick(wholePercentPairs(2));
    const { num, den } = entry.fraction;
    const scale = rng.int(2, 4);
    // Show the scaled form and one term of the reduced one; the missing term is
    // the answer, so seeing the scale factor is the whole job.
    return {
      skillIds: ['frac.reduce'],
      prompt: `${num * scale}/${den * scale} = ${num}/?`,
      answer: String(den),
      difficultyAdjust: (scale - 2) * 40,
    };
  },
  'frac.of': (rng) => {
    const den = rng.pick([...FRIENDLY_DENS]);
    const num = rng.int(1, den - 1);
    const whole = den * rng.int(2, 12);
    return {
      skillIds: ['frac.of'],
      prompt: `${num}/${den} OF ${whole}`,
      answer: String((whole / den) * num),
      difficultyAdjust: (den - 5) * 12,
    };
  },
  'frac.add.same': (rng) => {
    const den = rng.pick(FRIENDLY_DENS.filter((d) => d >= 4));
    const a = rng.int(1, den - 2);
    const b = rng.int(1, den - 1 - a);
    // Answered as a numerator over the printed denominator: the sum is the
    // skill, and reducing it is frac.reduce's job.
    return {
      skillIds: ['frac.add.same'],
      prompt: `${a}/${den} + ${b}/${den} = ?/${den}`,
      answer: String(a + b),
      difficultyAdjust: (den - 6) * 10,
    };
  },
  'frac.lcd': (rng) => {
    const d1 = rng.pick([...FRIENDLY_DENS]);
    const d2 = rng.pick(FRIENDLY_DENS.filter((d) => d !== d1));
    return {
      skillIds: ['frac.lcd'],
      prompt: `1/${d1} + 1/${d2} → ?ths`,
      answer: String(lcm(d1, d2)),
      difficultyAdjust: gcd(d1, d2) === 1 ? 60 : 0,
    };
  },
  'frac.add.unlike': (rng) => {
    const d1 = rng.pick([...FRIENDLY_DENS]);
    const d2 = rng.pick(FRIENDLY_DENS.filter((d) => d !== d1));
    const common = lcm(d1, d2);
    const a = rng.int(1, d1 - 1);
    const b = rng.int(1, d2 - 1);
    // The denominator is printed, so the player converts and adds rather than
    // also having to find the LCD — that half is frac.lcd, rated separately.
    return {
      skillIds: ['frac.add.unlike'],
      prompt: `${a}/${d1} + ${b}/${d2} = ?/${common}`,
      answer: String(a * (common / d1) + b * (common / d2)),
      difficultyAdjust: (common - 8) * 6,
    };
  },
  'pct.of': (rng) => {
    // Reducing the percentage first is what keeps the answer whole, so the
    // quantity no longer has to be a multiple of twenty to guarantee it.
    const pct = rng.pick([...PERCENT_STEPS]);
    const { num, den } = percentAsFraction(pct);
    const whole = percentQuantity(rng, den);
    return {
      skillIds: ['pct.of'],
      prompt: `${pct}% OF ${whole}`,
      answer: String((whole / den) * num),
      difficultyAdjust: percentAdjust(den, whole),
    };
  },
  'pct.what': (rng) => {
    // Same construction read backwards, so the part is whole and the percentage
    // it asks for is a multiple of five — typeable, and never ambiguous, since
    // part over whole fixes exactly one answer.
    const pct = rng.pick([...PERCENT_STEPS]);
    const { num, den } = percentAsFraction(pct);
    const whole = percentQuantity(rng, den);
    return {
      skillIds: ['pct.what'],
      prompt: `${(whole / den) * num} IS ?% OF ${whole}`,
      answer: String(pct),
      difficultyAdjust: percentAdjust(den, whole),
    };
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
