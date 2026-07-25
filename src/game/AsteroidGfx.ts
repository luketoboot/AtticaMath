import Phaser from 'phaser';
import { outline, type AsteroidShape } from '../core/shapes/asteroid';

export interface AsteroidPaint {
  stroke: number;
  strokeWidth: number;
  strokeAlpha: number;
  fill: number;
  fillAlpha: number;
  /** Faint interior facet lines — makes a silhouette read as rock, not a hole. */
  facets?: boolean;
}

/**
 * Draw an asteroid outline into a Graphics object at local origin.
 *
 * Redrawn rather than tinted because the stroke colour carries game state
 * (locked, armed, rejected) and Graphics has no setStrokeStyle to mutate after
 * the fact. The vertex count is small enough that a redraw per state change is
 * far cheaper than keeping several objects in sync.
 */
export function paintAsteroid(
  gfx: Phaser.GameObjects.Graphics,
  shape: AsteroidShape,
  paint: AsteroidPaint,
): void {
  const points = outline(shape);
  gfx.clear();

  gfx.fillStyle(paint.fill, paint.fillAlpha);
  gfx.beginPath();
  gfx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) gfx.lineTo(points[i]!.x, points[i]!.y);
  gfx.closePath();
  gfx.fillPath();

  if (paint.facets) {
    // A couple of chords across the interior. Cheap suggestion of relief
    // without needing shading or a second draw pass.
    gfx.lineStyle(1, paint.stroke, paint.strokeAlpha * 0.35);
    const n = points.length;
    for (let i = 0; i < n; i += 3) {
      const a = points[i]!;
      const b = points[(i + Math.floor(n / 2)) % n]!;
      gfx.lineBetween(a.x * 0.55, a.y * 0.55, b.x * 0.45, b.y * 0.45);
    }
  }

  gfx.lineStyle(paint.strokeWidth, paint.stroke, paint.strokeAlpha);
  gfx.beginPath();
  gfx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) gfx.lineTo(points[i]!.x, points[i]!.y);
  gfx.closePath();
  gfx.strokePath();
}
