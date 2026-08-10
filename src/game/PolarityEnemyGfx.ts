import Phaser from 'phaser';
import { PALETTE } from '../fx/palette';
import type { MoteClass } from '../core/polarity/signal';

/**
 * Carriers and their fire.
 *
 * These started as a circle, a diamond, a hexagon and a spiky ball, which is
 * how you draw four classes when the classes are the only thing you care about.
 * It reads, and it reads as a spreadsheet: a field of outlined shapes wearing
 * numbers, with nothing on screen that looks like it wants anything.
 *
 * So each class is a *craft* now, built around the silhouette it already had so
 * the class is still legible at a glance and in a still frame. The shape keeps
 * doing the accessibility work — about one man in twelve cannot separate these
 * hues at speed, and a mode whose whole content is "which kind is this" cannot
 * put that on hue alone — and the character is added on top of it rather than
 * in place of it.
 *
 *   HUNTER (÷a)     a round-shouldered gunship with two side pods and a lit eye
 *   DART   (÷b)     an angular interceptor, all nose and swept fins
 *   WARDEN (both)   a heavy twin-core hexagon, because a bridge belongs to two
 *                   fields at once and should look like it is holding both
 *
 * The number always sits in a cleared, darkened well at the middle, because the
 * number is the thing being read and detail around it is decoration.
 */

export const CLASS_COLOR: Record<MoteClass, number> = {
  aOnly: PALETTE.cyan,
  bOnly: PALETTE.magentaHot,
  bridge: PALETTE.yellow,
  neither: PALETTE.deepPurple,
};

type Pt = readonly [number, number];

function poly(pts: readonly Pt[], r: number): Phaser.Geom.Point[] {
  return pts.map(([x, y]) => new Phaser.Geom.Point(x * r, y * r));
}

const HUNTER: readonly Pt[] = [
  [0, -0.92],
  [0.5, -0.7],
  [0.66, -0.2],
  [1.18, 0.06],
  [1.06, 0.4],
  [0.56, 0.34],
  [0.42, 0.78],
  [0, 0.98],
  [-0.42, 0.78],
  [-0.56, 0.34],
  [-1.06, 0.4],
  [-1.18, 0.06],
  [-0.66, -0.2],
  [-0.5, -0.7],
];

const DART: readonly Pt[] = [
  [0, -1.15],
  [0.3, -0.36],
  [1.1, 0.1],
  [0.72, 0.28],
  [0.34, 0.24],
  [0.16, 0.95],
  [-0.16, 0.95],
  [-0.34, 0.24],
  [-0.72, 0.28],
  [-1.1, 0.1],
  [-0.3, -0.36],
];

function hexagon(r: number): Phaser.Geom.Point[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const th = (Math.PI / 3) * i - Math.PI / 2;
    pts.push([Math.cos(th), Math.sin(th)]);
  }
  return poly(pts, r);
}

/**
 * Paint a carrier. `phase` is seconds, for the parts that breathe.
 *
 * Redrawn only when something about it changes — class, damage — rather than
 * every frame, so a field of thirty of these costs nothing.
 */
export function drawCarrier(
  g: Phaser.GameObjects.Graphics,
  cls: MoteClass,
  r: number,
  hurt: boolean,
): void {
  const colour = CLASS_COLOR[cls];
  g.clear();

  // A dark body under everything, so the neon has something to sit on and the
  // number well reads as cut into a solid object.
  const body = cls === 'aOnly' ? poly(HUNTER, r) : cls === 'bOnly' ? poly(DART, r) : hexagon(r * 1.04);

  g.fillStyle(PALETTE.black, 0.9);
  g.fillPoints(body, true);
  g.fillStyle(colour, hurt ? 0.34 : 0.2);
  g.fillPoints(body, true);
  g.lineStyle(2.6, colour, 1);
  g.strokePoints(body, true, true);

  if (cls === 'aOnly') {
    // Side pods and a single lit eye above the number: a gunship, watching.
    g.fillStyle(colour, 0.85);
    g.fillCircle(-r * 0.95, r * 0.22, r * 0.15);
    g.fillCircle(r * 0.95, r * 0.22, r * 0.15);
    g.lineStyle(2, colour, 0.9);
    g.strokeCircle(0, -r * 0.52, r * 0.17);
    g.fillStyle(PALETTE.white, 0.9);
    g.fillCircle(0, -r * 0.52, r * 0.08);
  } else if (cls === 'bOnly') {
    // A blade down the nose and two vents: all forward, nothing defensive.
    g.lineStyle(2, colour, 0.8);
    g.lineBetween(0, -r * 1.0, 0, -r * 0.42);
    g.fillStyle(colour, 0.75);
    g.fillRect(-r * 0.62, r * 0.1, r * 0.22, r * 0.1);
    g.fillRect(r * 0.4, r * 0.1, r * 0.22, r * 0.1);
  } else if (cls === 'bridge') {
    // Two cores, because it belongs to both fields and is the only thing here
    // that does. The inner ring ties them together.
    g.lineStyle(2, colour, 0.7);
    g.strokeCircle(0, 0, r * 0.74);
    for (const side of [-1, 1]) {
      g.fillStyle(colour, 0.9);
      g.fillCircle(side * r * 0.62, -r * 0.36, r * 0.13);
    }
  } else {
    // Wilds: a mine, all barbs and no face. Nothing to negotiate with.
    g.lineStyle(2, colour, 0.9);
    for (let i = 0; i < 8; i++) {
      const th = (Math.PI / 4) * i;
      g.lineBetween(Math.cos(th) * r * 0.8, Math.sin(th) * r * 0.8, Math.cos(th) * r * 1.15, Math.sin(th) * r * 1.15);
    }
  }

  // The number's well, cut last so nothing paints into it.
  g.fillStyle(PALETTE.black, 0.72);
  g.fillCircle(0, cls === 'bOnly' ? r * 0.05 : 0, r * 0.56);
}

/**
 * Paint a bullet.
 *
 * Smaller, faster and far more numerous than carriers, so these keep the plain
 * silhouettes — a pellet, a shard, a star, a barb — and spend their detail on a
 * bright core instead. A bullet has to be identifiable in peripheral vision at
 * a glance, which is a different job from having a personality.
 */
export function drawBullet(g: Phaser.GameObjects.Graphics, cls: MoteClass, r: number): void {
  const colour = CLASS_COLOR[cls];
  g.clear();

  // The halo: what makes a CAVE bullet visible against a busy field.
  g.fillStyle(colour, 0.18);
  g.fillCircle(0, 0, r * 1.35);

  if (cls === 'aOnly') {
    g.fillStyle(colour, 0.34);
    g.fillCircle(0, 0, r);
    g.lineStyle(2.4, colour, 1);
    g.strokeCircle(0, 0, r);
  } else if (cls === 'bOnly') {
    const shard: Pt[] = [[0, -1.25], [0.82, 0], [0, 1.25], [-0.82, 0]];
    g.fillStyle(colour, 0.34);
    g.fillPoints(poly(shard, r), true);
    g.lineStyle(2.4, colour, 1);
    g.strokePoints(poly(shard, r), true, true);
  } else if (cls === 'bridge') {
    const star: Pt[] = [];
    for (let i = 0; i < 12; i++) {
      const th = (Math.PI / 6) * i - Math.PI / 2;
      const rr = i % 2 === 0 ? 1.2 : 0.72;
      star.push([Math.cos(th) * rr, Math.sin(th) * rr]);
    }
    g.fillStyle(colour, 0.32);
    g.fillPoints(poly(star, r), true);
    g.lineStyle(2.2, colour, 1);
    g.strokePoints(poly(star, r), true, true);
  } else {
    const barb: Pt[] = [];
    for (let i = 0; i < 10; i++) {
      const th = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 === 0 ? 1.18 : 0.6;
      barb.push([Math.cos(th) * rr, Math.sin(th) * rr]);
    }
    g.fillStyle(colour, 0.24);
    g.fillPoints(poly(barb, r), true);
    g.lineStyle(2.2, colour, 1);
    g.strokePoints(poly(barb, r), true, true);
  }

  // A dark well again, so the number stays readable over the fill.
  g.fillStyle(PALETTE.black, 0.6);
  g.fillCircle(0, 0, r * 0.66);
}
