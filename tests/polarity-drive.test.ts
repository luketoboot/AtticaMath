import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newDriveState, stepDrive, wasReachable, type DriveInput, type DriveState } from '../src/core/polarity/drive';

const cfg = {
  speed: CONFIG.polarity.shipSpeed,
  radius: CONFIG.polarity.shipRadius,
  smoothing: CONFIG.polarity.moveSmoothing,
};
const bounds = { width: 1280, height: 720 };
const still: DriveInput = { up: false, down: false, left: false, right: false };
const at = (x: number, y: number): DriveState => ({ x, y, vx: 0, vy: 0 });

/** Run the drive for a while at a fixed step, as the scene would. */
function hold(state: DriveState, input: DriveInput, seconds: number, step = 1 / 60): DriveState {
  let s = state;
  for (let t = 0; t < seconds - 1e-9; t += step) s = stepDrive(s, input, cfg, step, bounds);
  return s;
}

describe('stepDrive', () => {
  it('eases up to the configured speed rather than snapping to it', () => {
    // The jerk this replaced: velocity going 0 to full in a single frame at
    // 780px/s reads as the hull teleporting rather than travelling.
    const one = stepDrive(at(300, 300), { ...still, right: true }, cfg, 1 / 60, bounds);
    expect(one.vx).toBeGreaterThan(0);
    expect(one.vx).toBeLessThan(cfg.speed * 0.4);

    const settled = hold(at(300, 300), { ...still, right: true }, 0.5);
    expect(settled.vx).toBeGreaterThan(cfg.speed * 0.99);
  });

  it('is responsive — most of the speed inside a tenth of a second', () => {
    const quick = hold(at(300, 300), { ...still, right: true }, 0.1);
    expect(quick.vx).toBeGreaterThan(cfg.speed * 0.7);
  });

  it('glides briefly on release instead of stopping dead', () => {
    const moving = hold(at(300, 300), { ...still, right: true }, 0.5);
    const coasted = hold(moving, still, 0.5);
    const glide = coasted.x - moving.x;
    expect(glide).toBeGreaterThan(0);
    // Short enough that a threaded gap stays threaded — this is easing, not
    // the long momentum the Newtonian modes fly on.
    expect(glide).toBeLessThan(90);
    expect(Math.abs(coasted.vx)).toBeLessThan(cfg.speed * 0.02);
  });

  it('does not make diagonals faster', () => {
    // Otherwise holding two keys is a free 41% along the most useful heading
    // there is, and every good player travels at forty-five degrees all run.
    const straight = hold(at(300, 300), { ...still, right: true }, 0.4);
    const diag = hold(at(300, 300), { ...still, right: true, down: true }, 0.4);
    expect(Math.hypot(diag.vx, diag.vy)).toBeCloseTo(Math.abs(straight.vx), 3);
  });

  it('cancels opposing keys rather than picking one', () => {
    const s = hold(at(400, 400), { ...still, left: true, right: true }, 0.4);
    expect(s.x).toBeCloseTo(400, 6);
    expect(s.vx).toBeCloseTo(0, 6);
  });

  it('holds still when nothing is held', () => {
    const s = hold(at(400, 400), still, 0.5);
    expect(s.x).toBe(400);
    expect(s.y).toBe(400);
  });

  it('clamps at the walls and never wraps', () => {
    // A ship that reappears on the far side has teleported out of a pattern
    // that was authored to be survivable where it stood.
    let s = hold(at(40, 40), { ...still, left: true, up: true }, 3);
    expect(s.x).toBe(cfg.radius);
    expect(s.y).toBe(cfg.radius);

    s = hold(s, { ...still, right: true, down: true }, 5);
    expect(s.x).toBe(bounds.width - cfg.radius);
    expect(s.y).toBe(bounds.height - cfg.radius);
  });

  it('sheds the velocity it spent pressed against a wall', () => {
    // Otherwise it banks up there and the ship lurches when the player turns
    // around, which is the exact opposite of what the smoothing is for.
    const pinned = hold(at(40, 300), { ...still, left: true }, 2);
    expect(pinned.x).toBe(cfg.radius);
    expect(pinned.vx).toBe(0);
  });

  it('moves the same distance however the frames are chopped up', () => {
    // 1 - exp(-dt/tau) composes exactly, so a machine dropping frames flies the
    // same ship as one that is not.
    const coarse = hold(at(200, 200), { ...still, right: true }, 0.6, 1 / 20);
    const fine = hold(at(200, 200), { ...still, right: true }, 0.6, 1 / 240);
    expect(coarse.x).toBeCloseTo(fine.x, 0);
    expect(coarse.vx).toBeCloseTo(fine.vx, 3);
  });

  it('starts the ship low and centred, at rest', () => {
    const s = newDriveState(bounds);
    expect(s.x).toBe(bounds.width / 2);
    expect(s.y).toBeGreaterThan(bounds.height / 2);
    expect(s.vx).toBe(0);
    expect(s.vy).toBe(0);
  });

  it('crosses the arena in about the time a bullet hell should allow', () => {
    expect(bounds.width / cfg.speed).toBeLessThan(2);
    // A short tap still shifts the ship further than it is wide.
    const tapped = hold(at(300, 300), { ...still, right: true }, 0.14);
    expect(tapped.x - 300).toBeGreaterThan(CONFIG.polarity.shipRadius * 2);
  });

  it('keeps the hitbox far smaller than the hull', () => {
    // The genre's oldest bargain: draw the fighter, hit the pilot. A ship drawn
    // at its own hitbox is either too small to read or too fat to thread a
    // pattern with, and the core is painted on so the gap is never a mystery.
    expect(CONFIG.polarity.shipHitRadius).toBeLessThan(CONFIG.polarity.shipRadius / 2);
    expect(CONFIG.polarity.shipHitRadius).toBeGreaterThan(4);
  });
});

describe('wasReachable', () => {
  it('counts a bullet that crossed nearby', () => {
    expect(wasReachable(30, 3, cfg, CONFIG.polarity.graceRadius)).toBe(true);
  });

  it('excuses one that crossed the far side in an instant', () => {
    expect(wasReachable(1200, 0.1, cfg, CONFIG.polarity.graceRadius)).toBe(false);
  });

  it('counts the same bullet when there was time to get there', () => {
    expect(wasReachable(1200, 5, cfg, CONFIG.polarity.graceRadius)).toBe(true);
  });

  it('is generous at zero distance regardless of time', () => {
    expect(wasReachable(0, 0, cfg, CONFIG.polarity.graceRadius)).toBe(true);
  });
});
