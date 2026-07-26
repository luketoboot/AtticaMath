import { describe, expect, it } from 'vitest';
import { angularGap, isDeadAhead, pickByNose, wrappedDelta } from '../src/core/flight/aim';

const BOUNDS = { width: 1280, height: 720 };
const deg = (d: number): number => (d * Math.PI) / 180;
const OPTS = { snapRad: deg(14), hysteresisRad: deg(3) };
/** Snap disabled, so the hysteresis rules can be tested on their own. */
const NO_SNAP = { snapRad: 0, hysteresisRad: deg(6) };

/** Ship at centre, nose along +x unless a test says otherwise. */
function ship(facing = 0): { x: number; y: number; facing: number } {
  return { x: 640, y: 360, facing };
}

describe('wrappedDelta', () => {
  it('goes the short way around the torus', () => {
    expect(wrappedDelta(1270, 10, 1280)).toBe(20); // through the seam, not -1260
    expect(wrappedDelta(10, 1270, 1280)).toBe(-20);
    expect(wrappedDelta(100, 400, 1280)).toBe(300); // plain when plain is shorter
  });

  it('passes through untouched on a non-wrapping axis', () => {
    expect(wrappedDelta(0, 900, 0)).toBe(900);
  });
});

describe('angularGap', () => {
  it('is symmetric and never reflex', () => {
    expect(angularGap(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
    expect(angularGap(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(angularGap(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2, 9); // across zero
  });
});

describe('pickByNose', () => {
  it('locks by bearing, not by distance', () => {
    const picked = pickByNose(
      ship(0),
      [
        { id: 1, x: 700, y: 300 }, // near, ~45° off the nose
        { id: 2, x: 1200, y: 365 }, // far, dead ahead
      ],
      BOUNDS,
      null,
      OPTS,
    );
    expect(picked).toBe(2);
  });

  it('sweeps with the nose as the ship turns', () => {
    const rocks = [
      { id: 1, x: 640, y: 100 }, // above
      { id: 2, x: 640, y: 600 }, // below
    ];
    expect(pickByNose(ship(-Math.PI / 2), rocks, BOUNDS, null, OPTS)).toBe(1);
    expect(pickByNose(ship(Math.PI / 2), rocks, BOUNDS, null, OPTS)).toBe(2);
  });

  it('sees through the wrap seam', () => {
    // Nose pointed at the right edge; the rock just past it (wrapped to the
    // far left) is dead ahead, the unwrapped one is behind the ship.
    const picked = pickByNose(
      { x: 1250, y: 360, facing: 0 },
      [
        { id: 1, x: 30, y: 360 }, // 60px ahead through the seam
        { id: 2, x: 1000, y: 360 }, // 250px directly behind
      ],
      BOUNDS,
      null,
      OPTS,
    );
    expect(picked).toBe(1);
  });

  it('prefers the nearer of two rocks down the same line', () => {
    const picked = pickByNose(
      ship(0),
      [
        { id: 1, x: 1200, y: 360 },
        { id: 2, x: 800, y: 360 },
      ],
      BOUNDS,
      null,
      OPTS,
    );
    expect(picked).toBe(2);
  });

  it('keeps the lock against drift-jitter outside the snap cone', () => {
    // Both sit ~35° off, a hair apart: exactly the strobing hysteresis exists
    // for, and far enough out that the snap cone has no say.
    const rocks = [
      { id: 1, x: 1000, y: 610 },
      { id: 2, x: 1000, y: 600 },
    ];
    expect(pickByNose(ship(0), rocks, BOUNDS, 1, NO_SNAP)).toBe(1);
  });

  it('yields the lock once the challenger clears the wedge', () => {
    const rocks = [
      { id: 1, x: 1140, y: 500 }, // ~15° off
      { id: 2, x: 1140, y: 365 }, // dead ahead
    ];
    expect(pickByNose(ship(0), rocks, BOUNDS, 1, NO_SNAP)).toBe(2);
  });

  it('REGRESSION: pointing straight at a rock beats a barely-better hold', () => {
    // The complaint this encodes: rock 1 held the lock only ~5° better than
    // the rock the player had swung the nose onto, and 5° lost to a 6° wedge,
    // so aiming directly at something did nothing until the drift moved on.
    const rocks = [
      { id: 1, x: 1140, y: 288 }, // ~8.5° above the nose — the incumbent
      { id: 2, x: 1140, y: 386 }, // ~2.6° below — what the player is aiming at
    ];
    expect(pickByNose(ship(0), rocks, BOUNDS, 1, NO_SNAP)).toBe(1); // old feel
    expect(pickByNose(ship(0), rocks, BOUNDS, 1, OPTS)).toBe(2); // snap wins
  });

  it('snap only fires for the best bearing, never a merely-close one', () => {
    const rocks = [
      { id: 1, x: 1140, y: 300 }, // ~7° off, inside the cone
      { id: 2, x: 1140, y: 361 }, // dead ahead, better
    ];
    expect(pickByNose(ship(0), rocks, BOUNDS, 1, OPTS)).toBe(2);
  });

  it('picks fresh when the held lock is gone, hysteresis or not', () => {
    const picked = pickByNose(ship(0), [{ id: 7, x: 300, y: 360 }], BOUNDS, 99, OPTS);
    expect(picked).toBe(7); // behind the ship, but it is all there is
  });

  it('returns null on an empty field', () => {
    expect(pickByNose(ship(0), [], BOUNDS, 3, OPTS)).toBeNull();
  });
});

describe('isDeadAhead', () => {
  it('is true inside the cone and false outside it', () => {
    expect(isDeadAhead(ship(0), { id: 1, x: 1000, y: 362 }, BOUNDS, deg(14))).toBe(true);
    expect(isDeadAhead(ship(0), { id: 1, x: 1000, y: 500 }, BOUNDS, deg(14))).toBe(false);
  });

  it('is false for something directly behind', () => {
    expect(isDeadAhead(ship(0), { id: 1, x: 300, y: 360 }, BOUNDS, deg(14))).toBe(false);
  });

  it('reads through the wrap seam, like the picker does', () => {
    const atEdge = { x: 1250, y: 360, facing: 0 };
    expect(isDeadAhead(atEdge, { id: 1, x: 30, y: 360 }, BOUNDS, deg(14))).toBe(true);
  });
});
