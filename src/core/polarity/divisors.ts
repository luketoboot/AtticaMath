/**
 * The divisor pair a POLARITY wave is declared with, and what a number becomes
 * under it.
 *
 * Two divisors carve every number into four kinds: the multiples of each, the
 * common multiples that belong to both, and everything left over. The first two
 * are the polarities. The third is the reason the mode exists — a common
 * multiple is safe whichever state you are in, so the multiples of the lowest
 * common multiple are a lane through the field, and the player learns to find
 * them at speed rather than to compute them. The fourth is lethal either way,
 * and is what keeps a hand on the movement keys.
 *
 * Pure.
 */
import { gcd } from '../collapse/equiv';
import { getSkill, type SkillId } from '../skills/taxonomy';
import type { MoteClass } from './signal';

/**
 * Divisors a wave can be declared with.
 *
 * Single digits only, because in POLARITY the divisor *is* the trigger: the key
 * you press to fire is the number you are wearing. A two-digit divisor would
 * need two keystrokes to shoot, which is not a trigger, so ten, eleven and
 * twelve are out of this mode. `div.by.11` is untouched everywhere else — its
 * generator recipe, the Playbook drill, the placement sweep and its Brain Scan
 * row all still work; it simply stops being trained here.
 *
 * Two is not in the pool at all. "Is it even" is the fastest read in
 * arithmetic and the one every player already has — it is the surface heuristic
 * this mode is built to defeat, so a wave declared on it would be a wave with
 * half the thinking removed. Five stays, because the last-digit check is nearly
 * as free and that makes it a useful gentle half for an opening pair, but it
 * rates nothing for the same reason.
 */
export const DIVISORS: readonly number[] = [3, 4, 5, 6, 7, 8, 9];

/** Settled by glancing at the last digit. Playable, never rated. */
export const UNRATED_DIVISORS: readonly number[] = [5];

/**
 * The recognition skills a divisor exercises.
 *
 * Composite divisors credit the methods they are actually made of rather than
 * getting a row of their own: six and nine are the digit-sum check with a
 * parity or a second pass on top, and eight is filed under fours because the
 * move is the same one — halve what the hundreds leave behind — run once more.
 */
export function skillIdsFor(divisor: number): readonly SkillId[] {
  switch (divisor) {
    case 3:
    case 6:
    case 9:
      return ['div.by.3'];
    case 4:
    case 8:
      return ['div.by.4'];
    case 7:
      return ['div.by.7'];
    default:
      return [];
  }
}

export function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/**
 * Whether two divisors make a wave.
 *
 * If one divides the other there is no "other only" class at all — every
 * multiple of four is already a multiple of two — so a third of the field
 * cannot be filled and half the mode disappears. The pair also has to be
 * distinct, and both have to be divisors the game deals.
 */
export function isLegalPair(a: number, b: number): boolean {
  if (a === b) return false;
  if (!DIVISORS.includes(a) || !DIVISORS.includes(b)) return false;
  return a % b !== 0 && b % a !== 0;
}

export function legalPairs(): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (let i = 0; i < DIVISORS.length; i++) {
    for (let j = i + 1; j < DIVISORS.length; j++) {
      const a = DIVISORS[i]!;
      const b = DIVISORS[j]!;
      if (isLegalPair(a, b)) out.push([a, b]);
    }
  }
  return out;
}

/** What a value is, under a pair. Exactly one of the four, always. */
export function classOf(value: number, a: number, b: number): MoteClass {
  const divA = value % a === 0;
  const divB = value % b === 0;
  if (divA && divB) return 'bridge';
  if (divA) return 'aOnly';
  if (divB) return 'bOnly';
  return 'neither';
}

/** Every value in [lo, hi] of a given class. */
export function valuesOfClass(cls: MoteClass, a: number, b: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) if (classOf(v, a, b) === cls) out.push(v);
  return out;
}

/** Distance to the nearest multiple of d. Zero when the value is one. */
export function splitOf(value: number, d: number): number {
  const r = value % d;
  return Math.min(r, d - r);
}

/**
 * Whether a value's membership survives the two checks a player makes without
 * thinking: is it even, and does it end in a nought or a five.
 *
 * Under load, players fall back on exactly these, and the fallback grows as the
 * items get harder — so a pool that lets them work is a pool that trains the
 * shortcut and then measures it. An odd number is not a multiple of four and
 * nobody had to know anything to say so; that item teaches nothing and is worth
 * nothing as evidence.
 */
export function isHeuristicProof(value: number, d: number): boolean {
  if (d % 2 === 0 && value % 2 !== 0) return false;
  if (d % 5 === 0 && value % 5 !== 0) return false;
  return true;
}

/**
 * How hard one mote is, on the rating scale.
 *
 * Size barely matters here and the split does: 85 is a much harder thing to
 * reject for the sevens than 60 is, because it sits one step off a multiple and
 * the eye keeps wanting to round it. An item the parity check already answered
 * is discounted below its own skill's base, because it is not really an item.
 */
export function difficultyFor(divisor: number, value: number): number {
  const ids = skillIdsFor(divisor);
  const base = ids.length === 0
    ? 300 // the last-digit divisors, which rate nothing but still have a pace
    : Math.max(...ids.map((id) => getSkill(id).baseDifficulty));

  const split = splitOf(value, divisor);
  // A multiple is the plain form of its own skill; a near miss is the trap.
  const reach = Math.max(1, Math.floor(divisor / 2));
  const nearness = split === 0 ? 0 : Math.round((1 - (split - 1) / reach) * 80);
  const proof = isHeuristicProof(value, divisor) ? 50 : -110;
  const size = Math.max(0, String(value).length - 2) * 45;

  return Math.max(100, base + nearness + proof + size);
}
