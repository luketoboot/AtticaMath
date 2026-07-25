/**
 * Collapse targeting rules.
 *
 * Two guns, two token types, and one held charge. Shooting a token with its
 * own gun arms it; shooting the counterpart with the other gun resolves the
 * pair. Both directions work — arm a fraction and hunt its percentage, or arm
 * a percentage and hunt a fraction that equals it.
 *
 * Kept pure so the rules can be tested without a renderer: the scene decides
 * what a hit looks like, this decides what a hit means.
 */

export type GunKind = 'fraction' | 'percent';

export interface TokenRef {
  id: number;
  kind: GunKind;
  /** The value both types share: a fraction's percentage, or the percent itself. */
  percent: number;
}

export type ShotOutcome =
  /** Gun does not match the token type — the shot simply does not bite. */
  | { result: 'wrongGun' }
  /** Nothing was held; this token is now armed. */
  | { result: 'armed' }
  /** Something of the same type was already held; the charge moves here. */
  | { result: 'rearmed' }
  /** The counterpart matched. Both tokens collapse. */
  | { result: 'collapse' }
  /** Right gun, wrong value — the player misread the equivalence. */
  | { result: 'mismatch' };

/** Pool values are terminating decimals; this only absorbs float noise. */
const EPSILON = 1e-6;

export function samePercent(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

export function gunFor(kind: GunKind): GunKind {
  return kind;
}

/** The gun that fires at the other half of a pair. */
export function opposite(kind: GunKind): GunKind {
  return kind === 'fraction' ? 'percent' : 'fraction';
}

/**
 * Resolve one hit. `held` is the currently armed token, or null.
 *
 * Wrong-gun is checked first and costs nothing: firing the fraction gun at a
 * percentage is a fumble, not a maths error, and should not be punished like
 * one.
 */
export function resolveShot(
  held: TokenRef | null,
  target: TokenRef,
  gun: GunKind,
): ShotOutcome {
  if (gun !== target.kind) return { result: 'wrongGun' };
  if (held === null) return { result: 'armed' };
  if (held.id === target.id) return { result: 'rearmed' };
  if (held.kind === target.kind) return { result: 'rearmed' };
  return samePercent(held.percent, target.percent)
    ? { result: 'collapse' }
    : { result: 'mismatch' };
}
