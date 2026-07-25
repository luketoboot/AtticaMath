/**
 * Factor Storm rules: splitting numbers by their factors.
 *
 * Type a factor of a rock and it splits into that factor and the quotient, so
 * 84 → 12 and 7. Primes cannot split; they are destroyed by naming themselves.
 * The board therefore *multiplies before it clears* — the Asteroids pressure
 * curve, except the fragments are a factor tree.
 *
 * Factorisation is the highest-leverage skill in the taxonomy: it is where the
 * times tables, exact division and later fractions all meet, and it is the one
 * thing the other modes cannot drill, because both of them ask for a single
 * computed answer rather than a decomposition.
 */
import type { FactorConfig } from '../config';
import type { Rng } from '../rng';

/** Every divisor of `n` strictly between 1 and n. */
export function properFactors(n: number): number[] {
  const found: number[] = [];
  for (let d = 2; d * d <= n; d++) {
    if (n % d !== 0) continue;
    found.push(d);
    const pair = n / d;
    if (pair !== d && pair !== n) found.push(pair);
  }
  return found.sort((a, b) => a - b);
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}

/**
 * Numbers the player may legally type at a rock: its proper factors, which
 * split it, plus the rock's own value, which destroys it. 1 is excluded — it
 * divides everything and would split nothing.
 */
export function legalShots(n: number): number[] {
  return [...properFactors(n), n];
}

/** The split closest to square, e.g. 84 → 12 × 7 rather than 84 → 2 × 42. */
export function balancedFactor(n: number): number | null {
  const factors = properFactors(n);
  if (factors.length === 0) return null;
  let best = factors[0]!;
  for (const d of factors) {
    if (Math.abs(d - n / d) < Math.abs(best - n / best)) best = d;
  }
  return best;
}

export type ShotKind =
  | { kind: 'split'; pieces: [number, number]; balanced: boolean }
  | { kind: 'destroy'; prime: boolean }
  | { kind: 'illegal' };

/** What typing `shot` at a rock of `value` does. */
export function resolveShot(value: number, shot: number): ShotKind {
  if (!Number.isInteger(shot) || shot < 2 || value % shot !== 0) return { kind: 'illegal' };
  if (shot === value) return { kind: 'destroy', prime: isPrime(value) };
  return {
    kind: 'split',
    pieces: [shot, value / shot],
    balanced: shot === balancedFactor(value),
  };
}

/**
 * True while `buffer` could still grow into a legal shot at this rock. The
 * cannon fires on an exact match only when nothing longer is still possible,
 * so a rock of 63 lets you reach 21 without 2 going off on the way.
 */
export function isViablePrefix(value: number, buffer: string): boolean {
  if (buffer === '') return true;
  return legalShots(value).some((s) => String(s).startsWith(buffer));
}

/** True when `buffer` is a legal shot and no longer shot starts with it. */
export function isCompleteShot(value: number, buffer: string): boolean {
  const shot = Number(buffer);
  if (!Number.isInteger(shot) || value % shot !== 0 || shot < 2) return false;
  return !legalShots(value).some((s) => s !== shot && String(s).startsWith(buffer));
}

/**
 * Score for one shot. Primes pay most — they are the tail of the board, the
 * part that cannot be broken down and has to be recognised — and a balanced
 * split pays a premium because finding a middle factor is the harder step.
 */
export function shotScore(value: number, outcome: ShotKind, cfg: FactorConfig): number {
  switch (outcome.kind) {
    case 'destroy':
      return Math.round(
        (cfg.destroyBase + value * cfg.scorePerValue) * (outcome.prime ? cfg.primeMultiplier : 1),
      );
    case 'split':
      return Math.round(
        (cfg.splitBase + value * cfg.scorePerValue) * (outcome.balanced ? cfg.balancedMultiplier : 1),
      );
    case 'illegal':
      return 0;
  }
}

/**
 * Build a rock value from the families the player is weakest on. Composites are
 * assembled by multiplying chosen factors, so a player shaky on 7s meets
 * 7-heavy numbers without ever being told that is what happened.
 */
export function composeRockValue(
  families: readonly number[],
  parts: number,
  cfg: FactorConfig,
  rng: Rng,
): number {
  const pool = families.length > 0 ? families : [2, 3, 4, 5];
  for (let attempt = 0; attempt < 20; attempt++) {
    let value = 1;
    for (let i = 0; i < parts; i++) value *= rng.pick([...pool]);
    if (value >= cfg.minRockValue && value <= cfg.maxRockValue) return value;
  }
  // Fall back to a two-factor product, which is always inside the range.
  return rng.pick([...pool]) * rng.pick([...pool]);
}
