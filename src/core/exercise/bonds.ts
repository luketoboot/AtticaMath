/**
 * Friends of five and friends of ten, for the rung in focus.
 *
 * Every technique in the Playbook spends number bonds — routing through ten,
 * overshooting and repaying, building a percentage off 10% all assume that
 * "7 wants 3" is instant rather than counted. The Operator says so in words.
 * This turns the words into a frame you can look at: five or ten boxes, the
 * digit you have already filled, and the gap the other digit is about to close.
 *
 * The frame is asked for, never forced. It reads the two digits at the lowest
 * live place of the rung — the ones at depth 0, the tens at depth 1 — so the
 * help is always about the column actually being added, and it moves up the
 * number as the ladder does.
 *
 * Pure: this decides what the frame says, the scene decides how it looks.
 */

export type BondAnchor = 5 | 10;

export interface BondHint {
  /** Five-frame or ten-frame. */
  anchor: BondAnchor;
  /** Pips already in the frame — the digit being filled up. */
  from: number;
  /** Pips the partner digit puts into the frame. */
  given: number;
  /** Pips the partner has left over once the frame is full. */
  leftover: number;
  /** What `from` needs to reach the anchor. */
  wants: number;
  /** Where this column lands: the sum, or the gap for a subtraction. */
  total: number;
  /** One line, in the Operator's voice. */
  reading: string;
}

export type FrameCell = 'from' | 'given' | 'empty';

/** Digit at a place: digitAt(679, 1) === 7. */
export function digitAt(n: number, place: number): number {
  return Math.floor(Math.abs(n) / 10 ** place) % 10;
}

/**
 * The bond worth showing for a rung, or undefined when the column is empty and
 * there is nothing to say.
 *
 * `depth` is the rung's focus depth, which is also the index of its lowest live
 * place — the column the player is actually working.
 */
export function bondHint(
  a: number,
  b: number,
  op: 'add' | 'sub',
  depth: number,
): BondHint | undefined {
  const x = digitAt(a, depth);
  const y = digitAt(b, depth);
  if (x === 0 && y === 0) return undefined;
  return op === 'add' ? addBond(x, y) : subBond(x, y);
}

function addBond(x: number, y: number): BondHint {
  const total = x + y;
  // A pair that cannot reach ten is a five-frame question; anything that can is
  // a ten-frame one. Showing 2 + 3 in ten boxes hides the very structure the
  // frame exists to make visible.
  const anchor: BondAnchor = total <= 5 && x <= 5 ? 5 : 10;
  const wants = anchor - x;
  const given = Math.min(y, Math.max(0, wants));
  const leftover = y - given;

  // The anchor is spoken, never printed as a numeral: every tip in the deck
  // says "route through ten", and a frame that said "10" would read as a
  // different idea from the one the Operator taught.
  const name = anchor === 10 ? 'ten' : 'five';
  let reading: string;
  if (y === 0) {
    reading = `${x} wants ${wants} to make ${name}.`;
  } else if (leftover === 0 && x + given === anchor) {
    reading = `${x} and ${y} make ${name}.`;
  } else if (leftover > 0) {
    const Name = anchor === 10 ? 'Ten' : 'Five';
    reading = `${x} wants ${given}. Split ${y} into ${given} and ${leftover}. ${Name}, with ${leftover} over → ${total}.`;
  } else {
    reading = `${x} and ${y} make ${total}. ${anchor - total} short of ${name}.`;
  }
  return { anchor, from: x, given, leftover, wants, total, reading };
}

/**
 * Subtraction reads as a climb, not a removal: the frame fills from the
 * subtrahend's digit up to the minuend's, and the gap is the answer. When the
 * column has to borrow, the climb goes through ten and the rest lands outside
 * the frame — which is the same picture bridging ten draws for addition.
 */
function subBond(x: number, y: number): BondHint {
  if (x >= y) {
    const anchor: BondAnchor = x <= 5 ? 5 : 10;
    const given = x - y;
    const reading =
      given === 0 ? `Both ${y}. This place is already clear.` : `${y} climbs to ${x} in ${given}.`;
    return { anchor, from: y, given, leftover: 0, wants: anchor - y, total: given, reading };
  }
  const given = 10 - y;
  return {
    anchor: 10,
    from: y,
    given,
    leftover: x,
    wants: given,
    total: given + x,
    // A minuend digit of zero means the climb stops at ten; saying "then 0
    // more" would be the frame reading out a step that does not happen.
    reading:
      x === 0
        ? `${y} wants ${given} to make ten → ${given}.`
        : `${y} wants ${given} to make ten, then ${x} more → ${given + x}.`,
  };
}

/** The frame as cells, left to right, top row first. */
export function frameCells(hint: BondHint): FrameCell[] {
  return Array.from({ length: hint.anchor }, (_, i) =>
    i < hint.from ? 'from' : i < hint.from + hint.given ? 'given' : 'empty',
  );
}
