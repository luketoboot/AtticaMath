/**
 * Typing a number you found, rather than pointing at where it sits.
 *
 * The first version of this mode read digits as positions — a three-by-three
 * has the shape of a numpad, so 7 meant top-left. It plays fast and it is
 * wrong. Every other mode in this game asks the player to type the *value*, so
 * a player who finds a 20 types "20", and in the positional scheme that was a
 * 2 (a wrong call at some unrelated square) followed by a 0 (silently dropped).
 * Nothing on screen explained the difference, and the game charged for it.
 *
 * So values it is. The complication values bring is that one can be the start
 * of another: type "2" in a cell holding both 2 and 20 and there is no way to
 * know which is meant. Firing on the first exact match would make the 20
 * unreachable, so a buffer that could still grow into a longer number on the
 * board waits, and ENTER is there for the player who meant the short one.
 *
 * Pure: the scene owns the buffer, this owns what a buffer means.
 */

export type BufferMatch =
  /** Exactly one number can be meant. Call it. */
  | { kind: 'fire'; index: number }
  /** More than one number still starts this way; wait for another digit. */
  | { kind: 'wait'; candidates: readonly number[] }
  /** No number in this cell starts this way. A dead end, and it buzzes. */
  | { kind: 'dead' };

/** Indices of every number whose written form starts with `buffer`. */
export function candidates(values: readonly number[], buffer: string): number[] {
  if (buffer === '') return values.map((_, i) => i);
  return values.reduce<number[]>((found, value, i) => {
    if (String(value).startsWith(buffer)) found.push(i);
    return found;
  }, []);
}

/**
 * What the buffer means so far.
 *
 * Duplicates settle to one answer rather than waiting forever: a cell holds two
 * tens only when ten is half of its doubled pair, and calling either of them is
 * the same claim with the same outcome.
 */
export function matchBuffer(values: readonly number[], buffer: string): BufferMatch {
  const found = candidates(values, buffer);
  if (buffer === '') return { kind: 'wait', candidates: found };
  if (found.length === 0) return { kind: 'dead' };

  // Firing early on a unique prefix is tempting and wrong. A player who found a
  // 20 types both digits; if the 2 alone had already fired, the 0 arrives with
  // nothing to mean and buzzes at someone who did exactly the right thing. So a
  // call needs the whole number, which is also what every other mode asks for.
  const exact = exactIndex(values, buffer);
  const extendable = found.some((i) => String(values[i]).length > buffer.length);
  if (exact !== undefined && !extendable) return { kind: 'fire', index: exact };
  return { kind: 'wait', candidates: found };
}

/**
 * The number written exactly like this, if any.
 *
 * Committing by hand is the escape hatch from the ambiguity above: in a cell
 * holding 2 and 20, "2" waits forever unless the player can say they meant it.
 */
export function exactIndex(values: readonly number[], buffer: string): number | undefined {
  if (buffer === '') return undefined;
  const at = values.findIndex((value) => String(value) === buffer);
  return at === -1 ? undefined : at;
}
