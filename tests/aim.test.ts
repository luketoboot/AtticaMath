import { describe, expect, it } from 'vitest';
import { angularGap, pickByNose, wrappedDelta } from '../src/core/flight/aim';

const BOUNDS = { width: 1280, height: 720 };
const HYST = (6 * Math.PI) / 180;

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
      HYST,
    );
    expect(picked).toBe(2);
  });

  it('sweeps with the nose as the ship turns', () => {
    const rocks = [
      { id: 1, x: 640, y: 100 }, // above
      { id: 2, x: 640, y: 600 }, // below
    ];
    expect(pickByNose(ship(-Math.PI / 2), rocks, BOUNDS, null, HYST)).toBe(1);
    expect(pickByNose(ship(Math.PI / 2), rocks, BOUNDS, null, HYST)).toBe(2);
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
      HYST,
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
      HYST,
    );
    expect(picked).toBe(2);
  });

  it('keeps the lock against a challenger inside the hysteresis wedge', () => {
    const rocks = [
      { id: 1, x: 1140, y: 380 }, // ~2.3° below the nose line
      { id: 2, x: 1140, y: 340 }, // ~2.3° above — a hair better at times
    ];
    // Rock 1 holds the lock; rock 2's edge is nowhere near 6°, so no steal.
    expect(pickByNose(ship(0.01), rocks, BOUNDS, 1, HYST)).toBe(1);
  });

  it('yields the lock once the challenger clears the wedge', () => {
    const rocks = [
      { id: 1, x: 1140, y: 500 }, // ~15° off
      { id: 2, x: 1140, y: 365 }, // dead ahead
    ];
    expect(pickByNose(ship(0), rocks, BOUNDS, 1, HYST)).toBe(2);
  });

  it('picks fresh when the held lock is gone, hysteresis or not', () => {
    const picked = pickByNose(ship(0), [{ id: 7, x: 300, y: 360 }], BOUNDS, 99, HYST);
    expect(picked).toBe(7); // behind the ship, but it is all there is
  });

  it('returns null on an empty field', () => {
    expect(pickByNose(ship(0), [], BOUNDS, 3, HYST)).toBeNull();
  });
});
