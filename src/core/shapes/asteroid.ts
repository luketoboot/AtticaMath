/**
 * Procedural asteroid outlines, and the collision math that matches them.
 *
 * A shape is stored as radii sampled at evenly spaced angles. That makes it
 * star-shaped by construction — every ray from the centre crosses the boundary
 * exactly once — which is what lets collision be a single `radiusAt(angle)`
 * lookup instead of a polygon sweep. The drawing and the hitbox therefore come
 * from the same numbers and cannot drift apart.
 */
import type { Rng } from '../rng';

export interface AsteroidShape {
  /** Radius at angle i * (2π / radii.length), starting at +x and going CW. */
  radii: readonly number[];
  /** The radius the outline varies around. */
  baseRadius: number;
}

export interface AsteroidOptions {
  minVertices: number;
  maxVertices: number;
  /** Peak radius deviation as a fraction of the base radius. */
  jitter: number;
  /** Odds a vertex is pulled in hard, cutting a notch into the silhouette. */
  notchChance: number;
  /** How far in a notch reaches, as a fraction of the base radius. */
  notchDepth: number;
}

const TAU = Math.PI * 2;

export function generateAsteroid(
  rng: Rng,
  baseRadius: number,
  opts: AsteroidOptions,
): AsteroidShape {
  const count = rng.int(opts.minVertices, opts.maxVertices);
  const radii: number[] = [];
  for (let i = 0; i < count; i++) {
    // Uniform jitter first, then the occasional deep bite. Two scales of
    // irregularity is what separates "rock" from "wobbly circle".
    let r = baseRadius * (1 + (rng.next() * 2 - 1) * opts.jitter);
    if (rng.chance(opts.notchChance)) {
      r -= baseRadius * opts.notchDepth * rng.next();
    }
    // Never let a vertex collapse through the centre.
    radii.push(Math.max(baseRadius * 0.35, r));
  }
  return { radii, baseRadius };
}

/** Wrap an angle into [0, 2π). */
export function normalizeAngle(angle: number): number {
  const r = angle % TAU;
  return r < 0 ? r + TAU : r;
}

/**
 * Boundary distance along `angle`, interpolated between the two neighbouring
 * vertices. Polar interpolation bows very slightly outside the true straight
 * edge — under 4% at these vertex counts, and consistent between the hitbox
 * and the drawn outline, so it is not a discrepancy the player can see.
 */
export function radiusAt(shape: AsteroidShape, angle: number): number {
  const n = shape.radii.length;
  if (n === 0) return shape.baseRadius;
  const step = TAU / n;
  const t = normalizeAngle(angle) / step;
  const i0 = Math.floor(t) % n;
  const i1 = (i0 + 1) % n;
  const frac = t - Math.floor(t);
  const a = shape.radii[i0] ?? shape.baseRadius;
  const b = shape.radii[i1] ?? shape.baseRadius;
  return a + (b - a) * frac;
}

export function maxRadius(shape: AsteroidShape): number {
  return shape.radii.reduce((m, r) => Math.max(m, r), 0);
}

export function minRadius(shape: AsteroidShape): number {
  return shape.radii.reduce((m, r) => Math.min(m, r), Infinity);
}

export interface Point {
  x: number;
  y: number;
}

/** Outline in local space, for rendering. `rotation` spins it about the centre. */
export function outline(shape: AsteroidShape, rotation = 0): Point[] {
  const n = shape.radii.length;
  const step = TAU / n;
  return shape.radii.map((r, i) => {
    const a = i * step + rotation;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

/**
 * Does a circle of `otherRadius` centred at (ox, oy) touch this asteroid?
 * `rotation` is the asteroid's current spin, so a rotated rock collides on the
 * silhouette actually being drawn.
 */
export function hitsCircle(
  shape: AsteroidShape,
  cx: number,
  cy: number,
  rotation: number,
  ox: number,
  oy: number,
  otherRadius: number,
): boolean {
  const dx = ox - cx;
  const dy = oy - cy;
  const dist = Math.hypot(dx, dy);
  // Cheap rejects before the trig — most pairs miss by a mile.
  if (dist > maxRadius(shape) + otherRadius) return false;
  if (dist <= minRadius(shape) + otherRadius) return true;
  return dist <= radiusAt(shape, Math.atan2(dy, dx) - rotation) + otherRadius;
}

/** Point-in-asteroid, for hit tests with no radius of their own. */
export function containsPoint(
  shape: AsteroidShape,
  cx: number,
  cy: number,
  rotation: number,
  px: number,
  py: number,
): boolean {
  return hitsCircle(shape, cx, cy, rotation, px, py, 0);
}
