import { digitAt } from './bonds';
import { layerAt, slotWidth, type ExerciseProblem } from './layers';

/**
 * A sum or a difference, column by column, as a quantity rather than a digit.
 *
 * Products and quotients get the area model: a rectangle is what multiplication
 * *is*, and the picture carries the whole distributive law. Addition has no area
 * to draw — but it does have the one thing the area model cannot show, which is
 * what happens when a column overflows. Ten ones become one ten. That exchange
 * is the entire content of carrying, and written as digits it is a small raised
 * 1 that appears from nowhere.
 *
 * So each place gets a frame of ten slots and the digits get poured into it.
 * When a column fills past ten, the ten standing in the frame are visibly one
 * group, and they leave together for the place above. Subtraction runs the same
 * exchange backwards: a column that cannot pay breaks a ten out of its
 * neighbour, and ten pips arrive to be spent.
 *
 * The chain has to be computed properly rather than column by column. `110 − 19`
 * borrows in the tens only because the ones already took one away — comparing
 * each column's own digits in isolation says the tens are fine, and they are
 * not. Same for carries: `68 + 34` carries out of the tens only on the strength
 * of the one that arrived from the ones.
 *
 * Pure. The scene decides how a pip looks; this decides how many there are.
 */

export type PlaceEvent = 'none' | 'carry' | 'borrow';

/** One place value's worth of the rung, read as counters on a table. */
export interface PlaceColumn {
  /** 0 for the ones, 1 for the tens. */
  place: number;
  /** The digit the top operand puts here, as this rung reads it. */
  top: number;
  /** The digit the bottom operand puts here. Always 0 above the carry column. */
  bottom: number;
  /** A sum: the pip handed up from the place below, 0 or 1. */
  carryIn: number;
  /** A difference: the ten this column had to break out for the place below. */
  lent: number;
  /** Pips standing here once everything has arrived and before anything leaves. */
  held: number;
  /** How many of them the subtrahend takes. Zero for a sum. */
  taken: number;
  /** The digit this column contributes to the rung's answer. */
  result: number;
  event: PlaceEvent;
  /** Whether the dial has this place in focus. */
  live: boolean;
  /**
   * True only for the column a sum's final carry opens. Neither operand puts
   * anything here, so it must not be drawn before the answer — a frame standing
   * empty above the number is the game announcing that this one carries.
   */
  openedByCarry: boolean;
}

/**
 * The rung's columns, highest place first.
 *
 * Empty for products and quotients, which are drawn as a rectangle instead.
 *
 * The operands are the *layer's*, not the problem's, so a rung that has had its
 * ones dropped genuinely holds nothing there — the frames empty out as the dial
 * turns and fill back in as it returns, which is the assembly the mode is about.
 *
 * A sum that overflows its widest operand earns one extra column on the left,
 * holding nothing but the carry. That column is the answer's leading digit, and
 * leaving it out would mean the pips on screen did not add up to the answer.
 */
export function placeColumnsFor(problem: ExerciseProblem, depth: number): PlaceColumn[] {
  if (problem.op !== 'add' && problem.op !== 'sub') return [];
  const layer = layerAt(problem, depth);
  const width = slotWidth(problem);
  const columns: PlaceColumn[] = [];

  // Right to left, the way it is worked by hand — each column needs to know
  // what the one below it did.
  let carry = 0;
  let owed = 0;
  for (let place = 0; place < width; place++) {
    const top = digitAt(layer.left, place);
    const bottom = digitAt(layer.right, place);

    if (problem.op === 'add') {
      const held = top + bottom + carry;
      const event: PlaceEvent = held >= 10 ? 'carry' : 'none';
      columns.push({
        place,
        top,
        bottom,
        carryIn: carry,
        lent: 0,
        held,
        taken: 0,
        result: held % 10,
        event,
        live: place >= depth,
        openedByCarry: false,
      });
      carry = held >= 10 ? 1 : 0;
      continue;
    }

    // What is left here after the place below broke a ten out of it. This can
    // go to −1 when the column was already empty, which is exactly the case
    // that has to borrow again — the cascade the naive reading misses.
    const have = top - owed;
    const short = have < bottom;
    const held = short ? have + 10 : have;
    columns.push({
      place,
      top,
      bottom,
      carryIn: 0,
      lent: owed,
      held,
      taken: bottom,
      result: held - bottom,
      event: short ? 'borrow' : 'none',
      live: place >= depth,
      openedByCarry: false,
    });
    owed = short ? 1 : 0;
  }

  if (problem.op === 'add' && carry === 1) {
    columns.push({
      place: width,
      top: 0,
      bottom: 0,
      carryIn: 1,
      lent: 0,
      held: 1,
      taken: 0,
      result: 1,
      event: 'none',
      live: true,
      openedByCarry: true,
    });
  }

  return columns.reverse();
}

/** The digits the columns spell out, highest place first. Useful in tests. */
export function resultDigits(columns: readonly PlaceColumn[]): number[] {
  return columns.map((c) => c.result);
}
