import Phaser from 'phaser';
import { PALETTE } from '../fx/palette';

/**
 * The POLARITY interceptor.
 *
 * Every other ship in the game is drawn from the shared cosmetic hulls, because
 * every other ship rotates — a silhouette that has to read at any angle can
 * only ever be a symmetrical arrowhead. This one never turns. The field comes
 * down at it and it strafes, so it can be drawn as an actual top-down fighter,
 * with a nose, a cockpit, swept wings and engines at the back that always point
 * the same way.
 *
 * The hull is built in layers rather than as one outline, which is most of what
 * separates a shape from a ship: a dark body so it reads as solid against the
 * starfield, a bright neon edge, a spine highlight catching the light down the
 * middle, and a cockpit that is the only white thing on screen. The worn
 * divisor tints the edge; the other one lives on the wing chevrons, so a flip
 * looks like the ship swapping which half of itself is live rather than like a
 * recolour.
 */

export interface HullStyle {
  /** The polarity currently worn — the loud colour. */
  colour: number;
  /** The polarity not worn, carried as an inert accent. */
  other: number;
  radius: number;
}

type Pt = readonly [number, number];

/** Nose-up, in units of the collision radius. */
const OUTLINE: readonly Pt[] = [
  [0, -1.62], // nose
  [0.2, -1.0],
  [0.34, -0.36],
  [1.24, 0.34], // wing leading edge
  [1.3, 0.72],
  [0.72, 0.62],
  [0.5, 0.96], // engine shoulder
  [0.22, 0.86],
  [0, 1.02], // tail notch
  [-0.22, 0.86],
  [-0.5, 0.96],
  [-0.72, 0.62],
  [-1.3, 0.72],
  [-1.24, 0.34],
  [-0.34, -0.36],
  [-0.2, -1.0],
];

/** The lit strip down the spine, which is what gives the hull a top face. */
const SPINE: readonly Pt[] = [
  [0, -1.44],
  [0.15, -0.5],
  [0.12, 0.62],
  [-0.12, 0.62],
  [-0.15, -0.5],
];

const COCKPIT: readonly Pt[] = [
  [0, -1.04],
  [0.17, -0.66],
  [0.11, -0.22],
  [-0.11, -0.22],
  [-0.17, -0.66],
];

/** Chevrons on each wing, worn in the polarity the ship is *not* using. */
const CHEVRON: readonly Pt[] = [
  [0.55, 0.16],
  [1.02, 0.52],
  [0.92, 0.58],
  [0.5, 0.28],
];

function poly(pts: readonly Pt[], r: number): Phaser.Geom.Point[] {
  return pts.map(([x, y]) => new Phaser.Geom.Point(x * r, y * r));
}

function mirrored(pts: readonly Pt[]): Pt[] {
  return pts.map(([x, y]) => [-x, y] as Pt);
}

/** Paint the hull. Static per polarity — only redraw when the state changes. */
export function drawPolarityHull(g: Phaser.GameObjects.Graphics, style: HullStyle): void {
  const { colour, other, radius: r } = style;
  g.clear();

  // A wide, faint bloom so the ship sits in its own light rather than on top of
  // the starfield. Three rings rather than one, so the falloff is smooth.
  for (const [scale, alpha] of [[2.6, 0.05], [1.9, 0.07], [1.35, 0.1]] as const) {
    g.fillStyle(colour, alpha);
    g.fillCircle(0, 0, r * scale);
  }

  // Body: near-black, faintly tinted, so the neon edge has something to sit on.
  g.fillStyle(PALETTE.black, 0.92);
  g.fillPoints(poly(OUTLINE, r), true);
  g.fillStyle(colour, 0.16);
  g.fillPoints(poly(OUTLINE, r), true);

  // Wing chevrons in the other polarity: the half of the ship that is asleep.
  g.fillStyle(other, 0.5);
  g.fillPoints(poly(CHEVRON, r), true);
  g.fillPoints(poly(mirrored(CHEVRON), r), true);

  // The spine, lit brighter than the body — a top face, not a flat sticker.
  g.fillStyle(colour, 0.32);
  g.fillPoints(poly(SPINE, r), true);

  // Neon edge last, so nothing paints over it.
  g.lineStyle(2.2, colour, 1);
  g.strokePoints(poly(OUTLINE, r), true, true);

  // Cockpit, in the worn colour rather than white. White is spent entirely on
  // the hitbox core: the one mark that has to be unambiguous cannot be sharing
  // its colour with a decorative panel two pixels away.
  g.fillStyle(colour, 0.5);
  g.fillPoints(poly(COCKPIT, r * 1.12), true);
  g.fillStyle(colour, 1);
  g.fillPoints(poly(COCKPIT, r), true);
}

export interface EngineState {
  colour: number;
  radius: number;
  /** 0 when coasting, 1 under full forward thrust. */
  thrust: number;
  /** −1 hard left, +1 hard right — drives the manoeuvring jets. */
  strafe: number;
  /** Seconds, for the flicker. */
  time: number;
}

/**
 * Engine wash, redrawn every frame.
 *
 * Two mains at the rear that idle and flare, plus a jet on the side opposite
 * the direction of travel. The side jets are the tell that makes strafing feel
 * like a thing the ship is doing rather than the sprite being moved.
 */
export function drawPolarityEngine(g: Phaser.GameObjects.Graphics, s: EngineState): void {
  const { colour, radius: r, thrust, strafe, time } = s;
  g.clear();

  const flicker = 0.86 + Math.sin(time * 38) * 0.09 + Math.sin(time * 23.7) * 0.05;
  const len = r * (0.5 + thrust * 1.15) * flicker;

  for (const side of [-1, 1]) {
    const x = side * r * 0.34;
    const y = r * 0.9;
    g.fillStyle(colour, 0.5);
    g.fillTriangle(x - r * 0.19, y, x + r * 0.19, y, x, y + len);
    g.fillStyle(PALETTE.white, 0.5 + thrust * 0.35);
    g.fillTriangle(x - r * 0.08, y, x + r * 0.08, y, x, y + len * 0.5);
  }

  if (Math.abs(strafe) > 0.01) {
    // Fires from the trailing side, pushing the ship the way it is going.
    const x = -Math.sign(strafe) * r * 1.2;
    const puff = r * 0.42 * Math.abs(strafe) * flicker;
    g.fillStyle(colour, 0.42);
    g.fillTriangle(x, r * 0.3, x, r * 0.62, x - Math.sign(strafe) * puff, r * 0.46);
  }
}

/**
 * The hitbox, painted on.
 *
 * The hull is three times the size of the thing that can actually be shot, and
 * a player who cannot see which is which will read every near miss as a bug.
 * Bullet hells solve this by showing the core, and so does this: a hard white
 * dot inside a ring at exactly the collision radius, breathing slightly so it
 * reads as live rather than as a smudge on the glass.
 */
export function drawHitCore(
  g: Phaser.GameObjects.Graphics,
  colour: number,
  hitRadius: number,
  time: number,
): void {
  g.clear();
  const breathe = 1 + Math.sin(time * 3.4) * 0.08;
  g.lineStyle(1.5, colour, 0.55);
  g.strokeCircle(0, 0, hitRadius * breathe);
  g.fillStyle(PALETTE.white, 0.9);
  g.fillCircle(0, 0, hitRadius * 0.42);
  g.fillStyle(colour, 0.35);
  g.fillCircle(0, 0, hitRadius * 0.75);
}

/**
 * A flash at the muzzles, decaying over its own short life.
 *
 * `age` is seconds since the shot left. Held fire at seven a second means this
 * is almost always lit, which is the point — a gun with no muzzle is a gun the
 * player has to take on trust from the bolts alone.
 */
export function drawMuzzle(
  g: Phaser.GameObjects.Graphics,
  colour: number,
  radius: number,
  age: number,
  life: number,
): void {
  g.clear();
  if (age >= life) return;
  const k = 1 - age / life;
  const y = -radius * 1.15;
  for (const side of [-1, 1]) {
    const x = side * radius * 0.3;
    g.fillStyle(PALETTE.white, 0.85 * k);
    g.fillCircle(x, y, radius * 0.17 * k);
    g.fillStyle(colour, 0.5 * k);
    g.fillCircle(x, y, radius * 0.34 * k);
  }
}

/**
 * The glyph on a weapon pod.
 *
 * A pod used to wear the first letter of its gun, which for SPREAD, SEEKER and
 * a screen-clear all beginning with S was no help at all. A pickup has to be
 * readable while it is falling past you in a firefight, and by then the player
 * has no time to read a word — so each of these is a small diagram of what the
 * gun *does* to the space in front of the ship.
 *
 *   GATLING  a stack of short bars: rate, nothing else
 *   SPREAD   three lines diverging from one point
 *   LANCE    one long line straight through a barrier
 *   SEEKER   a line that bends toward a dot it has picked out
 */
export function drawGunGlyph(
  g: Phaser.GameObjects.Graphics,
  kind: string,
  r: number,
  colour: number,
): void {
  g.clear();
  g.lineStyle(2.2, colour, 1);

  if (kind === 'gatling') {
    for (let i = 0; i < 4; i++) {
      const y = -r * 0.62 + i * r * 0.42;
      g.lineBetween(-r * 0.34, y, r * 0.34, y);
    }
    return;
  }

  if (kind === 'spread') {
    const from: [number, number] = [0, r * 0.72];
    for (const dx of [-0.62, 0, 0.62]) {
      g.lineBetween(from[0], from[1], dx * r, -r * 0.72);
    }
    g.fillStyle(colour, 1);
    g.fillCircle(from[0], from[1], r * 0.11);
    return;
  }

  if (kind === 'lance') {
    // A bar with the shot going clean through it, which is the whole pitch.
    g.lineStyle(2.6, colour, 0.45);
    g.lineBetween(-r * 0.6, 0, r * 0.6, 0);
    g.lineStyle(2.6, colour, 1);
    g.lineBetween(0, r * 0.8, 0, -r * 0.85);
    g.fillStyle(colour, 1);
    g.fillTriangle(0, -r * 0.95, -r * 0.2, -r * 0.6, r * 0.2, -r * 0.6);
    return;
  }

  if (kind === 'seeker') {
    g.beginPath();
    g.moveTo(-r * 0.1, r * 0.8);
    g.lineTo(-r * 0.1, r * 0.1);
    g.lineTo(r * 0.55, -r * 0.5);
    g.strokePath();
    g.fillStyle(colour, 1);
    g.fillCircle(r * 0.62, -r * 0.66, r * 0.18);
    return;
  }

  // BOLT, and the fallback: one shot, straight up.
  g.lineBetween(0, r * 0.7, 0, -r * 0.5);
  g.fillStyle(colour, 1);
  g.fillTriangle(0, -r * 0.85, -r * 0.22, -r * 0.42, r * 0.22, -r * 0.42);
}

/**
 * The polarity ring: two arcs rather than a circle.
 *
 * A closed ring reads as decoration. A broken one reads as a field being held,
 * and it can spin — which gives the ship something alive about it while the
 * player is sitting still reading numbers. It stutters and dims while the swap
 * lockout runs, so the one moment the ship cannot flip is visible on the ship
 * rather than only in the HUD.
 */
export function drawPolarityRing(
  g: Phaser.GameObjects.Graphics,
  colour: number,
  radius: number,
  locked: boolean,
  time: number,
): void {
  g.clear();
  const spin = time * (locked ? 7.5 : 1.4);
  const sweep = locked ? 0.5 : 1.05;
  const alpha = locked ? 0.4 : 0.9;
  const rr = radius * (locked ? 1.5 : 1.62);

  g.lineStyle(2, colour, alpha);
  for (const base of [0, Math.PI]) {
    g.beginPath();
    g.arc(0, 0, rr, base + spin, base + spin + sweep, false);
    g.strokePath();
  }

  // Tick marks at the arc ends, so the ring has a made object's detail.
  g.lineStyle(2, colour, alpha * 0.7);
  for (const base of [0, Math.PI]) {
    for (const a of [base + spin, base + spin + sweep]) {
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      g.lineBetween(cx * rr * 0.86, cy * rr * 0.86, cx * rr * 1.12, cy * rr * 1.12);
    }
  }
}
