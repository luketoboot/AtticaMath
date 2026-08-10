/**
 * POLARITY movement: direct, eight-way, clamped.
 *
 * The game already has a flight model, and it is the wrong one here. Factor
 * Storm and Collapse are Newtonian — you carry momentum, you drift, and the
 * arena wraps — which suits a field you are hunting through. This mode is a
 * field that is coming at you, and a ship that keeps moving after the key is
 * released turns a misread into an unavoidable one. Threading a gap has to be
 * a thing the player can simply do.
 *
 * So: no inertia, no wrap. The screen edge is a wall, because a ship that
 * reappears on the far side has teleported out of a pattern that was authored
 * to be survivable where it stood.
 *
 * Pure.
 */

export interface DriveConfig {
  /** Pixels per second along an axis. */
  speed: number;
  /** Collision radius, also the margin kept from the wall. */
  radius: number;
  /**
   * How quickly the ship reaches the speed being asked of it, as a time
   * constant in seconds. Roughly: it covers two thirds of the gap to the target
   * velocity in this long.
   *
   * Zero would be the honest digital control — full speed on the frame the key
   * goes down, dead stop on the frame it comes up — and it reads as broken. At
   * 780 px/s the snap is violent enough that the ship appears to jump rather
   * than travel, and the eye loses it between two positions that were never
   * joined up. A small constant fixes that without becoming momentum: the glide
   * after release is a few dozen pixels, not the long coast the Newtonian modes
   * fly on, so a gap the player aimed at is still a gap they land in.
   */
  smoothing: number;
}

export interface DriveBounds {
  width: number;
  height: number;
}

export interface DriveState {
  x: number;
  y: number;
  /** Current velocity, eased toward whatever the keys are asking for. */
  vx: number;
  vy: number;
}

export interface DriveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export function newDriveState(bounds: DriveBounds): DriveState {
  return { x: bounds.width / 2, y: bounds.height * 0.78, vx: 0, vy: 0 };
}

/**
 * Advance one frame.
 *
 * Diagonals are normalised on the *target* velocity. Without it, holding two
 * keys is a free 41% of speed along the most useful direction there is, and
 * every good player would spend the whole run travelling at forty-five degrees.
 *
 * The ease toward that target uses `1 - exp(-dt/tau)` rather than a fixed step
 * per frame, which makes the result identical whether it arrives in one long
 * frame or six short ones. A ship that accelerates faster on a better machine
 * is a ship whose difficulty depends on the hardware.
 */
export function stepDrive(
  state: DriveState,
  input: DriveInput,
  cfg: DriveConfig,
  dt: number,
  bounds: DriveBounds,
): DriveState {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const mag = Math.hypot(dx, dy);
  const targetX = mag === 0 ? 0 : (dx / mag) * cfg.speed;
  const targetY = mag === 0 ? 0 : (dy / mag) * cfg.speed;

  const tau = cfg.smoothing;
  const k = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
  const vx = state.vx + (targetX - state.vx) * k;
  const vy = state.vy + (targetY - state.vy) * k;

  // The displacement of an exponential ease has a closed form, so use it rather
  // than approximating the area with the step's endpoints. Both the velocity
  // and the *distance* then come out identical however the frame is chopped up,
  // which matters here: waves are authored against positions, and a machine
  // dropping frames must not fly a different ship.
  const travel = (v0: number, target: number): number =>
    tau <= 0 ? target * dt : target * dt + (v0 - target) * tau * k;

  const x = clamp(state.x + travel(state.vx, targetX), cfg.radius, bounds.width - cfg.radius);
  const y = clamp(state.y + travel(state.vy, targetY), cfg.radius, bounds.height - cfg.radius);

  return {
    x,
    y,
    // Kill the velocity that is driving the ship into a wall, or it banks up
    // there and the ship lurches when the player finally turns around.
    vx: (x <= cfg.radius && vx < 0) || (x >= bounds.width - cfg.radius && vx > 0) ? 0 : vx,
    vy: (y <= cfg.radius && vy < 0) || (y >= bounds.height - cfg.radius && vy > 0) ? 0 : vy,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Whether a mote was ever a decision.
 *
 * A mote that crossed the screen while the ship was pinned on the far side was
 * never something the player chose to leave alone, and grading it as a refusal
 * would charge them for a judgement they had no chance to make. The corridor is
 * generous on purpose — it exists to exclude the impossible, not to draw a fine
 * line around the difficult.
 */
export function wasReachable(
  closestApproach: number,
  secondsOnScreen: number,
  cfg: DriveConfig,
  graceRadius: number,
): boolean {
  return closestApproach <= graceRadius + cfg.speed * secondsOnScreen;
}
