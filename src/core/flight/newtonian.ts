/**
 * Newtonian rotate-and-thrust flight, Subspace/Continuum style.
 *
 * The ship's facing and its velocity are independent. Turning changes where the
 * nose points and nothing else; thrust accelerates along the nose. Nothing
 * slows you down but thrusting the other way, so you fly by planning your
 * momentum rather than by steering it.
 *
 * Pure and framework-free: scenes own the sprite, this owns the physics.
 */

export interface FlightConfig {
  /** Turn rate in degrees per second. */
  rotationSpeedDeg: number;
  /** Forward acceleration along the facing, px/s². */
  thrustAccel: number;
  /** Reverse thrust as a fraction of forward — backing up is always weaker. */
  reverseScale: number;
  /**
   * Velocity lost per second. 0 is literally frictionless (true Continuum);
   * a small value keeps a drifting ship from being a chore to recover.
   */
  drag: number;
  maxSpeed: number;
  /** Collision radius of the hull. */
  shipRadius: number;
}

export interface FlightInput {
  thrust: boolean;
  reverse: boolean;
  turnLeft: boolean;
  turnRight: boolean;
}

export interface FlightState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Facing in radians; 0 points along +x. Independent of velocity. */
  facing: number;
}

export interface FlightBounds {
  width: number;
  height: number;
}

const TAU = Math.PI * 2;

/** Wrap a value into [0, span). */
export function wrap(value: number, span: number): number {
  if (span <= 0) return 0;
  const r = value % span;
  return r < 0 ? r + span : r;
}

export function speedOf(state: FlightState): number {
  return Math.hypot(state.vx, state.vy);
}

export function newFlightState(x: number, y: number, facing = -Math.PI / 2): FlightState {
  return { x, y, vx: 0, vy: 0, facing };
}

/**
 * Advance one frame. Returns a new state; never mutates the input.
 *
 * Holding thrust and reverse together cancels, which is the physically honest
 * result and cheaper to reason about than picking a winner.
 */
export function stepFlight(
  state: FlightState,
  input: FlightInput,
  cfg: FlightConfig,
  dt: number,
  bounds: FlightBounds,
): FlightState {
  const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
  const facing = wrap(state.facing + turn * (cfg.rotationSpeedDeg * (Math.PI / 180)) * dt, TAU);

  const forward = input.thrust ? cfg.thrustAccel : 0;
  const back = input.reverse ? cfg.thrustAccel * cfg.reverseScale : 0;
  const accel = forward - back;

  let vx = state.vx + Math.cos(facing) * accel * dt;
  let vy = state.vy + Math.sin(facing) * accel * dt;

  if (cfg.drag > 0) {
    const keep = Math.max(0, 1 - cfg.drag * dt);
    vx *= keep;
    vy *= keep;
  }

  const speed = Math.hypot(vx, vy);
  if (speed > cfg.maxSpeed) {
    vx = (vx / speed) * cfg.maxSpeed;
    vy = (vy / speed) * cfg.maxSpeed;
  }

  return {
    x: wrap(state.x + vx * dt, bounds.width),
    y: wrap(state.y + vy * dt, bounds.height),
    vx,
    vy,
    facing,
  };
}

/** Replace velocity outright — collision knockback, respawn, etc. */
export function withVelocity(state: FlightState, vx: number, vy: number): FlightState {
  return { ...state, vx, vy };
}
