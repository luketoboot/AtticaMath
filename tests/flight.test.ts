import { describe, expect, it } from 'vitest';
import {
  newFlightState,
  speedOf,
  stepFlight,
  withVelocity,
  wrap,
  type FlightConfig,
  type FlightInput,
} from '../src/core/flight/newtonian';

const CFG: FlightConfig = {
  rotationSpeedDeg: 180,
  thrustAccel: 100,
  reverseScale: 0.5,
  drag: 0,
  maxSpeed: 1000,
  shipRadius: 18,
};

const BOUNDS = { width: 800, height: 600 };
const IDLE: FlightInput = { thrust: false, reverse: false, turnLeft: false, turnRight: false };

/** Facing 0 = +x (right). Start centred and pointing right unless stated. */
function ship(): ReturnType<typeof newFlightState> {
  return newFlightState(400, 300, 0);
}

describe('wrap', () => {
  it('wraps in both directions', () => {
    expect(wrap(10, 100)).toBe(10);
    expect(wrap(105, 100)).toBe(5);
    expect(wrap(-5, 100)).toBe(95);
  });
});

describe('turning', () => {
  it('rotates at the configured rate and does not move the ship', () => {
    const before = ship();
    const after = stepFlight(before, { ...IDLE, turnRight: true }, CFG, 1, BOUNDS);
    expect(after.facing).toBeCloseTo(Math.PI, 6); // 180 deg/s for 1s
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(speedOf(after)).toBe(0);
  });

  it('turns the other way and wraps below zero', () => {
    const after = stepFlight(ship(), { ...IDLE, turnLeft: true }, CFG, 0.5, BOUNDS);
    expect(after.facing).toBeCloseTo(Math.PI * 2 - Math.PI / 2, 6);
  });

  it('opposing turns cancel', () => {
    const after = stepFlight(ship(), { ...IDLE, turnLeft: true, turnRight: true }, CFG, 1, BOUNDS);
    expect(after.facing).toBeCloseTo(0, 6);
  });
});

describe('thrust', () => {
  it('accelerates along the facing, not along the current velocity', () => {
    // Pointing right, drifting up: thrust must add +x only.
    const drifting = { ...ship(), vy: -50 };
    const after = stepFlight(drifting, { ...IDLE, thrust: true }, CFG, 1, BOUNDS);
    expect(after.vx).toBeCloseTo(100, 6);
    expect(after.vy).toBeCloseTo(-50, 6);
  });

  it('reverse is weaker than forward and pushes backwards', () => {
    const after = stepFlight(ship(), { ...IDLE, reverse: true }, CFG, 1, BOUNDS);
    expect(after.vx).toBeCloseTo(-50, 6);
  });

  it('thrust and reverse together cancel', () => {
    const after = stepFlight(ship(), { ...IDLE, thrust: true, reverse: true }, CFG, 1, BOUNDS);
    expect(speedOf(after)).toBeCloseTo(50, 6); // 100 forward - 50 back
  });

  it('turning then thrusting sends the ship the new way', () => {
    let s = ship();
    // Quarter turn right => facing +y (screen down).
    s = stepFlight(s, { ...IDLE, turnRight: true }, CFG, 0.5, BOUNDS);
    expect(s.facing).toBeCloseTo(Math.PI / 2, 6);
    s = stepFlight(s, { ...IDLE, thrust: true }, CFG, 1, BOUNDS);
    expect(s.vx).toBeCloseTo(0, 6);
    expect(s.vy).toBeCloseTo(100, 6);
  });
});

describe('newtonian coasting', () => {
  it('keeps velocity forever with no drag and no input', () => {
    let s = withVelocity(ship(), 60, -25);
    for (let i = 0; i < 500; i++) s = stepFlight(s, IDLE, CFG, 1 / 60, BOUNDS);
    expect(s.vx).toBeCloseTo(60, 6);
    expect(s.vy).toBeCloseTo(-25, 6);
  });

  it('bleeds speed when drag is configured', () => {
    const draggy = { ...CFG, drag: 1 };
    let s = withVelocity(ship(), 100, 0);
    for (let i = 0; i < 60; i++) s = stepFlight(s, IDLE, draggy, 1 / 60, BOUNDS);
    expect(speedOf(s)).toBeLessThan(100);
    expect(speedOf(s)).toBeGreaterThan(0);
  });

  it('turning while coasting does not change velocity', () => {
    const moving = withVelocity(ship(), 80, 0);
    const after = stepFlight(moving, { ...IDLE, turnRight: true }, CFG, 0.5, BOUNDS);
    expect(after.vx).toBeCloseTo(80, 6);
    expect(after.vy).toBeCloseTo(0, 6);
    expect(after.facing).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('limits and wrapping', () => {
  it('clamps to max speed', () => {
    const capped = { ...CFG, maxSpeed: 120 };
    let s = ship();
    for (let i = 0; i < 600; i++) s = stepFlight(s, { ...IDLE, thrust: true }, capped, 1 / 60, BOUNDS);
    expect(speedOf(s)).toBeCloseTo(120, 4);
  });

  it('wraps position around the field', () => {
    const s = stepFlight(withVelocity({ ...ship(), x: 790 }, 100, 0), IDLE, CFG, 1, BOUNDS);
    expect(s.x).toBeCloseTo(90, 6);
  });

  it('never mutates the input state', () => {
    const before = ship();
    const snapshot = { ...before };
    stepFlight(before, { ...IDLE, thrust: true, turnRight: true }, CFG, 1, BOUNDS);
    expect(before).toEqual(snapshot);
  });
});
