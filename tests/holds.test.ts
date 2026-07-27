import { describe, expect, it } from 'vitest';
import {
  isHeld,
  NO_HOLDS,
  press,
  release,
  releaseAll,
  releasePointer,
} from '../src/core/input/holds';

describe('on-screen button holds', () => {
  it('holds a control while its finger is down', () => {
    const held = press(NO_HOLDS, 'thrust', 1);
    expect(isHeld(held, 'thrust')).toBe(true);
    expect(isHeld(release(held, 'thrust', 1), 'thrust')).toBe(false);
  });

  it('flies and fires at the same time', () => {
    // The whole reason this is not a single "pressed" field.
    let held = press(NO_HOLDS, 'thrust', 1);
    held = press(held, 'fire', 2);
    expect(isHeld(held, 'thrust')).toBe(true);
    expect(isHeld(held, 'fire')).toBe(true);
    held = releasePointer(held, 2);
    expect(isHeld(held, 'thrust')).toBe(true);
    expect(isHeld(held, 'fire')).toBe(false);
  });

  it('keeps a control down while a second finger is still on it', () => {
    let held = press(press(NO_HOLDS, 'thrust', 1), 'thrust', 2);
    held = releasePointer(held, 1);
    expect(isHeld(held, 'thrust')).toBe(true);
    held = releasePointer(held, 2);
    expect(isHeld(held, 'thrust')).toBe(false);
  });

  it('releases a control whose finger lifted somewhere else entirely', () => {
    // A finger that slides off a button and lifts over open space never sends
    // that button a release. Without the catch-all the ship thrusts forever.
    const held = press(NO_HOLDS, 'thrust', 3);
    expect(isHeld(releasePointer(held, 3), 'thrust')).toBe(false);
  });

  it('ignores a release from a finger that was never on the control', () => {
    const held = press(NO_HOLDS, 'thrust', 1);
    expect(release(held, 'thrust', 9)).toBe(held);
    expect(releasePointer(held, 9)).toBe(held);
  });

  it('treats a repeated press from the same finger as one hold', () => {
    const once = press(NO_HOLDS, 'thrust', 1);
    const twice = press(once, 'thrust', 1);
    expect(twice).toBe(once);
    expect(isHeld(release(twice, 'thrust', 1), 'thrust')).toBe(false);
  });

  it('forgets released controls rather than keeping empty entries', () => {
    const held = release(press(NO_HOLDS, 'thrust', 1), 'thrust', 1);
    expect(Object.keys(held)).toEqual([]);
  });

  it('drops everything when focus is lost', () => {
    const held = press(press(NO_HOLDS, 'thrust', 1), 'left', 2);
    expect(Object.keys(releaseAll())).toEqual([]);
    expect(isHeld(releaseAll(), 'thrust')).toBe(false);
    expect(isHeld(held, 'thrust')).toBe(true);
  });

  it('never mutates what it was given', () => {
    const start = press(NO_HOLDS, 'thrust', 1);
    const snapshot = JSON.stringify(start);
    press(start, 'fire', 2);
    release(start, 'thrust', 1);
    releasePointer(start, 1);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
