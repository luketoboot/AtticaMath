/**
 * Drawing the player ship from an equipped hull.
 *
 * One painter for every flight mode and the hangar preview, so a hull cannot
 * look like one thing in the shop and another in the game. The colour is passed
 * in rather than read from the hull: Collapse needs the hull to carry which gun
 * is loaded, and that state has to win over a cosmetic.
 *
 * Outlines are in units of the ship radius, so a bought silhouette never
 * changes the collision circle. Looking different is the entire product; being
 * bigger would be an advantage, and advantages are not for sale.
 */
import Phaser from 'phaser';
import { PALETTE } from '../fx/palette';
import type { HullDef, TrailDef } from '../core/cosmetics/cosmetics';

function points(
  outline: readonly (readonly [number, number])[],
  radius: number,
): Phaser.Math.Vector2[] {
  return outline.map(([x, y]) => new Phaser.Math.Vector2(x * radius, y * radius));
}

/**
 * Repaint `g` as the given hull, nose up, centred on its origin.
 *
 * Clears first, so this doubles as the recolour path — Collapse calls it on
 * every gun swap.
 */
export function drawHull(
  g: Phaser.GameObjects.Graphics,
  hull: HullDef,
  color: number,
  radius: number,
): void {
  g.clear();
  const shape = points(hull.outline, radius);
  g.fillStyle(color, 1);
  g.fillPoints(shape, true);
  // A dark core keeps the silhouette readable against a bright rock.
  g.fillStyle(PALETTE.black, 0.85);
  g.fillPoints(points(hull.outline, radius * 0.46), true);
  g.lineStyle(2, color, 1);
  g.strokePoints(shape, true);

  if (hull.detail) {
    g.lineStyle(2, PALETTE.white, 0.75);
    g.strokePoints(points(hull.detail, radius), hull.detail.length > 2);
  }
}

/** Repaint `g` as the engine burn for a trail, pointing back from the hull. */
export function drawFlame(g: Phaser.GameObjects.Graphics, trail: TrailDef, radius: number): void {
  g.clear();
  g.fillStyle(trail.flame, 1);
  g.fillTriangle(-radius * 0.44, radius, radius * 0.44, radius, 0, radius * 2.1);
  g.fillStyle(trail.spark, 1);
  g.fillTriangle(-radius * 0.22, radius, radius * 0.22, radius, 0, radius * 1.6);
}
