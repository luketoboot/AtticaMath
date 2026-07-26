/**
 * The Playbook: one mental-math technique per skill, in the Operator's voice.
 *
 * Tips (tips.ts) are the between-wave one-liners; these are the full moves —
 * name, method, one worked example — for the player who wants to learn a
 * trick deliberately and then drill it. Data, not code: adding a skill means
 * adding its technique here, and a test holds the two lists together.
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
  /** One worked line showing it land. */
  example: string;
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
    example: '6+7 → double 6 is 12, one more → 13.',
  },
  {
    skillId: 'add.complement10',
    title: 'THE TEN BONDS',
    method: [
      'Nine pairs make ten: 1-9, 2-8, 3-7, 4-6, 5-5. Know them cold.',
      'Half the moves in this deck spend these pairs. This is the ammunition.',
    ],
    example: '7 wants 3. No counting — it just is 3.',
  },
  {
    skillId: 'add.bridge',
    title: 'ROUTE THROUGH TEN',
    method: [
      'Split the second number: enough to fill the first up to ten, the rest rides after.',
      'Ten is a rest stop. The leftover lands on it clean.',
    ],
    example: '8+7 → 8+2 is 10, 5 left → 15.',
  },
  {
    skillId: 'add.double',
    title: 'TENS FIRST, LEFT TO RIGHT',
    method: [
      'Big number first. Add the tens, then the ones, keeping the total live.',
      'Two hops. No columns, no carrying, no paper.',
    ],
    example: '47+38 → 47+30 is 77 → 77+8 is 85.',
  },
  {
    skillId: 'add.complement100',
    title: 'MAKE CHANGE',
    method: [
      'Ones digit up to ten, tens digit up to nine. One pass, no borrowing.',
      'This is exactly the change from a hundred — count the till, not the gap.',
    ],
    example: '43+? is 100 → ones: 7, tens: 5 → 57.',
  },
  {
    skillId: 'add.triple',
    title: 'RUNNING TOTAL',
    method: [
      'Hundreds, tens, ones — left to right, speaking the running total in your head.',
      'The total is the only thing you carry. Parked numbers rot.',
    ],
    example: '356+248 → 556 → 596 → 604.',
  },
  {
    skillId: 'add.quad',
    title: 'SAME MACHINE, BIGGER HAT',
    method: [
      'Thousands first, then ride the same left-to-right rail.',
      'Awkward numbers: round up, add, repay the difference at the end.',
    ],
    example: '2380+1997 → 2380+2000 is 4380 → repay 3 → 4377.',
  },

  // --- subtraction ---
  {
    skillId: 'sub.single',
    title: 'COUNT THE GAP',
    method: [
      'Subtraction is a distance, not a removal. Ask what jumps the small one up to the big one.',
      'Counting up beats counting down. Always.',
    ],
    example: '9−6 → 6 needs 3 to reach 9. Done.',
  },
  {
    skillId: 'sub.double',
    title: 'PEEL THE TENS',
    method: [
      'Take the tens off first, then the ones.',
      'Two clean bites instead of one awkward chew.',
    ],
    example: '76−32 → 76−30 is 46 → minus 2 → 44.',
  },
  {
    skillId: 'sub.borrow',
    title: 'OVERSHOOT AND REPAY',
    method: [
      'Round what you are subtracting up to a clean ten. Subtract that. Give back the overshoot.',
      'Borrowing is paper tech. This is head tech.',
    ],
    example: '62−38 → 62−40 is 22 → give 2 back → 24.',
  },
  {
    skillId: 'sub.zeros',
    title: 'DROP TO 999',
    method: [
      'Zeros have nothing to lend. Step the round number down by one — every zero becomes a nine.',
      'Subtract with no borrowing anywhere, then put the one back.',
    ],
    example: '500−137 → 499−137 is 362 → plus 1 → 363.',
  },
  {
    skillId: 'sub.triple',
    title: 'ROUND, SUBTRACT, REPAY',
    method: [
      'Round the number you are subtracting to the nearest hundred. One big clean cut.',
      'Then one small correction, and you already know its size.',
    ],
    example: '634−287 → 634−300 is 334 → repay 13 → 347.',
  },
  {
    skillId: 'sub.quad',
    title: 'CLEAN THOUSANDS',
    method: [
      'Overshoot to the nearest thousand and repay. Scale changes nothing.',
    ],
    example: '5230−2996 → 5230−3000 is 2230 → plus 4 → 2234.',
  },

  // --- times tables ---
  {
    skillId: 'mul.table.2',
    title: 'DOUBLE IT',
    method: [
      'Twos are doubles, and a double is a number plus itself.',
      'Awkward doubles split by place: double the tens, double the ones, add.',
    ],
    example: '2×47 → 80 and 14 → 94.',
  },
  {
    skillId: 'mul.table.3',
    title: 'DOUBLE, PLUS ONE MORE',
    method: ['Three of anything is a double plus one more of it. Two moves you already own.'],
    example: '3×7 → 14+7 → 21.',
  },
  {
    skillId: 'mul.table.4',
    title: 'DOUBLE TWICE',
    method: ['Four is two twos: double, then double again. Doubling is free — spend it.'],
    example: '4×7 → 14 → 28.',
  },
  {
    skillId: 'mul.table.5',
    title: 'HALF OF TEN TIMES',
    method: [
      'Ten times is free. Five times is half of it.',
      'Every answer ends in 0 or 5 — a built-in error check.',
    ],
    example: '5×8 → 80 → 40.',
  },
  {
    skillId: 'mul.table.6',
    title: 'FIVES PLUS ONE',
    method: ['Six times is five times plus one more. Ride the fives you already have.'],
    example: '6×7 → 35+7 → 42.',
  },
  {
    skillId: 'mul.table.7',
    title: 'FOUR FACTS, BOUGHT OUTRIGHT',
    method: [
      'Sevens have no shortcut. That is the trick — stop hunting for one.',
      'Only four are ever hard: 7×6, 7×7, 7×8, 7×9. Buy those; the rest arrive flipped from smaller tables.',
    ],
    example: '7×8 is 56 — five, six, seven, eight, in a row.',
  },
  {
    skillId: 'mul.table.8',
    title: 'DOUBLE THREE TIMES',
    method: [
      'Eight is three doublings in a row.',
      'Or take ten times and drop two times. Pick whichever lands cleaner.',
    ],
    example: '8×6 → 12 → 24 → 48.',
  },
  {
    skillId: 'mul.table.9',
    title: 'TEN TIMES, MINUS ONE',
    method: [
      'Nine times is ten times minus one of it.',
      'The digits of every answer sum to nine. Check yourself for free.',
    ],
    example: '9×7 → 70−7 → 63. And 6+3 is 9. Confirmed.',
  },
  {
    skillId: 'mul.table.10',
    title: 'SHIFT LEFT',
    method: [
      'Glue a zero on — that is place value doing your work, every digit sliding one slot bigger.',
      'If this costs you time, your typing is the bottleneck, not the math.',
    ],
    example: '10×34 → 340.',
  },
  {
    skillId: 'mul.table.11',
    title: 'TWINS, THEN THE SPLIT',
    method: [
      'Single digits twin: 11×7 is 77.',
      'Two digits: pull them apart and drop their sum in the middle. Carry if it spills.',
    ],
    example: '11×26 → 2_6, 2+6 between → 286.',
  },
  {
    skillId: 'mul.table.12',
    title: 'TEN PLUS DOUBLE',
    method: ['Twelve times is ten times plus a double. Both pieces are free; the add is the whole job.'],
    example: '12×7 → 70+14 → 84.',
  },

  // --- multi-digit multiplication ---
  {
    skillId: 'mul.2x1',
    title: 'SPLIT BY PLACE',
    method: [
      'Break the big number into tens and ones. Multiply each. Add.',
      'Tens first, so the big piece is in hand while the small one lands.',
    ],
    example: '47×6 → 240 and 42 → 282.',
  },
  {
    skillId: 'mul.2x2',
    title: 'TWO PARTIALS, RUNNING',
    method: [
      'Split one factor by place and run two partial products.',
      'Add as you go. Never park all the pieces and add at the end.',
    ],
    example: '23×14 → 230 and 92 → 322.',
  },
  {
    skillId: 'mul.3x2',
    title: 'ANCHOR ON HUNDREDS',
    method: [
      'Same splitting, more parts — hundreds ride first, running total the whole way.',
      'Say the total in your head after every piece. Parked numbers rot.',
    ],
    example: '134×21 → 2680 and 134 → 2814.',
  },
  {
    skillId: 'mul.4x1',
    title: 'LEFT TO RIGHT RAIL',
    method: [
      'Place by place from the left, total live the entire way.',
      'Right-to-left wants paper. You have no paper.',
    ],
    example: '2103×4 → 8000 → 8400 → 8412.',
  },

  // --- division ---
  {
    skillId: 'div.exact',
    title: 'MULTIPLICATION, MIRRORED',
    method: [
      'Do not divide. Ask what fills the multiplication backwards.',
      'Hunt from the table you own, not from zero.',
    ],
    example: '56÷8 → what times 8 is 56? Seven.',
  },
  {
    skillId: 'div.remainder',
    title: 'NEAREST FLOOR BELOW',
    method: [
      'Find the biggest multiple that fits underneath. The leftover is the remainder.',
    ],
    example: '47÷6 → 42 fits (6×7) → remainder 5.',
  },
  {
    skillId: 'div.long',
    title: 'PEEL BY PLACE',
    method: [
      'Carve the dividend into clean chunks the divisor eats whole — biggest chunk first.',
      'The chunks are yours to choose. Make them round.',
    ],
    example: '738÷6 → 600÷6 is 100, 138÷6 is 23 → 123.',
  },
  {
    skillId: 'div.big',
    title: 'BIG CLEAN CHUNKS',
    method: ['Same peel at four digits: pull the biggest round chunk, then work the rest down.'],
    example: '3216÷8 → 3200÷8 is 400, 16÷8 is 2 → 402.',
  },

  // --- order of operations ---
  {
    skillId: 'ooo.basic',
    title: 'TIMES FIRES FIRST',
    method: [
      'Scan for ×. Resolve it. Then sweep the adds and subtracts left to right.',
      'The multiply is a sealed package — nothing touches it until it is a number.',
    ],
    example: '3+4×5 → 3+20 → 23.',
  },

  // --- factors ---
  {
    skillId: 'factor.smallest',
    title: 'RUN THE GATE',
    method: [
      'Test primes in order: 2, 3, 5, 7, 11, 13. First one that bites is the answer.',
      'Evens fall to 2, digit-sums divisible by 3 fall to 3, fives to 5 — three checks before you even think.',
    ],
    example: '91 → not even, 9+1 is not a three, no five → 7 bites. 7×13.',
  },
  {
    skillId: 'factor.prime',
    title: 'SQUARE ROOT CEILING',
    method: [
      'A number is prime once every prime up to its square root has missed.',
      'Two digits: that is 2, 3, 5, 7. Four checks and you are certain.',
    ],
    example: '89 → odd, 8+9 no, no five, 7 misses → prime.',
  },
  {
    skillId: 'factor.deep',
    title: 'LONGER WALK, SAME GATE',
    method: [
      'Three digits widen the gate to 11, 13, 17. Digit-sum catches the threes; the alternating sum catches elevens.',
      'Nothing above the square root can be first. Stop there.',
    ],
    example: '187 → 1−8+7 is 0 → 11 divides. 11×17.',
  },

  // --- fractions ---
  {
    skillId: 'frac.percent',
    title: 'SCALE TO A HUNDRED',
    method: [
      'Percent means per hundred. Scale the denominator to 100 and read the top.',
      'Anchors: halves 50, quarters 25, fifths 20, tenths 10, twentieths 5.',
    ],
    example: '3/20 → times 5 → 15/100 → 15%.',
  },
  {
    skillId: 'frac.reduce',
    title: 'SAME CUT, FEWER SLICES',
    method: [
      'Divide top and bottom by what they share — biggest shared factor first.',
      'Even over even halves instantly. Digit-sums catch the threes.',
    ],
    example: '18/24 → both take 6 → 3/4.',
  },
  {
    skillId: 'frac.of',
    title: 'DIVIDE FIRST',
    method: [
      'Of means times. Divide by the bottom, then multiply by the top.',
      'That order keeps the numbers small the whole way.',
    ],
    example: '3/4 of 20 → 20÷4 is 5 → times 3 → 15.',
  },
  {
    skillId: 'frac.add.same',
    title: 'TOPS ONLY',
    method: [
      'Same denominator means same slice size: add the tops, leave the bottom alone.',
      'The slice never changed. Only the count did.',
    ],
    example: '3/8 + 2/8 → 5/8.',
  },
  {
    skillId: 'frac.lcd',
    title: 'WALK THE BIGGER ONE',
    method: [
      'Step the bigger denominator through its multiples until the smaller one divides in.',
      'Not always the product — 4 and 6 meet at 12, and 24 is twice the work.',
    ],
    example: '1/4 + 1/6 → 6, 12 → twelfths.',
  },
  {
    skillId: 'frac.add.unlike',
    title: 'CONVERT, THEN EASY',
    method: [
      'Scale each fraction onto the common denominator; the top rides the same factor as the bottom.',
      'Then it is the same-slices case, and that one is free.',
    ],
    example: '1/2 + 1/3 → 3/6 + 2/6 → 5/6.',
  },

  // --- percent ---
  {
    skillId: 'pct.of',
    title: 'TENTHS AND HALVES',
    method: [
      'Find 10% — slide the decimal — and build: 5% is half of it, 20% is double, 15% is one and a half.',
      'When the number fights back, reduce the percent to a fraction instead. 60% is 3/5.',
    ],
    example: '60% of 35 → 35÷5 is 7 → times 3 → 21.',
  },
  {
    skillId: 'pct.what',
    title: 'PART OVER WHOLE',
    method: [
      'Put the part over the whole. Reduce. Scale to a hundred.',
      'Reduce first — the scaling usually finishes itself.',
    ],
    example: '24 of 40 → 24/40 → 3/5 → 60%.',
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
