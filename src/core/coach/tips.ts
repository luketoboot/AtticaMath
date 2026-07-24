/**
 * Operator tip content. Data file keyed by skill id.
 * Tone: terse, cool, a little dry. Never condescending, never school flavored.
 */
import type { SkillId } from '../skills/taxonomy';

export interface Tip {
  skillId: SkillId;
  text: string;
}

export const TIPS: readonly Tip[] = [
  { skillId: 'add.single', text: 'Small sums. Stop counting. See 4+3 as one shape: 7. Burn the pairs in.' },
  { skillId: 'add.bridge', text: 'Crossing ten: break it. 8+7 → 8+2 is 10, 5 left over. 15. Always route through ten.' },
  { skillId: 'add.double', text: 'Big number first, tens then ones. 47+38 → 47+30 is 77, +8 is 85. Two hops, done.' },
  { skillId: 'add.triple', text: 'Same drill, bigger numbers. Hundreds, tens, ones. Left to right. Keep the running total hot.' },
  { skillId: 'add.quad', text: 'Four digits is just three digits with a bigger hat. Thousands first, keep the total rolling.' },
  { skillId: 'sub.single', text: 'Subtraction is a gap. 9−6: what jumps 6 up to 9? Three. Count up, not down.' },
  { skillId: 'sub.triple', text: 'Big gaps: round, subtract, repay. 634−287 → 634−300 is 334, give 13 back. 347.' },
  { skillId: 'sub.quad', text: 'Same machine at scale. Overshoot to a clean thousand, then repay the difference.' },
  { skillId: 'sub.double', text: 'Peel tens first. 76−32 → 76−30 is 46, minus 2. Never chew the whole thing at once.' },
  { skillId: 'sub.borrow', text: 'Borrowing is slow. Overshoot instead: 62−38 → 62−40 is 22, give 2 back. 24.' },
  { skillId: 'mul.table.2', text: 'Twos are doubles. Double is add-to-itself. You already know addition. Use it.' },
  { skillId: 'mul.table.3', text: 'Threes: double it, add one more. 3×7 → 14+7. 21. Two moves you already own.' },
  { skillId: 'mul.table.4', text: 'Fours: double twice. 4×7 → 14 → 28. Doubling is free. Spend it.' },
  { skillId: 'mul.table.5', text: 'Fives: take ten times, cut in half. 5×8 → 80 → 40. Fives always end in 0 or 5.' },
  { skillId: 'mul.table.6', text: 'Sixes: five times plus one more. 6×7 → 35+7 → 42. Ride the fives you already have.' },
  { skillId: 'mul.table.7', text: 'Sevens have no trick. That is the trick. Drill the four hard ones: 7×6, 7×7, 7×8, 7×9.' },
  { skillId: 'mul.table.8', text: 'Eights: double three times. 8×6 → 12 → 24 → 48. Or take 10×, drop 2×. Your pick.' },
  { skillId: 'mul.table.9', text: 'Nines: ten times, minus one. 9×7 → 70−7 → 63. Digits of the answer sum to 9. Check yourself.' },
  { skillId: 'mul.table.10', text: 'Tens: glue a zero on. If this one costs you time, your typing is the bottleneck, not the math.' },
  { skillId: 'mul.table.11', text: 'Elevens: write the digit twice. 11×7 is 77. Past 9: split and sum. 11×26 → 2_6, 2+6 between. 286.' },
  { skillId: 'mul.table.12', text: 'Twelves: ten times plus double. 12×7 → 70+14 → 84. Two easy pieces.' },
  { skillId: 'mul.2x1', text: 'Split the big one. 47×6 → 40×6 is 240, 7×6 is 42. 282. Tens first, always.' },
  { skillId: 'mul.2x2', text: 'Four small products, one sum. 23×14 → 20×14 is 280, 3×14 is 42. 322. Keep the partials alive.' },
  { skillId: 'mul.3x2', text: 'Same machine, more parts. Break by place value, add as you go. Do not stack it all at the end.' },
  { skillId: 'mul.4x1', text: 'Long one. Left to right, place by place, running total. Right-to-left is for paper. You have no paper.' },
  { skillId: 'div.exact', text: 'Division is multiplication in reverse. 56÷8: what times 8 is 56? Hunt from the table, not from zero.' },
  { skillId: 'div.remainder', text: 'Find the nearest multiple below, the leftover is your remainder. 47÷6 → 42 is 6×7 → remainder 5.' },
  { skillId: 'div.long', text: 'Long division, no paper: peel place by place. 738÷6 → 600÷6 is 100, 138÷6 is 23. 123.' },
  { skillId: 'div.big', text: 'Four digits divide the same way — biggest clean chunk first, then work the remainder down.' },
  { skillId: 'ooo.basic', text: 'Multiplication fires first. 3+4×5 is 3+20. Scan for ×, resolve it, then sweep the rest.' },
] as const;

const tipsBySkill = new Map<SkillId, Tip>(TIPS.map((t) => [t.skillId, t]));

export function tipForSkill(skillId: SkillId): Tip | undefined {
  return tipsBySkill.get(skillId);
}
