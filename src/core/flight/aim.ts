/**
 * Nose-first target selection for the free-flight modes.
 *
 * The lock goes to whatever sits closest to the ship's facing, not to
 * whatever drifts nearest: pointing the nose is the one aiming verb these
 * modes have, so the highlight has to answer the stick. Distance only breaks
 * near-ties in bearing — of two rocks down the same line, you want the one
 * you would hit first.
 *
 * Pure and framework-free, like the flight model it aims for.
 */

export interface AimBounds {
  width: number;
  height: number;
}

export interface AimCandidate {
  id: number;
  x: number;
  y: number;
}

const TAU = Math.PI * 2;

/**
 * Bearings within this of each other count as "down the same line", and the
 * nearer rock wins. About a degree — tighter than any deliberate aim.
 */
const SAME_LINE_RAD = 0.02;

export interface AimOptions {
  /**
   * A candidate this close to the nose takes the lock outright. Pointing
   * straight at something is not an ambiguous input, so nothing — neither
   * hysteresis nor a half-typed buffer — should argue with it.
   */
  snapRad: number;
  /**
   * Outside the snap cone, a challenger must beat the held lock's bearing by
   * this much. Damps the jitter of two rocks drifting either side of the nose.
   */
  hysteresisRad: number;
}

/**
 * Shortest signed delta from `from` to `to` on a wrapping axis. The field is
 * a torus, so a rock a step past the far edge is a step away, not a screen.
 */
export function wrappedDelta(from: number, to: number, span: number): number {
  const d = to - from;
  if (span <= 0) return d;
  return d - Math.round(d / span) * span;
}

/** Absolute difference between two angles, in [0, π]. */
export function angularGap(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

/**
 * Choose the candidate closest to the nose. `currentId` is whatever holds the
 * lock now: a challenger has to beat its bearing by `hysteresisRad` to steal
 * it, so two rocks straddling the nose do not strobe the highlight as
 * everything drifts. Pass null (or a departed id) and the best simply wins.
 *
 * Inside `snapRad` that damping is skipped entirely. Hysteresis exists to
 * ignore drift, and drift is not what puts a rock under your nose — so a held
 * lock that is merely a few degrees better must not outvote the thing the
 * player is openly pointing at.
 */
export function pickByNose(
  ship: { x: number; y: number; facing: number },
  candidates: readonly AimCandidate[],
  bounds: AimBounds,
  currentId: number | null,
  opts: AimOptions,
): number | null {
  let bestId: number | null = null;
  let bestGap = Infinity;
  let bestDist = Infinity;
  let currentGap: number | null = null;

  for (const c of candidates) {
    const dx = wrappedDelta(ship.x, c.x, bounds.width);
    const dy = wrappedDelta(ship.y, c.y, bounds.height);
    const gap = angularGap(Math.atan2(dy, dx), ship.facing);
    const dist = Math.hypot(dx, dy);
    if (c.id === currentId) currentGap = gap;

    const sameLine = Math.abs(gap - bestGap) <= SAME_LINE_RAD;
    if ((sameLine && dist < bestDist) || (!sameLine && gap < bestGap)) {
      bestId = c.id;
      bestGap = gap;
      bestDist = dist;
    }
  }

  if (bestId === null) return null;
  if (bestGap <= opts.snapRad) return bestId;
  if (currentId !== null && currentGap !== null && bestId !== currentId) {
    if (currentGap - bestGap < opts.hysteresisRad) return currentId;
  }
  return bestId;
}

/** True when the nose is openly pointed at this candidate. */
export function isDeadAhead(
  ship: { x: number; y: number; facing: number },
  candidate: AimCandidate,
  bounds: AimBounds,
  snapRad: number,
): boolean {
  const dx = wrappedDelta(ship.x, candidate.x, bounds.width);
  const dy = wrappedDelta(ship.y, candidate.y, bounds.height);
  return angularGap(Math.atan2(dy, dx), ship.facing) <= snapRad;
}
