/**
 * The Playbook: one mental-math technique per skill, in the Operator's voice.
 *
 * Tips (tips.ts) are the between-wave one-liners; these are the full moves —
 * name, method, worked examples — for the player who wants to learn a trick
 * deliberately and then drill it. Data, not code: adding a skill means adding
 * its technique here, and a test holds the two lists together.
 *
 * Examples are written as gaze paths — problem → what you see → steps →
 * answer — because the skill being taught is how to LOOK at the numbers, and
 * an arrow chain is that look, written down.
 */
import type { SkillTable } from '../skills/rating';
import {
  getSkill,
  isFractionSkill,
  type SkillFilter,
  type SkillId,
} from '../skills/taxonomy';

export interface Technique {
  skillId: SkillId;
  /** The move's name, said like a callsign. */
  title: string;
  /** The method, one short line per step. */
  method: readonly string[];
  /** Worked gaze paths, at least two, on different numbers. */
  examples: readonly string[];
}

export const TECHNIQUES: readonly Technique[] = [
  // --- addition ---
  {
    skillId: 'add.single',
    title: 'OWN THE PAIRS',
    method: [
      'Doubles and pairs-to-ten are free. Burn them in until they are not math.',
      'Everything else sits one step from an anchor you own: find it, adjust by one.',
    ],
    examples: [
      '4+3 → one less than 4+4 → 7.',
      '3+5 → one more than 4+4 → 8.',
      '2+6 → two steps up from 6 → 8.',
    ],
  },
  {
    skillId: 'add.complement10',
    title: 'THE TEN BONDS',
    method: [
      'Nine pairs make ten: 1-9, 2-8, 3-7, 4-6, 5-5. Know them cold.',
      'Half the moves in this deck spend these pairs. This is the ammunition.',
    ],
    examples: [
      '7 + ? = 10 → 7 wants 3. No counting — it just is 3.',
      '4 + ? = 10 → the pair: 6.',
      '8 + ? = 10 → 2, before you finish reading it.',
    ],
  },
  {
    skillId: 'add.bridge',
    title: 'ROUTE THROUGH TEN',
    method: [
      'Split the second number: enough to fill the first up to ten, the rest rides after.',
      'Ten is a rest stop. The leftover lands on it clean.',
    ],
    examples: [
      '8+7 → 8 wants 2 → 10, with 5 left → 15.',
      '9+6 → 9 wants 1 → 10, with 5 left → 15.',
      '7+5 → 7 wants 3 → 10, with 2 left → 12.',
    ],
  },
  {
    skillId: 'add.double',
    title: 'TENS FIRST, LEFT TO RIGHT',
    method: [
      'Big number first. Add the tens, then the ones, keeping the total live.',
      'Two hops. No columns, no carrying, no paper.',
    ],
    examples: [
      '47+38 → 47+30 is 77 → 77+8 → 85.',
      '26+59 → see 26+60 instead → 86 → one back → 85.',
      '68+27 → 68+20 is 88 → 88+7 → 95.',
    ],
  },
  {
    skillId: 'add.complement100',
    title: 'MAKE CHANGE',
    method: [
      'Ones digit up to ten, tens digit up to nine. One pass, no borrowing.',
      'This is exactly the change from a hundred — count the till, not the gap.',
    ],
    examples: [
      '43 + ? = 100 → ones: 3 wants 7 → tens: 4 wants 5 → 57.',
      '81 + ? = 100 → 1 wants 9, 8 wants 1 → 19.',
      '28 + ? = 100 → 8 wants 2, 2 wants 7 → 72.',
    ],
  },
  {
    skillId: 'add.triple',
    title: 'RUNNING TOTAL',
    method: [
      'Hundreds, tens, ones — left to right, speaking the running total in your head.',
      'The total is the only thing you carry. Parked numbers rot.',
    ],
    examples: [
      '356+248 → 556 → 596 → 604.',
      '423+199 → see 423+200 → 623 → one back → 622.',
    ],
  },
  {
    skillId: 'add.quad',
    title: 'SAME MACHINE, BIGGER HAT',
    method: [
      'Thousands first, then ride the same left-to-right rail.',
      'Awkward numbers: round up, add, repay the difference at the end.',
    ],
    examples: [
      '2380+1997 → 2380+2000 is 4380 → repay 3 → 4377.',
      '5245+2320 → 7245 → 7545 → 7565.',
    ],
  },

  // --- subtraction ---
  {
    skillId: 'sub.single',
    title: 'COUNT THE GAP',
    method: [
      'Subtraction is a distance, not a removal. Ask what jumps the small one up to the big one.',
      'Counting up beats counting down. Always.',
    ],
    examples: [
      '9−6 → 6 climbs to 9 in 3 → 3.',
      '8−3 → 3 climbs to 8 in 5 → 5.',
    ],
  },
  {
    skillId: 'sub.double',
    title: 'PEEL THE TENS',
    method: [
      'Take the tens off first, then the ones.',
      'Two clean bites instead of one awkward chew.',
    ],
    examples: [
      '76−32 → 76−30 is 46 → minus 2 → 44.',
      '97−45 → 97−40 is 57 → minus 5 → 52.',
    ],
  },
  {
    skillId: 'sub.borrow',
    title: 'OVERSHOOT AND REPAY',
    method: [
      'Round what you are subtracting up to a clean ten. Subtract that. Give back the overshoot.',
      'Borrowing is paper tech. This is head tech.',
    ],
    examples: [
      '62−38 → see 62−40 → 22 → give 2 back → 24.',
      '73−47 → see 73−50 → 23 → give 3 back → 26.',
      '51−19 → see 51−20 → 31 → give 1 back → 32.',
    ],
  },
  {
    skillId: 'sub.zeros',
    title: 'DROP TO 999',
    method: [
      'Zeros have nothing to lend. Step the round number down by one — every zero becomes a nine.',
      'Subtract with no borrowing anywhere, then put the one back.',
    ],
    examples: [
      '500−137 → 499−137 is 362 → plus 1 → 363.',
      '300−58 → 299−58 is 241 → plus 1 → 242.',
      '700−463 → 699−463 is 236 → plus 1 → 237.',
    ],
  },
  {
    skillId: 'sub.triple',
    title: 'ROUND, SUBTRACT, REPAY',
    method: [
      'Round the number you are subtracting to the nearest hundred. One big clean cut.',
      'Then one small correction, and you already know its size.',
    ],
    examples: [
      '634−287 → see 634−300 → 334 → repay 13 → 347.',
      '512−194 → see 512−200 → 312 → repay 6 → 318.',
    ],
  },
  {
    skillId: 'sub.quad',
    title: 'CLEAN THOUSANDS',
    method: [
      'Overshoot to the nearest thousand and repay. Scale changes nothing.',
    ],
    examples: [
      '5230−2996 → see 5230−3000 → 2230 → plus 4 → 2234.',
      '8114−4990 → see 8114−5000 → 3114 → plus 10 → 3124.',
    ],
  },

  // --- times tables ---
  {
    skillId: 'mul.table.2',
    title: 'DOUBLE IT',
    method: [
      'Twos are doubles, and a double is a number plus itself.',
      'Awkward doubles split by place: double the tens, double the ones, add.',
    ],
    examples: ['2×8 → 8+8 → 16.', '2×47 → 80 and 14 → 94.'],
  },
  {
    skillId: 'mul.table.3',
    title: 'DOUBLE, PLUS ONE MORE',
    method: ['Three of anything is a double plus one more of it. Two moves you already own.'],
    examples: ['3×7 → 14, plus 7 → 21.', '3×9 → 18, plus 9 → 27.'],
  },
  {
    skillId: 'mul.table.4',
    title: 'DOUBLE TWICE',
    method: ['Four is two twos: double, then double again. Doubling is free — spend it.'],
    examples: ['4×7 → 14 → 28.', '4×9 → 18 → 36.'],
  },
  {
    skillId: 'mul.table.5',
    title: 'HALF OF TEN TIMES',
    method: [
      'Ten times is free. Five times is half of it.',
      'Every answer ends in 0 or 5 — a built-in error check.',
    ],
    examples: ['5×8 → 80 → 40.', '5×7 → 70 → 35.'],
  },
  {
    skillId: 'mul.table.6',
    title: 'FIVES PLUS ONE',
    method: ['Six times is five times plus one more. Ride the fives you already have.'],
    examples: ['6×7 → 35, plus 7 → 42.', '6×9 → 45, plus 9 → 54.'],
  },
  {
    skillId: 'mul.table.7',
    title: 'FOUR FACTS, BOUGHT OUTRIGHT',
    method: [
      'Sevens have no shortcut. That is the trick — stop hunting for one.',
      'Only four are ever hard: 7×6, 7×7, 7×8, 7×9. Buy those; the rest arrive flipped from smaller tables.',
    ],
    examples: [
      '7×8 → 56: five, six, seven, eight — in a row.',
      '7×4 → flip it: 4×7 is double-double → 28.',
    ],
  },
  {
    skillId: 'mul.table.8',
    title: 'DOUBLE THREE TIMES',
    method: [
      'Eight is three doublings in a row.',
      'Or take ten times and drop two times. Pick whichever lands cleaner.',
    ],
    examples: ['8×6 → 12 → 24 → 48.', '8×7 → 70 minus 14 → 56.'],
  },
  {
    skillId: 'mul.table.9',
    title: 'TEN TIMES, MINUS ONE',
    method: [
      'Nine times is ten times minus one of it.',
      'The digits of every answer sum to nine. Check yourself for free.',
    ],
    examples: [
      '9×7 → 70−7 → 63. And 6+3 is 9. Confirmed.',
      '9×8 → 80−8 → 72. And 7+2 is 9. Confirmed.',
    ],
  },
  {
    skillId: 'mul.table.10',
    title: 'SHIFT LEFT',
    method: [
      'Glue a zero on — that is place value doing your work, every digit sliding one slot bigger.',
      'If this costs you time, your typing is the bottleneck, not the math.',
    ],
    examples: ['10×34 → 340.', '10×250 → 2500. Slide, do not compute.'],
  },
  {
    skillId: 'mul.table.11',
    title: 'TWINS, THEN THE SPLIT',
    method: [
      'Single digits twin: 11×7 is 77.',
      'Two digits: pull them apart and drop their sum in the middle. Carry if it spills.',
    ],
    examples: [
      '11×7 → 77.',
      '11×26 → 2_6 → 2+6 between → 286.',
      '11×48 → 4_8 → 12 between → carry → 528.',
    ],
  },
  {
    skillId: 'mul.table.12',
    title: 'TEN PLUS DOUBLE',
    method: ['Twelve times is ten times plus a double. Both pieces are free; the add is the whole job.'],
    examples: ['12×7 → 70+14 → 84.', '12×9 → 90+18 → 108.'],
  },

  // --- multi-digit multiplication ---
  {
    skillId: 'mul.2x1',
    title: 'SPLIT BY PLACE',
    method: [
      'Break the big number into tens and ones. Multiply each. Add.',
      'Tens first, so the big piece is in hand while the small one lands.',
    ],
    examples: ['47×6 → 240 and 42 → 282.', '38×4 → 120 and 32 → 152.'],
  },
  {
    skillId: 'mul.2x2',
    title: 'TWO PARTIALS, RUNNING',
    method: [
      'Split one factor by place and run two partial products.',
      'Add as you go. Never park all the pieces and add at the end.',
    ],
    examples: [
      '23×14 → 23×10 is 230 → 23×4 is 92 → 322.',
      '31×25 → 25×30 is 750 → one more 25 → 775.',
    ],
  },
  {
    skillId: 'mul.3x2',
    title: 'ANCHOR ON HUNDREDS',
    method: [
      'Same splitting, more parts — hundreds ride first, running total the whole way.',
      'Say the total in your head after every piece. Parked numbers rot.',
    ],
    examples: [
      '134×21 → 134×20 is 2680 → one more 134 → 2814.',
      '210×32 → 210×30 is 6300 → 210×2 is 420 → 6720.',
    ],
  },
  {
    skillId: 'mul.4x1',
    title: 'LEFT TO RIGHT RAIL',
    method: [
      'Place by place from the left, total live the entire way.',
      'Right-to-left wants paper. You have no paper.',
    ],
    examples: [
      '2103×4 → 8000 → 8400 → 8412.',
      '1250×8 → 8000 → plus 2000 → 10000.',
    ],
  },

  // --- division ---
  {
    skillId: 'div.exact',
    title: 'MULTIPLICATION, MIRRORED',
    method: [
      'Do not divide. Ask what fills the multiplication backwards.',
      'Hunt from the table you own, not from zero.',
    ],
    examples: [
      '56÷8 → what times 8 is 56? → 7.',
      '96÷12 → what times 12 is 96? → 8.',
    ],
  },
  {
    skillId: 'div.remainder',
    title: 'NEAREST FLOOR BELOW',
    method: [
      'Find the biggest multiple that fits underneath. The leftover is the remainder.',
    ],
    examples: [
      '47÷6 → 42 fits (6×7) → 5 left over → r5.',
      '80÷9 → 72 fits (9×8) → 8 left over → r8.',
    ],
  },
  {
    skillId: 'div.long',
    title: 'PEEL BY PLACE',
    method: [
      'Carve the dividend into clean chunks the divisor eats whole — biggest chunk first.',
      'The chunks are yours to choose. Make them round.',
    ],
    examples: [
      '738÷6 → 600÷6 is 100 → 138÷6 is 23 → 123.',
      '882÷7 → 700÷7 is 100 → 182÷7 is 26 → 126.',
    ],
  },
  {
    skillId: 'div.big',
    title: 'BIG CLEAN CHUNKS',
    method: ['Same peel at four digits: pull the biggest round chunk, then work the rest down.'],
    examples: [
      '3216÷8 → 3200÷8 is 400 → 16÷8 is 2 → 402.',
      '5432÷4 → 4000÷4 is 1000 → 1432÷4 is 358 → 1358.',
    ],
  },

  // --- order of operations ---
  {
    skillId: 'ooo.basic',
    title: 'TIMES FIRES FIRST',
    method: [
      'Scan for ×. Resolve it. Then sweep the adds and subtracts left to right.',
      'The multiply is a sealed package — nothing touches it until it is a number.',
    ],
    examples: ['3+4×5 → 3+20 → 23.', '6×3−4 → 18−4 → 14.'],
  },

  // --- factors ---
  {
    skillId: 'factor.smallest',
    title: 'RUN THE GATE',
    method: [
      'Test primes in order: 2, 3, 5, 7, 11, 13. First one that bites is the answer.',
      'Evens fall to 2, digit-sums divisible by 3 fall to 3, fives to 5 — three checks before you even think.',
    ],
    examples: [
      '91 → not even → 9+1 is not a three → no five → 7 bites → 7×13.',
      '87 → not even → 8+7 is 15, a three → 3.',
    ],
  },
  {
    skillId: 'factor.prime',
    title: 'SQUARE ROOT CEILING',
    method: [
      'A number is prime once every prime up to its square root has missed.',
      'Two digits: that is 2, 3, 5, 7. Four checks and you are certain.',
    ],
    examples: [
      '89 → odd → 8+9 no → no five → 7 misses → prime.',
      'Next prime after 62 → 63 is a three, 64-65-66 fall at the gate → 67.',
    ],
  },
  {
    skillId: 'factor.deep',
    title: 'LONGER WALK, SAME GATE',
    method: [
      'Three digits widen the gate to 11, 13, 17. Digit-sum catches the threes; the alternating sum catches elevens.',
      'Nothing above the square root can be first. Stop there.',
    ],
    examples: [
      '187 → 1−8+7 is 0 → 11 divides → 11×17.',
      '161 → survives 2, 3, 5 → 7 bites → 7×23.',
    ],
  },

  // --- fractions ---
  {
    skillId: 'frac.percent',
    title: 'SCALE TO A HUNDRED',
    method: [
      'Percent means per hundred. Scale the denominator to 100 and read the top.',
      'Anchors: halves 50, quarters 25, fifths 20, tenths 10, twentieths 5.',
    ],
    examples: [
      '3/20 → times 5 → 15/100 → 15%.',
      '7/10 → times 10 → 70%.',
      '9/25 → times 4 → 36%.',
    ],
  },
  {
    skillId: 'frac.reduce',
    title: 'SAME CUT, FEWER SLICES',
    method: [
      'Divide top and bottom by what they share — biggest shared factor first.',
      'Even over even halves instantly. Digit-sums catch the threes.',
    ],
    examples: [
      '18/24 → both take 6 → 3/4.',
      '30/45 → both take 15 → 2/3.',
    ],
  },
  {
    skillId: 'frac.of',
    title: 'DIVIDE FIRST',
    method: [
      'Of means times. Divide by the bottom, then multiply by the top.',
      'That order keeps the numbers small the whole way.',
    ],
    examples: [
      '3/4 of 20 → 20÷4 is 5 → times 3 → 15.',
      '2/3 of 27 → 27÷3 is 9 → times 2 → 18.',
    ],
  },
  {
    skillId: 'frac.add.same',
    title: 'TOPS ONLY',
    method: [
      'Same denominator means same slice size: add the tops, leave the bottom alone.',
      'The slice never changed. Only the count did.',
    ],
    examples: ['3/8 + 2/8 → 5/8.', '5/12 + 4/12 → 9/12.'],
  },
  {
    skillId: 'frac.lcd',
    title: 'WALK THE BIGGER ONE',
    method: [
      'Step the bigger denominator through its multiples until the smaller one divides in.',
      'Not always the product — 4 and 6 meet at 12, and 24 is twice the work.',
    ],
    examples: [
      '4 and 6 → walk the 6: 6, 12 → twelfths.',
      '8 and 12 → walk the 12: 12, 24 → twenty-fourths.',
      '3 and 5 → nothing shared → the product, 15.',
    ],
  },
  {
    skillId: 'frac.add.unlike',
    title: 'CONVERT, THEN EASY',
    method: [
      'Scale each fraction onto the common denominator; the top rides the same factor as the bottom.',
      'Then it is the same-slices case, and that one is free.',
    ],
    examples: [
      '1/2 + 1/3 → 3/6 + 2/6 → 5/6.',
      '3/4 + 1/6 → 9/12 + 2/12 → 11/12.',
    ],
  },

  // --- percent ---
  {
    skillId: 'pct.of',
    title: 'TENTHS AND HALVES',
    method: [
      'Find 10% — slide the decimal — and build: 5% is half of it, 20% is double, 15% is one and a half.',
      'When the number fights back, reduce the percent to a fraction instead. 60% is 3/5.',
    ],
    examples: [
      '15% of 60 → 10% is 6 → half again is 3 → 9.',
      '60% of 35 → 3/5 of 35 → 35÷5 is 7 → times 3 → 21.',
      '35% of 80 → 10% is 8 → 8×3 is 24, half of 8 is 4 → 28.',
    ],
  },
  {
    skillId: 'pct.what',
    title: 'PART OVER WHOLE',
    method: [
      'Put the part over the whole. Reduce. Scale to a hundred.',
      'Reduce first — the scaling usually finishes itself.',
    ],
    examples: [
      '24 is ?% of 40 → 24/40 → 3/5 → 60%.',
      '18 is ?% of 120 → 18/120 → 3/20 → 15%.',
    ],
  },
] as const;

const bySkill = new Map<SkillId, Technique>(TECHNIQUES.map((t) => [t.skillId, t]));

export function techniqueForSkill(id: SkillId): Technique | undefined {
  return bySkill.get(id);
}

/** Browser groups, same prefix scheme the Brain Scan uses. */
export const PLAYBOOK_GROUPS: readonly { title: string; prefixes: readonly string[] }[] = [
  { title: 'ADD', prefixes: ['add.'] },
  { title: 'SUBTRACT', prefixes: ['sub.'] },
  { title: 'MULTIPLY', prefixes: ['mul.'] },
  { title: 'DIVIDE', prefixes: ['div.'] },
  { title: 'FACTORS', prefixes: ['factor.'] },
  { title: 'FRACTIONS', prefixes: ['frac.', 'pct.'] },
  { title: 'MIXED', prefixes: ['ooo.'] },
];

/**
 * The practice filter a drill run uses: the technique's own family, capped at
 * its digit size, fractions only when the technique is one. Tight enough to
 * meet the move constantly, loose enough that the run is still a game.
 */
export function drillFilterFor(id: SkillId): SkillFilter {
  const def = getSkill(id);
  return {
    op: def.op === 'mixed' ? 'all' : def.op,
    maxDigits: def.digits,
    fractions: isFractionSkill(id),
  };
}

/**
 * What the Playbook recommends: the weakest skill the player has actually
 * met. Never-attempted skills stay out — "you have not tried this" is the
 * placement sweep's business, not a study tip.
 */
export function weakestAttempted(table: SkillTable): SkillId | undefined {
  let weakest: SkillId | undefined;
  let lowest = Number.POSITIVE_INFINITY;
  for (const [id, state] of Object.entries(table)) {
    if (state.attempts === 0 || !bySkill.has(id)) continue;
    if (state.rating < lowest) {
      lowest = state.rating;
      weakest = id;
    }
  }
  return weakest;
}
